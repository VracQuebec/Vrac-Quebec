// Orchestrator: Generate → Validate → Auto-fix → Publish for a wave (S1/S2/S3/all).
// Admin-only. Writes progress to seo_generation_jobs. Idempotent by job_id.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Mode = "generate" | "publish" | "pipeline";

async function callFn(name: string, body: unknown, authHeader: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    const txt = await res.text();
    const data = txt ? JSON.parse(txt) : {};
    if (!res.ok) return { ok: false, error: (data as { error?: string })?.error || `HTTP ${res.status}`, data };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function updateJob(supabase: SupabaseClient, jobId: string, patch: Record<string, unknown>) {
  await supabase.from("seo_generation_jobs").update({ ...patch, heartbeat_at: new Date().toISOString() }).eq("id", jobId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "Non autorisé" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: u } = await supabase.auth.getUser(jwt);
    const uid = u?.user?.id;
    if (!uid) return json({ error: "Session invalide" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);

    const body = await req.json().catch(() => ({}));
    const wave: string | null = typeof body?.wave === "string" ? body.wave : null; // S1|S2|S3|null(all)
    const mode: Mode = (["generate", "publish", "pipeline"] as Mode[]).includes(body?.mode) ? body.mode : "pipeline";
    const qaThreshold: number = Number.isFinite(body?.qa_threshold) ? Number(body.qa_threshold) : 80;
    const autoFix: boolean = body?.auto_fix !== false;
    const limitCombinations: number = Number.isFinite(body?.limit) ? Number(body.limit) : 500;

    // Build the target list depending on mode.
    let combinations: Array<{ city_slug: string; material_slug: string | null; service_slug: string | null }> = [];
    let toPublishIds: string[] = [];

    if (mode === "generate" || mode === "pipeline") {
      const [{ data: cities }, { data: mats }, { data: svcs }, { data: existingPages }] = await Promise.all([
        supabase.from("seo_cities").select("slug, population").eq("active", true),
        supabase.from("seo_materials").select("slug").eq("active", true),
        supabase.from("seo_services").select("slug").eq("active", true),
        supabase.from("seo_pages").select("city_slug, material_slug, service_slug"),
      ]);
      const existing = new Set(
        (existingPages ?? []).map((p) => `${p.city_slug}|${p.material_slug ?? ""}|${p.service_slug ?? ""}`),
      );
      const cityFilter = (c: { slug: string; population: number | null }) => {
        if (!wave) return true;
        const pop = c.population ?? 0;
        if (wave === "S1") return pop >= 100000;
        if (wave === "S2") return pop >= 20000 && pop < 100000;
        if (wave === "S3") return pop < 20000;
        return true;
      };
      for (const c of (cities ?? []).filter(cityFilter)) {
        for (const m of mats ?? []) {
          const k = `${c.slug}|${m.slug}|`;
          if (!existing.has(k)) combinations.push({ city_slug: c.slug, material_slug: m.slug, service_slug: null });
        }
        for (const s of svcs ?? []) {
          const k = `${c.slug}||${s.slug}`;
          if (!existing.has(k)) combinations.push({ city_slug: c.slug, material_slug: null, service_slug: s.slug });
        }
      }
      combinations = combinations.slice(0, limitCombinations);
    }

    if (mode === "publish") {
      let q = supabase.from("seo_pages").select("id").eq("status", "draft");
      if (wave) q = q.eq("wave", wave);
      const { data } = await q.limit(1000);
      toPublishIds = (data ?? []).map((r: { id: string }) => r.id);
    }

    const total = mode === "publish" ? toPublishIds.length : combinations.length;
    if (total === 0) return json({ ok: true, empty: true, message: "Rien à traiter." });

    // Create job.
    const { data: jobRow, error: jobErr } = await supabase.from("seo_generation_jobs").insert({
      status: "running",
      mode,
      wave,
      combinations: mode === "publish" ? toPublishIds : combinations,
      total,
      done: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      created_by: uid,
      started_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    }).select("id").single();
    if (jobErr || !jobRow) return json({ error: jobErr?.message || "Job non créé" }, 500);
    const jobId = jobRow.id;

    // Kick off async processing — do not await, respond immediately.
    const processing = (async () => {
      const errors: Array<{ target: unknown; error: string }> = [];
      let succeeded = 0, failed = 0, done = 0;
      const qaScores: number[] = [];

      const runOne = async (target: unknown): Promise<void> => {
        try {
          if (mode === "generate" || mode === "pipeline") {
            const combo = target as { city_slug: string; material_slug: string | null; service_slug: string | null };
            const genRes = await callFn("seo-generate-page", combo, authHeader);
            if (!genRes.ok) throw new Error(genRes.error);
            const pageId = (genRes.data as { page?: { id?: string } })?.page?.id;
            if (mode === "pipeline" && pageId) {
              const qa = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader);
              const qaScore = (qa.data as { score?: number })?.score ?? 0;
              qaScores.push(qaScore);
              const hasBlockers = ((qa.data as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;
              if (autoFix && (qaScore < qaThreshold || hasBlockers)) {
                await callFn("seo-qa-autofix", { page_id: pageId }, authHeader);
                const recheck = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader);
                const rScore = (recheck.data as { score?: number })?.score ?? qaScore;
                const rBlockers = ((recheck.data as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;
                if (rScore >= qaThreshold && !rBlockers) {
                  await supabase.from("seo_pages").update({ status: "published", published_at: new Date().toISOString() }).eq("id", pageId);
                }
              } else if (qaScore >= qaThreshold && !hasBlockers) {
                await supabase.from("seo_pages").update({ status: "published", published_at: new Date().toISOString() }).eq("id", pageId);
              }
            }
          } else if (mode === "publish") {
            const pageId = target as string;
            const qa = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader);
            const qaScore = (qa.data as { score?: number })?.score ?? 0;
            qaScores.push(qaScore);
            const blockers = ((qa.data as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;
            if (qaScore >= qaThreshold && !blockers) {
              await supabase.from("seo_pages").update({ status: "published", published_at: new Date().toISOString() }).eq("id", pageId);
            } else if (autoFix) {
              await callFn("seo-qa-autofix", { page_id: pageId }, authHeader);
              const r = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader);
              const rs = (r.data as { score?: number })?.score ?? 0;
              const rb = ((r.data as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;
              if (rs >= qaThreshold && !rb) {
                await supabase.from("seo_pages").update({ status: "published", published_at: new Date().toISOString() }).eq("id", pageId);
              } else {
                throw new Error(`QA insuffisant après correction (${rs}/100)`);
              }
            } else {
              throw new Error(`QA insuffisant (${qaScore}/100)`);
            }
          }
          succeeded++;
        } catch (e) {
          failed++;
          errors.push({ target, error: e instanceof Error ? e.message : String(e) });
        }
      };

      const items = mode === "publish" ? toPublishIds : combinations;
      const concurrency = 3;
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        await Promise.all(batch.map(runOne));
        done += batch.length;
        await updateJob(supabase, jobId, { done, succeeded, failed, errors: errors.slice(-50) });
      }

      const qaAvg = qaScores.length ? Math.round(qaScores.reduce((a, b) => a + b, 0) / qaScores.length) : null;
      await updateJob(supabase, jobId, {
        status: failed === total ? "failed" : "completed",
        finished_at: new Date().toISOString(),
        report: { total, succeeded, failed, qa_avg: qaAvg, mode, wave },
      });
    })();

    // Fire-and-forget on Deno serverless is fine when we return quickly; wrap error.
    processing.catch(async (e) => {
      await updateJob(supabase, jobId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        report: { error: e instanceof Error ? e.message : String(e) },
      });
    });

    return json({ ok: true, job_id: jobId, total, mode, wave });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});