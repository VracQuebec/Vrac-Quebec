// Deno edge function — SEO Pipeline V2 orchestrator (city-by-city, queue-based).
// Idempotent. One task per invocation. Persists everything in
// seo_pipeline_runs / seo_city_batches / seo_page_tasks. Safe to call in a loop
// from the client (polling) or from cron (supervisor).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const TASK_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 45_000;
const STALE_RUNNING_MS = 90_000;
// Distributed lock key so only ONE orchestrator instance runs at any time.
// Any 32-bit int works — chosen once and kept stable.
const ORCH_LOCK_KEY = 918273645;
// Max wall-clock time we allow a single invocation to keep the lock.
const MAX_INVOCATION_MS = 50_000;

function nowIso() { return new Date().toISOString(); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: number | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`Timeout ${label} après ${Math.round(ms/1000)}s`)), ms); }),
    ]);
  } finally { if (t) clearTimeout(t); }
}

function functionsBase(): string {
  const url = Deno.env.get("SUPABASE_URL")!;
  return url.replace(".supabase.co", ".functions.supabase.co").replace(/\/$/, "");
}

async function callFn(name: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await withTimeout(fetch(`${functionsBase()}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Use the SAME service-role key in both headers. Mixing SERVICE_ROLE
        // in `Authorization` with ANON in `apikey` triggers the gateway's
        // "Conflicting API keys" error on the new signing-keys system, and
        // seo-generate-page still requires an Authorization Bearer JWT for
        // its admin check.
        "Authorization": `Bearer ${svc}`,
        "apikey": svc,
      },
      body: JSON.stringify(body ?? {}),
    }), timeoutMs, name);
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: resp.ok, status: resp.status, data, error: resp.ok ? undefined : (data?.error || text) };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------- Materialization ----------------

async function materializeBatch(sb: SupabaseClient, run: any, batch: any) {
  // If tasks already exist for this batch, do nothing.
  const { count } = await sb.from("seo_page_tasks").select("id", { count: "exact", head: true }).eq("batch_id", batch.id);
  if ((count ?? 0) > 0) return;

  const citySlug: string = batch.city_slug;
  const mode: string = run.mode;

  if (mode === "republish") {
    // Only re-publish already existing pages for this city.
    const { data: pages } = await sb.from("seo_pages")
      .select("id, slug, material_slug, service_slug")
      .eq("city_slug", citySlug);
    const rows = (pages ?? []).map((p) => ({
      batch_id: batch.id, run_id: run.id, city_slug: citySlug,
      material_slug: p.material_slug, service_slug: p.service_slug,
      kind: "publish", status: "queued", max_attempts: run.max_retries ?? 3,
      page_id: p.id, page_slug: p.slug,
    }));
    if (rows.length) await sb.from("seo_page_tasks").insert(rows);
    await sb.from("seo_city_batches").update({ total_tasks: rows.length, status: "running", started_at: nowIso(), last_progress_at: nowIso(), current_step: "publication" }).eq("id", batch.id);
    return;
  }

  // Normal: hub + materials + services for this city.
  const [{ data: mats }, { data: svcs }] = await Promise.all([
    sb.from("seo_materials").select("slug").eq("active", true),
    sb.from("seo_services").select("slug").eq("active", true),
  ]);

  // Persistent-state guarantee: never re-queue pages that already exist
  // unless the run explicitly requested a force regeneration. This keeps
  // the pipeline resumable and prevents overwriting content, slugs, SEO
  // metadata or generated_at timestamps of pages already produced.
  const force = !!run.force_regenerate;
  const existingKeys = new Set<string>();
  if (!force) {
    const { data: existingPages } = await sb.from("seo_pages")
      .select("material_slug, service_slug")
      .eq("city_slug", citySlug);
    for (const p of existingPages ?? []) {
      existingKeys.add(`${p.material_slug ?? ""}::${p.service_slug ?? ""}`);
    }
  }
  const shouldQueue = (material: string | null, service: string | null) =>
    force || !existingKeys.has(`${material ?? ""}::${service ?? ""}`);

  const rows: any[] = [];
  if (shouldQueue(null, null)) {
    rows.push({ batch_id: batch.id, run_id: run.id, city_slug: citySlug, material_slug: null, service_slug: null, kind: "full", status: "queued", max_attempts: run.max_retries ?? 3 });
  }
  for (const m of mats ?? []) {
    if (shouldQueue(m.slug, null)) {
      rows.push({ batch_id: batch.id, run_id: run.id, city_slug: citySlug, material_slug: m.slug, service_slug: null, kind: "full", status: "queued", max_attempts: run.max_retries ?? 3 });
    }
  }
  for (const s of svcs ?? []) {
    if (shouldQueue(null, s.slug)) {
      rows.push({ batch_id: batch.id, run_id: run.id, city_slug: citySlug, material_slug: null, service_slug: s.slug, kind: "full", status: "queued", max_attempts: run.max_retries ?? 3 });
    }
  }
  if (rows.length) await sb.from("seo_page_tasks").insert(rows);
  await sb.from("seo_city_batches").update({
    total_tasks: rows.length,
    status: rows.length === 0 ? "completed" : "running",
    started_at: nowIso(), last_progress_at: nowIso(),
    current_step: rows.length === 0 ? "déjà à jour" : "génération",
    finished_at: rows.length === 0 ? nowIso() : null,
  }).eq("id", batch.id);
}

// ---------------- Batch finalization ----------------

async function finalizeBatchIfDone(sb: SupabaseClient, batch: any): Promise<boolean> {
  const { data: remaining } = await sb.from("seo_page_tasks")
    .select("id, status")
    .eq("batch_id", batch.id);
  const list = remaining ?? [];
  const active = list.filter((t: any) => t.status === "queued" || t.status === "running");
  if (active.length > 0) return false;

  const succeeded = list.filter((t: any) => t.status === "succeeded").length;
  const failed = list.filter((t: any) => t.status === "failed" || t.status === "needs_retry").length;

  await sb.from("seo_city_batches").update({
    status: failed > 0 && succeeded === 0 ? "failed" : "completed",
    done_tasks: list.length,
    succeeded_tasks: succeeded,
    failed_tasks: failed,
    current_step: "terminé",
    finished_at: nowIso(),
    sitemap_updated_at: nowIso(),
  }).eq("id", batch.id);
  return true;
}

async function finalizeRunIfDone(sb: SupabaseClient, run: any): Promise<boolean> {
  const { data: batches } = await sb.from("seo_city_batches").select("status").eq("run_id", run.id);
  const list = batches ?? [];
  if (list.some((b: any) => b.status === "queued" || b.status === "running" || b.status === "paused")) return false;

  const anyFailed = list.some((b: any) => b.status === "failed");
  await sb.from("seo_pipeline_runs").update({
    status: anyFailed ? "completed" : "completed", // even with per-city failures we mark completed; retry_errors is separate
    finished_at: nowIso(),
    current_city_slug: null,
  }).eq("id", run.id);
  return true;
}

// ---------------- Progress metrics ----------------

async function refreshRunMetrics(sb: SupabaseClient, run: any) {
  const { data: tasks } = await sb.from("seo_page_tasks")
    .select("status, qa_score, duration_ms, started_at, finished_at")
    .eq("run_id", run.id);
  const list = tasks ?? [];
  const total = list.length;
  const done = list.filter((t: any) => ["succeeded","failed","needs_retry","skipped","cancelled"].includes(t.status)).length;
  const succ = list.filter((t: any) => t.status === "succeeded").length;
  const fail = list.filter((t: any) => t.status === "failed" || t.status === "needs_retry").length;
  const qaValues = list.map((t: any) => t.qa_score).filter((v: any) => typeof v === "number");
  const qaAvg = qaValues.length ? Math.round(qaValues.reduce((a: number, b: number) => a + b, 0) / qaValues.length) : null;

  // ppm: use last 20 succeeded durations
  const startedAt = run.started_at ? new Date(run.started_at).getTime() : Date.now();
  const elapsedMin = Math.max(0.001, (Date.now() - startedAt) / 60000);
  const ppm = done > 0 ? Number((done / elapsedMin).toFixed(2)) : null;
  const remaining = Math.max(0, total - done);
  const eta = ppm && ppm > 0 ? Math.round((remaining / ppm) * 60) : null;

  await sb.from("seo_pipeline_runs").update({
    total_pages: total, done_pages: done, succeeded_pages: succ, failed_pages: fail,
    qa_avg: qaAvg, pages_per_minute: ppm, eta_seconds: eta, last_progress_at: nowIso(),
  }).eq("id", run.id);
}

// ---------------- Task execution ----------------

async function loadContext(sb: SupabaseClient, task: any) {
  const [{ data: city }, { data: material }, { data: service }] = await Promise.all([
    sb.from("seo_cities").select("slug, name, region").eq("slug", task.city_slug).maybeSingle(),
    task.material_slug ? sb.from("seo_materials").select("slug, name, short_name, description").eq("slug", task.material_slug).maybeSingle() : Promise.resolve({ data: null }),
    task.service_slug ? sb.from("seo_services").select("slug, name, description").eq("slug", task.service_slug).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { city, material, service };
}

async function runOneTask(sb: SupabaseClient, run: any, batch: any, task: any) {
  const started = Date.now();
  await sb.from("seo_page_tasks").update({
    status: "running", attempts: task.attempts + 1, started_at: nowIso(), step: "génération", last_error: null,
  }).eq("id", task.id);
  await sb.from("seo_city_batches").update({ current_step: `${task.city_slug} ${task.material_slug ?? ""}${task.service_slug ? " · " + task.service_slug : ""}`.trim(), last_progress_at: nowIso() }).eq("id", batch.id);

  const qaThreshold = run.qa_threshold ?? 90;
  let pageId = task.page_id as string | null;
  let qaScore: number | null = task.qa_score ?? null;

  try {
    const ctx = await loadContext(sb, task);
    if (!ctx.city) throw new Error(`Ville introuvable: ${task.city_slug}`);

    if (task.kind === "publish") {
      if (!pageId) throw new Error("page_id manquant pour republication");
    } else {
      // GENERATE
      const gen = await withTimeout(
        callFn("seo-generate-page", {
          city: ctx.city, material: ctx.material, service: ctx.service,
          force: !!run.force_regenerate,
          // Admin-triggered pipeline: always allow the AI call so economy mode
          // doesn't block generation and leave a needs_retry task forever.
          allow_ai: true,
        }, STEP_TIMEOUT_MS),
        TASK_TIMEOUT_MS, "génération",
      );
      if (!gen.ok) throw new Error(`génération: ${gen.error}`);
      pageId = gen.data?.page?.id ?? gen.data?.page_id ?? pageId;
      qaScore = typeof gen.data?.score === "number" ? gen.data.score : qaScore;
      if (!pageId) {
        // Look up by expected slug
        const parts = [ctx.service?.slug, ctx.material?.slug, ctx.city.slug].filter(Boolean).join("-");
        const { data: existing } = await sb.from("seo_pages").select("id, slug").eq("slug", parts).maybeSingle();
        pageId = existing?.id ?? null;
      }
      if (!pageId) throw new Error("page_id manquant après génération");
    }

    // QA
    await sb.from("seo_page_tasks").update({ step: "QA", page_id: pageId, last_progress_at: nowIso() as any }).eq("id", task.id);
    let qa = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, STEP_TIMEOUT_MS);
    if (qa.ok) qaScore = typeof qa.data?.score === "number" ? qa.data.score : qaScore;

    // AUTOFIX if below threshold
    if (qa.ok && typeof qaScore === "number" && qaScore < qaThreshold) {
      await sb.from("seo_page_tasks").update({ step: "correction" }).eq("id", task.id);
      const fix = await callFn("seo-qa-autofix", { page_id: pageId }, STEP_TIMEOUT_MS);
      if (fix.ok) {
        qa = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, STEP_TIMEOUT_MS);
        if (qa.ok) qaScore = typeof qa.data?.score === "number" ? qa.data.score : qaScore;
      }
    }

    // PUBLISH if score >= threshold (or republish kind)
    await sb.from("seo_page_tasks").update({ step: "publication" }).eq("id", task.id);
    if (task.kind === "publish" || (typeof qaScore === "number" && qaScore >= qaThreshold)) {
      await sb.from("seo_pages").update({ status: "published", published_at: nowIso() }).eq("id", pageId);
    }

    await sb.from("seo_page_tasks").update({
      status: "succeeded", step: "terminé", page_id: pageId, qa_score: qaScore,
      duration_ms: Date.now() - started, finished_at: nowIso(), last_error: null,
    }).eq("id", task.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const attempts = task.attempts + 1;
    const maxA = task.max_attempts ?? run.max_retries ?? 3;
    const shouldRetry = attempts < maxA;
    const backoff = [5, 20, 60][Math.min(attempts, 2)] * 1000;
    await sb.from("seo_page_tasks").update({
      status: shouldRetry ? "queued" : "needs_retry",
      last_error: msg, page_id: pageId, qa_score: qaScore,
      duration_ms: Date.now() - started,
      next_attempt_at: shouldRetry ? new Date(Date.now() + backoff).toISOString() : null,
      finished_at: shouldRetry ? null : nowIso(),
    }).eq("id", task.id);
  }
}

// ---------------- Main loop ----------------

async function tick(sb: SupabaseClient): Promise<{ processed: number; state: string; run_id?: string }> {
  // 1) Requeue stale running tasks
  const staleCutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  await sb.from("seo_page_tasks").update({
    status: "queued", last_error: "watchdog: tâche bloquée > 90s", started_at: null,
  }).eq("status", "running").lt("started_at", staleCutoff);

  // 2) Load active run
  const { data: run } = await sb.from("seo_pipeline_runs")
    .select("*").in("status", ["queued","running"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return { processed: 0, state: "no_active_run" };

  if (run.status === "queued") {
    await sb.from("seo_pipeline_runs").update({ status: "running", started_at: run.started_at ?? nowIso(), last_progress_at: nowIso() }).eq("id", run.id);
    run.status = "running";
  }

  // 3) Pick current batch
  const { data: batch } = await sb.from("seo_city_batches")
    .select("*").eq("run_id", run.id).in("status", ["queued","running"])
    .order("sort_order", { ascending: true }).limit(1).maybeSingle();

  if (!batch) {
    await refreshRunMetrics(sb, run);
    await finalizeRunIfDone(sb, run);
    return { processed: 0, state: "no_batch", run_id: run.id };
  }

  if (batch.status === "queued") {
    await materializeBatch(sb, run, batch);
    await sb.from("seo_pipeline_runs").update({ current_city_slug: batch.city_slug, last_progress_at: nowIso() }).eq("id", run.id);
  }

  // 4) Pick next task
  const { data: task } = await sb.from("seo_page_tasks")
    .select("*").eq("batch_id", batch.id).eq("status", "queued")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso()}`)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (!task) {
    // Check if batch is done
    const done = await finalizeBatchIfDone(sb, batch);
    await refreshRunMetrics(sb, run);
    if (done) await finalizeRunIfDone(sb, run);
    return { processed: 0, state: done ? "batch_done" : "waiting_retries", run_id: run.id };
  }

  await runOneTask(sb, run, batch, task);
  await refreshRunMetrics(sb, run);
  return { processed: 1, state: "processed", run_id: run.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Optional JWT check for user calls; cron/service passes service role.
  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace("Bearer ", "");
  const isService = jwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isCron = req.headers.get("Lovable-Context") === "cron";
  if (!isService && !isCron) {
    const { data: u } = await sb.auth.getUser(jwt);
    const uid = u?.user?.id;
    if (!uid) return json({ error: "Non autorisé" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
  }

  // Body: { steps?: number } — hard cap on ticks per invocation. Default 40.
  // The invocation also self-terminates before MAX_INVOCATION_MS to leave
  // room for the next cron/user trigger without ever holding the lock past
  // the edge-runtime timeout.
  const body = await req.json().catch(() => ({}));
  const steps = Math.max(1, Math.min(200, Number(body?.steps ?? 40)));

  // Distributed lock via Postgres advisory lock. Guarantees a single
  // active orchestrator across cron + manual triggers.
  const { data: lockRes } = await sb.rpc("pg_try_advisory_lock" as any, { key: ORCH_LOCK_KEY } as any)
    .then((r: any) => r, () => ({ data: null }));
  // Fallback: run a raw SELECT via a dedicated RPC if the direct call is unavailable.
  let acquired: boolean = lockRes === true;
  if (!acquired) {
    const { data } = await sb.rpc("seo_orchestrator_try_lock" as any).then((r: any) => r, () => ({ data: null }));
    acquired = data === true;
  }
  if (!acquired) return json({ ok: true, locked: true, message: "Another orchestrator is running" });

  const startedAt = Date.now();
  const results: any[] = [];
  try {
    for (let i = 0; i < steps; i++) {
      if (Date.now() - startedAt > MAX_INVOCATION_MS) { results.push({ state: "time_budget_exhausted" }); break; }
      const r = await tick(sb);
      results.push(r);
      if (r.processed === 0) break;
      await sleep(50);
    }
  } finally {
    // NOTE: PostgrestBuilder is a thenable but exposes no `.catch`.
    // Always go through `.then(onOk, onErr)` here.
    await sb.rpc("seo_orchestrator_unlock" as any).then(() => {}, () => {});
  }
  return json({ ok: true, ticks: results, elapsed_ms: Date.now() - startedAt });
});