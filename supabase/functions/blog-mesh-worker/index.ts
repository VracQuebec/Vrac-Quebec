// Industrial mesh worker.
// - Claims one queued batch (SKIP-LOCKED style) from blog_mesh_batches.
// - Processes items deterministically (zero AI).
// - Writes blog_seo_links, updates mesh_content_hash / mesh_score.
// - Self-invokes until the active run has no more work.
// - Accepts admin JWT (manual kick) OR service-role key (cron/self-invoke).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  hasTerm,
  hashContent,
  MAX_LINKS_PER_POST,
  MESH_THRESHOLD,
  normalize,
  scorePair,
  type PostLite,
  type SeoPageLite,
} from "../_shared/mesh-scoring.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

type Batch = {
  id: string;
  run_id: string;
  kind: "posts" | "pages";
  item_ids: string[];
  attempts: number;
  max_attempts: number;
};

async function claimNextBatch(admin: ReturnType<typeof createClient>, runId: string): Promise<Batch | null> {
  const { data: rows } = await admin
    .from("blog_mesh_batches")
    .select("id, run_id, kind, item_ids, attempts, max_attempts")
    .eq("run_id", runId)
    .in("status", ["queued"])
    .order("sort_order", { ascending: true })
    .limit(1);
  const row = rows?.[0] as Batch | undefined;
  if (!row) return null;
  const { data: upd } = await admin
    .from("blog_mesh_batches")
    .update({ status: "claimed", started_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1 })
    .eq("id", row.id)
    .eq("status", "queued")
    .select("id, run_id, kind, item_ids, attempts, max_attempts")
    .maybeSingle();
  return (upd as Batch) ?? null;
}

async function loadReferenceMaps(admin: ReturnType<typeof createClient>) {
  const [{ data: cities }, { data: materials }, { data: services }] = await Promise.all([
    admin.from("seo_cities").select("slug,name").eq("active", true),
    admin.from("seo_materials").select("slug,name").eq("active", true),
    admin.from("seo_services").select("slug,name").eq("active", true),
  ]);
  return {
    cityByS: new Map((cities ?? []).map((c: any) => [c.slug, c.name as string])),
    matByS: new Map((materials ?? []).map((m: any) => [m.slug, m.name as string])),
    svcByS: new Map((services ?? []).map((s: any) => [s.slug, s.name as string])),
  };
}

async function processPostsBatch(admin: ReturnType<typeof createClient>, ids: string[]): Promise<number> {
  const { data: posts } = await admin
    .from("blog_posts")
    .select("id, slug, title, excerpt, content, mesh_content_hash")
    .in("id", ids);
  const { data: seoPages } = await admin
    .from("seo_pages")
    .select("id, slug, title, meta_description, city_slug, material_slug, service_slug")
    .eq("status", "published");
  const { cityByS, matByS, svcByS } = await loadReferenceMaps(admin);

  let processed = 0;
  for (const p of (posts ?? []) as (PostLite & { mesh_content_hash: string | null })[]) {
    const newHash = hashContent(p.title, p.excerpt, p.content);
    // Incremental skip: hash unchanged AND at least one link exists → reuse.
    if (newHash === p.mesh_content_hash) {
      const { count } = await admin
        .from("blog_seo_links")
        .select("id", { count: "exact", head: true })
        .eq("blog_post_id", p.id);
      if ((count ?? 0) > 0) {
        processed++;
        continue;
      }
    }

    const text = normalize(`${p.title} ${p.excerpt ?? ""} ${p.content ?? ""}`);
    const titleN = normalize(p.title);
    const scored: Array<{ page: SeoPageLite; score: number; reasons: Record<string, unknown> }> = [];
    for (const page of (seoPages ?? []) as SeoPageLite[]) {
      const cityName = cityByS.get(page.city_slug) ?? page.city_slug;
      const materialName = page.material_slug ? (matByS.get(page.material_slug) ?? page.material_slug) : "";
      const serviceName = page.service_slug ? (svcByS.get(page.service_slug) ?? page.service_slug) : "";
      const { score, reasons } = scorePair({ text, title: titleN }, page, cityName, materialName, serviceName);
      if (score >= MESH_THRESHOLD) scored.push({ page, score, reasons });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, MAX_LINKS_PER_POST);

    // Prune stale auto links
    const keep = new Set(top.map((t) => t.page.id));
    const { data: existing } = await admin
      .from("blog_seo_links")
      .select("seo_page_id, auto_generated, confirmed_by_admin")
      .eq("blog_post_id", p.id);
    const toDelete = (existing ?? [])
      .filter((e: any) => e.auto_generated && !e.confirmed_by_admin && !keep.has(e.seo_page_id))
      .map((e: any) => e.seo_page_id);
    if (toDelete.length) {
      await admin.from("blog_seo_links").delete().eq("blog_post_id", p.id).in("seo_page_id", toDelete);
    }

    if (top.length) {
      await admin.from("blog_seo_links").upsert(
        top.map((t) => ({
          blog_post_id: p.id,
          seo_page_id: t.page.id,
          relevance_score: t.score,
          match_reasons: t.reasons,
          auto_generated: true,
        })),
        { onConflict: "blog_post_id,seo_page_id", ignoreDuplicates: false },
      );
    }

    await admin.from("blog_posts").update({
      mesh_analyzed_at: new Date().toISOString(),
      mesh_score: top.length ? Math.min(100, Math.round(top[0].score)) : 0,
      mesh_content_hash: newHash,
    }).eq("id", p.id);
    processed++;
  }
  return processed;
}

