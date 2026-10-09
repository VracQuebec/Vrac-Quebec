// Deno edge function — Réparation ciblée des pages SEO.
// Régénère UNE page précise (ville × matériau/service) ou toutes les pages
// réellement en erreur d'une ville. Aucune page valide n'est touchée,
// aucun doublon n'est créé. Une réparation exige une confirmation explicite.
// Chaque tentative est journalisée dans seo_page_tasks (historique conservé).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Slot = {
  city_slug: string;
  material_slug: string | null;
  service_slug: string | null;
  label: string;
  gen_state: string;
  page_id: string | null;
};

function functionsBase(): string {
  return Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co").replace(/\/$/, "");
}

async function generate(slot: Slot): Promise<{ ok: boolean; error?: string }> {
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await fetch(`${functionsBase()}/seo-generate-page`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${svc}`, apikey: svc },
      body: JSON.stringify({
        city_slug: slot.city_slug,
        material_slug: slot.material_slug,
        service_slug: slot.service_slug,
        force: true,
        confirm_overwrite: true,
        publish: false,
      }),
    });
    const text = await resp.text();
    let data: Record<string, unknown> | null = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!resp.ok) return { ok: false, error: String(data?.error ?? text).slice(0, 900) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function processSlot(sb: SupabaseClient, slot: Slot) {
  let active = sb.from("seo_page_tasks").select("id,status", { count: "exact", head: false })
    .eq("city_slug", slot.city_slug).in("status", ["queued", "running"]);
  active = slot.material_slug ? active.eq("material_slug", slot.material_slug) : active.is("material_slug", null);
  active = slot.service_slug ? active.eq("service_slug", slot.service_slug) : active.is("service_slug", null);
  const { count: activeCount } = await active.limit(1);
  if ((activeCount ?? 0) > 0) return { ok: true, skipped: true };

  // Journal : une tâche par tentative, l'historique précédent est conservé.
  let q = sb.from("seo_page_tasks").select("id", { count: "exact", head: true }).eq("city_slug", slot.city_slug);
  q = slot.material_slug ? q.eq("material_slug", slot.material_slug) : q.is("material_slug", null);
  q = slot.service_slug ? q.eq("service_slug", slot.service_slug) : q.is("service_slug", null);
  const { count } = await q;
  const attempt = (count ?? 0) + 1;

  const { data: task, error: insErr } = await sb.from("seo_page_tasks").insert({
    city_slug: slot.city_slug,
    material_slug: slot.material_slug,
    service_slug: slot.service_slug,
    kind: "repair",
    status: "running",
    step: "generation",
    attempts: attempt,
    max_attempts: 3,
    started_at: new Date().toISOString(),
  }).select("id").single();
  if (insErr || !task?.id) return { ok: false, error: insErr?.message ?? "Impossible de journaliser la tentative" };

  const res = await generate(slot);
  console.log("[repair]", slot.city_slug, slot.material_slug ?? slot.service_slug ?? "hub", "->", JSON.stringify(res).slice(0, 500));

  await sb.from("seo_page_tasks").update({
    status: res.ok ? "succeeded" : "failed",
    last_error: res.error ?? null,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", task?.id ?? "00000000-0000-0000-0000-000000000000");

  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Non authentifié" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    if (jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: userData } = await sb.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Session invalide" }, 401);
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const citySlug = typeof body.city_slug === "string" ? body.city_slug : null;
    if (!citySlug) return json({ error: "city_slug requis" }, 400);
    const allErrors = body.all_errors === true;

    const { data: slotRows, error: slotErr } = await sb.rpc("seo_slot_rows", { _city_slug: citySlug });
    if (slotErr) return json({ error: slotErr.message }, 500);
    const rows = (slotRows ?? []) as Slot[];

    let targets: Slot[];
    if (allErrors) {
      // Une page publiée volontairement non indexée n'est pas un échec : régénérer ne la changerait pas.
      const noindexOnly = (r: Slot & { issues?: string[] | null }) =>
        r.gen_state === "invalid" && !!r.issues?.length && r.issues.every((i) => i === "Publiée mais noindex");
      targets = rows.filter((r) => (r.gen_state === "error" || r.gen_state === "invalid" || r.gen_state === "missing") && !noindexOnly(r));
    } else {
      const m = (body.material_slug ?? null) as string | null;
      const s = (body.service_slug ?? null) as string | null;
      targets = rows.filter((r) => (r.material_slug ?? null) === m && (r.service_slug ?? null) === s);
      if (targets.length === 0) return json({ error: "Page introuvable pour cette ville" }, 404);
    }

    if (targets.length === 0) return json({ ok: true, queued: 0, message: "Aucune page en erreur." });

    // Traitement séquentiel en arrière-plan : une page en échec n'empêche
    // jamais les suivantes d'être traitées.
    const work = (async () => {
      for (const slot of targets) {
        try { await processSlot(sb, slot); } catch (_e) { /* on continue */ }
      }
    })();

    if (targets.length === 1) {
      await work;
      return json({ ok: true, queued: 1, done: true });
    }
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(work);
    return json({ ok: true, queued: targets.length, done: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
