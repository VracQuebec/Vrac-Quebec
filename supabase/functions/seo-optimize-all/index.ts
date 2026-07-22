// Optimise en masse toutes les pages SEO publiées dont le score QA < seuil,
// ou qui manquent de métadonnées / liens internes. Traite en tâche de fond.
// Admin uniquement.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Non autorisé" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Session invalide" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);

    const body = await req.json().catch(() => ({}));
    const threshold: number = Number.isFinite(body?.threshold) ? Number(body.threshold) : 90;
    const maxPages: number = Math.min(500, Number(body?.max) || 100);

    // Select worst pages first
    const { data: candidates, error: cErr } = await supabase
      .from("seo_pages")
      .select("id, slug, qa_last_score, internal_link_count, meta_title, meta_description")
      .eq("status", "published")
      .or(`qa_last_score.lt.${threshold},qa_last_score.is.null,meta_description.is.null`)
      .order("qa_last_score", { ascending: true, nullsFirst: true })
      .limit(maxPages);
    if (cErr) return json({ error: cErr.message }, 500);

    const targets = (candidates ?? []).map((p) => p.id as string);

    // Fire-and-forget background loop
    const authHeader = req.headers.get("Authorization") || "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const runId = crypto.randomUUID();

    const worker = async () => {
      for (const pageId of targets) {
        try {
          const auto = await fetch(`${supaUrl}/functions/v1/seo-qa-autofix`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ page_id: pageId, actions: [] }),
          });
          if (!auto.ok) {
            console.error(`optimize-all: autofix failed for ${pageId}: ${auto.status}`);
          }
        } catch (e) {
          console.error(`optimize-all: exception for ${pageId}:`, e);
        }
      }
      console.log(`optimize-all: run ${runId} finished (${targets.length} pages).`);
    };

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(worker());
    } else {
      void worker();
    }

    return json({ ok: true, queued: targets.length, run_id: runId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});