async function processPagesBatch(admin: ReturnType<typeof createClient>, ids: string[]): Promise<number> {
  // For each SEO page, just refresh its hash. Post→page links are the source of truth,
  // so no additional linking work is needed here — this only enables incremental skip.
  const { data: pages } = await admin
    .from("seo_pages")
    .select("id, title, meta_description, content_html, mesh_content_hash")
    .in("id", ids);
  let processed = 0;
  for (const pg of (pages ?? []) as Array<{ id: string; title: string; meta_description: string | null; content_html: string; mesh_content_hash: string | null }>) {
    const newHash = hashContent(pg.title, pg.meta_description, pg.content_html);
    if (newHash !== pg.mesh_content_hash) {
      await admin.from("seo_pages").update({ mesh_content_hash: newHash }).eq("id", pg.id);
    }
    processed++;
  }
  return processed;
}

async function runLoop(admin: ReturnType<typeof createClient>, runId: string) {
  while (true) {
    const { data: run } = await admin
      .from("blog_mesh_runs")
      .select("id, status")
      .eq("id", runId)
      .maybeSingle();
    if (!run || run.status !== "running") return;

    const batch = await claimNextBatch(admin, runId);
    if (!batch) return;

    const start = Date.now();
    try {
      const processed = batch.kind === "posts"
        ? await processPostsBatch(admin, batch.item_ids)
        : await processPagesBatch(admin, batch.item_ids);

      await admin.from("blog_mesh_batches").update({
        status: "completed",
        processed_count: processed,
        duration_ms: Date.now() - start,
        finished_at: new Date().toISOString(),
        error: null,
      }).eq("id", batch.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const willRetry = batch.attempts < batch.max_attempts;
      await admin.from("blog_mesh_batches").update({
        status: willRetry ? "queued" : "failed",
        error: msg.slice(0, 500),
        next_attempt_at: willRetry ? new Date(Date.now() + 5_000 * batch.attempts).toISOString() : null,
        duration_ms: Date.now() - start,
        finished_at: willRetry ? null : new Date().toISOString(),
      }).eq("id", batch.id);
    }

    await admin.from("blog_mesh_runs")
      .update({ last_progress_at: new Date().toISOString() })
      .eq("id", runId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Non autorisé" }, 401);
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

    const internal = jwt === serviceKey;
    if (!internal) {
      const { data: userData } = await admin.auth.getUser(jwt);
      if (!userData?.user) return json({ error: "Session invalide" }, 401);
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    let runId: string | undefined = body?.run_id;
    if (!runId) {
      const { data: active } = await admin
        .from("blog_mesh_runs")
        .select("id")
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return json({ ok: true, message: "Aucun run actif." });
      runId = active.id as string;
    }

    const p = runLoop(admin, runId);
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(p);
    else void p;
    return json({ ok: true, run_id: runId, kicked: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});