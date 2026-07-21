// Industrial SEO pipeline orchestrator: Generate → QA → Auto-fix → Publish.
// Admin-only. Every page is isolated with timeout/retry/watchdog so one stuck page never blocks a wave.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Mode = "generate" | "publish" | "pipeline";
type Step = "préparation" | "génération" | "QA" | "correction" | "publication" | "watchdog" | "terminé";
type Target = { city_slug: string; material_slug: string | null; service_slug: string | null } | string;

type PipelineItem = {
  target: Target;
  status: "succeeded" | "failed" | "blocked";
  attempts: number;
  step: Step;
  duration_ms: number;
  reason?: string;
  page_id?: string;
};

const MAX_ATTEMPTS = 3;
const TASK_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 45_000;
const WATCHDOG_STALL_MS = 60_000;
const CONCURRENCY = 3;

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function targetLabel(target: Target) {
  if (typeof target === "string") return target;
  return [target.city_slug, target.material_slug, target.service_slug].filter(Boolean).join(" / ");
}

function timeoutError(step: Step, ms: number) {
  return new Error(`Timeout ${step} après ${Math.round(ms / 1000)}s`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, step: Step): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(step, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function updateJob(supabase: SupabaseClient, jobId: string, patch: Record<string, unknown>) {
  await supabase
    .from("seo_generation_jobs")
    .update({ ...patch, heartbeat_at: nowIso() })
    .eq("id", jobId);
}

async function appendJobEvent(
  supabase: SupabaseClient,
  jobId: string,
  field: "errors" | "watchdog_events" | "retry_queue" | "blocked_items",
  event: Record<string, unknown>,
  max = 100,
) {
  const { data } = await supabase.from("seo_generation_jobs").select(field).eq("id", jobId).single();
  const existing = Array.isArray(data?.[field]) ? data[field] as unknown[] : [];
  await updateJob(supabase, jobId, { [field]: [...existing, event].slice(-max) });
}

async function markStep(
  supabase: SupabaseClient,
  jobId: string,
  target: Target,
  step: Step,
  attempt: number,
  startedAt = nowIso(),
) {
  await updateJob(supabase, jobId, {
    current_target: target,
    current_step: step,
    current_attempt: attempt,
    current_started_at: startedAt,
  });
}

async function callFn(name: string, body: unknown, authHeader: string, step: Step, timeoutMs = STEP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`Timeout ${step}`), timeoutMs);
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const txt = await res.text();
    const data = txt ? JSON.parse(txt) : {};
    if (!res.ok) {
      const message = (data as { error?: string; details?: string })?.error || (data as { details?: string })?.details || `HTTP ${res.status}`;
      throw new Error(`${name}: ${message}`);
    }
    return data;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw timeoutError(step, timeoutMs);
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timer);
  }
}

async function publishPage(supabase: SupabaseClient, pageId: string) {
  const { error } = await supabase
    .from("seo_pages")
    .update({ status: "published", published_at: nowIso() })
    .eq("id", pageId);
  if (error) throw new Error(`publication: ${error.message}`);
}

function startWatchdog(supabase: SupabaseClient, jobId: string, getRunning: () => boolean) {
  const timer = setInterval(async () => {
    if (!getRunning()) return;
    const { data } = await supabase
      .from("seo_generation_jobs")
      .select("done,total,last_progress_at,current_target,current_step,current_attempt,current_started_at")
      .eq("id", jobId)
      .single();
    if (!data || data.done >= data.total) return;

    const lastProgress = data.last_progress_at ? new Date(data.last_progress_at).getTime() : Date.now();
    const currentStarted = data.current_started_at ? new Date(data.current_started_at).getTime() : lastProgress;
    const stalledFor = Date.now() - Math.max(lastProgress, currentStarted);
    if (stalledFor < WATCHDOG_STALL_MS) return;

    await appendJobEvent(supabase, jobId, "watchdog_events", {
      at: nowIso(),
      type: "stall_detected",
      target: data.current_target,
      step: data.current_step,
      attempt: data.current_attempt,
      stalled_for_ms: stalledFor,
      reason: "Aucune progression détectée depuis plus de 60 secondes; la tâche sera relancée ou ignorée selon les tentatives restantes.",
    });
    await updateJob(supabase, jobId, { heartbeat_at: nowIso() });
  }, 15_000);
  return () => clearInterval(timer);
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
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Session invalide" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);

    const body = await req.json().catch(() => ({}));

    if (body?.action === "watchdog" && typeof body?.job_id === "string") {
      const { data: watchedJob, error: watchedErr } = await supabase
        .from("seo_generation_jobs")
        .select("id,status,mode,wave,total,done,succeeded,failed,report,blocked_items,last_progress_at,current_target,current_step,current_attempt,current_started_at")
        .eq("id", body.job_id)
        .single();
      if (watchedErr || !watchedJob) return json({ error: "Job introuvable" }, 404);
      if (watchedJob.status !== "running") return json({ ok: true, already_final: true, status: watchedJob.status });

      const lastProgress = watchedJob.last_progress_at ? new Date(watchedJob.last_progress_at).getTime() : Date.now();
      const currentStarted = watchedJob.current_started_at ? new Date(watchedJob.current_started_at).getTime() : lastProgress;
      const stalledFor = Date.now() - Math.max(lastProgress, currentStarted);
      if (stalledFor < WATCHDOG_STALL_MS) {
        return json({ ok: true, stalled: false, stalled_for_ms: stalledFor });
      }

      const blockedEvent = {
        at: nowIso(),
        type: "watchdog_recovery",
        target: watchedJob.current_target,
        step: watchedJob.current_step,
        attempt: watchedJob.current_attempt,
        stalled_for_ms: stalledFor,
        reason: "Aucune progression détectée depuis plus de 60 secondes. Job clôturé avec avertissement et relance de récupération démarrée.",
      };
      const existingBlocked = Array.isArray(watchedJob.blocked_items) ? watchedJob.blocked_items : [];
      const existingReport = (watchedJob.report && typeof watchedJob.report === "object") ? watchedJob.report as Record<string, unknown> : {};
      await updateJob(supabase, watchedJob.id, {
        status: "completed_with_warnings",
        done: Math.min(Number(watchedJob.total ?? 0), Number(watchedJob.done ?? 0) + 1),
        failed: Number(watchedJob.failed ?? 0) + 1,
        current_step: "terminé",
        current_target: null,
        current_started_at: null,
        finished_at: nowIso(),
        blocked_items: [...existingBlocked, blockedEvent].slice(-100),
        watchdog_events: [blockedEvent],
        report: {
          ...existingReport,
          final_status: "completed_with_warnings",
          watchdog_recovery: blockedEvent,
        },
      });

      const recovery = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/seo-pipeline-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          mode: watchedJob.mode || "pipeline",
          wave: watchedJob.wave,
          auto_fix: true,
          qa_threshold: Number.isFinite(body?.qa_threshold) ? Number(body.qa_threshold) : 80,
          limit: Math.max(1, Number(watchedJob.total ?? 1) - Number(watchedJob.done ?? 0)),
        }),
      }).catch((e) => e instanceof Error ? e.message : String(e));

      return json({
        ok: true,
        stalled: true,
        recovered_job_id: watchedJob.id,
        stalled_for_ms: stalledFor,
        recovery_started: typeof recovery !== "string",
      });
    }

    const wave: string | null = typeof body?.wave === "string" ? body.wave : null;
    const mode: Mode = (["generate", "publish", "pipeline"] as Mode[]).includes(body?.mode) ? body.mode : "pipeline";
    const qaThreshold = Number.isFinite(body?.qa_threshold) ? Number(body.qa_threshold) : 80;
    const autoFix = body?.auto_fix !== false;
    const limitCombinations = Number.isFinite(body?.limit) ? Number(body.limit) : 500;

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
          const key = `${c.slug}|${m.slug}|`;
          if (!existing.has(key)) combinations.push({ city_slug: c.slug, material_slug: m.slug, service_slug: null });
        }
        for (const s of svcs ?? []) {
          const key = `${c.slug}||${s.slug}`;
          if (!existing.has(key)) combinations.push({ city_slug: c.slug, material_slug: null, service_slug: s.slug });
        }
      }
      combinations = combinations.slice(0, limitCombinations);
    }

    if (mode === "publish") {
      let query = supabase.from("seo_pages").select("id").eq("status", "draft");
      if (wave) query = query.eq("wave", wave);
      const { data } = await query.limit(1000);
      toPublishIds = (data ?? []).map((row: { id: string }) => row.id);
    }

    const items: Target[] = mode === "publish" ? toPublishIds : combinations;
    const total = items.length;
    if (total === 0) return json({ ok: true, empty: true, message: "Rien à traiter." });

    // Auto-repair: purge any stale running jobs (>3min without progress)
    try { await supabase.rpc("seo_pipeline_purge_stale"); } catch (_) { /* ignore */ }

    // Deduplicate: if a job for (mode, wave) is already running, refuse to create a second one
    const { data: existingRunning } = await supabase
      .from("seo_generation_jobs")
      .select("id,total,done")
      .eq("status", "running")
      .eq("mode", mode)
      .is("wave", wave === null ? null : undefined)
      .maybeSingle();
    if (existingRunning && (wave === null || existingRunning)) {
      // narrow check on wave equality
      const { data: sameWave } = await supabase
        .from("seo_generation_jobs")
        .select("id,total,done,mode,wave")
        .eq("status", "running")
        .eq("mode", mode)
        .limit(5);
      const match = (sameWave ?? []).find((r) => (r.wave ?? null) === wave);
      if (match) {
        return json({ ok: true, already_running: true, job_id: match.id, message: `Un job ${mode} ${wave ?? "toutes"} tourne déjà (${match.done}/${match.total}).` });
      }
    }

    const { data: jobRow, error: jobErr } = await supabase.from("seo_generation_jobs").insert({
      status: "running",
      mode,
      wave,
      combinations: items,
      total,
      done: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      report: { logs: [], warnings: [], retries: [], blocked: [] },
      watchdog_events: [],
      retry_queue: [],
      blocked_items: [],
      progress_samples: [],
      created_by: uid,
      started_at: nowIso(),
      heartbeat_at: nowIso(),
      last_progress_at: nowIso(),
      current_step: "préparation",
    }).select("id").single();
    if (jobErr || !jobRow) {
      // Unique violation → another job just started for same (mode, wave)
      if ((jobErr as { code?: string })?.code === "23505") {
        return json({ ok: true, already_running: true, message: "Un job identique tourne déjà." });
      }
      return json({ error: jobErr?.message || "Job non créé" }, 500);
    }
    const jobId = jobRow.id;

    const processing = (async () => {
      let running = true;
      const stopWatchdog = startWatchdog(supabase, jobId, () => running);
      const logs: PipelineItem[] = [];
      const retryQueue: PipelineItem[] = [];
      const blockedItems: PipelineItem[] = [];
      const qaScores: number[] = [];
      let succeeded = 0;
      let failed = 0;
      let done = 0;

      const processAttempt = async (target: Target, attempt: number): Promise<PipelineItem> => {
        const started = Date.now();
        let step: Step = "génération";
        let pageId = typeof target === "string" ? target : "";

        await markStep(supabase, jobId, target, step, attempt);

        const run = async () => {
          if (mode === "generate" || mode === "pipeline") {
            step = "génération";
            await markStep(supabase, jobId, target, step, attempt);
            const genRes = await callFn("seo-generate-page", target, authHeader, step, STEP_TIMEOUT_MS);
            pageId = (genRes as { page?: { id?: string } })?.page?.id || "";
            if (!pageId && mode === "pipeline") throw new Error("Page générée sans identifiant");

            if (mode === "pipeline" && pageId) {
              step = "QA";
              await markStep(supabase, jobId, target, step, attempt);
              const qa = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader, step, STEP_TIMEOUT_MS);
              const qaScore = (qa as { score?: number })?.score ?? 0;
              qaScores.push(qaScore);
              const hasBlockers = ((qa as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;

              if (autoFix && (qaScore < qaThreshold || hasBlockers)) {
                step = "correction";
                await markStep(supabase, jobId, target, step, attempt);
                await callFn("seo-qa-autofix", { page_id: pageId }, authHeader, step, STEP_TIMEOUT_MS);

                step = "QA";
                await markStep(supabase, jobId, target, step, attempt);
                const recheck = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader, step, STEP_TIMEOUT_MS);
                const reScore = (recheck as { score?: number })?.score ?? qaScore;
                const reBlockers = ((recheck as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;
                if (reScore < qaThreshold || reBlockers) throw new Error(`QA insuffisant après correction (${reScore}/100)`);
              } else if (qaScore < qaThreshold || hasBlockers) {
                throw new Error(`QA insuffisant (${qaScore}/100)`);
              }

              step = "publication";
              await markStep(supabase, jobId, target, step, attempt);
              await publishPage(supabase, pageId);
            }
          } else {
            step = "QA";
            await markStep(supabase, jobId, target, step, attempt);
            const qa = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader, step, STEP_TIMEOUT_MS);
            const qaScore = (qa as { score?: number })?.score ?? 0;
            qaScores.push(qaScore);
            const blockers = ((qa as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;
            if (qaScore < qaThreshold || blockers) {
              if (!autoFix) throw new Error(`QA insuffisant (${qaScore}/100)`);
              step = "correction";
              await markStep(supabase, jobId, target, step, attempt);
              await callFn("seo-qa-autofix", { page_id: pageId }, authHeader, step, STEP_TIMEOUT_MS);
              step = "QA";
              await markStep(supabase, jobId, target, step, attempt);
              const recheck = await callFn("seo-qa-check", { page_id: pageId, threshold: qaThreshold, enforce_draft: true }, authHeader, step, STEP_TIMEOUT_MS);
              const reScore = (recheck as { score?: number })?.score ?? 0;
              const reBlockers = ((recheck as { blockers?: unknown[] })?.blockers?.length ?? 0) > 0;
              if (reScore < qaThreshold || reBlockers) throw new Error(`QA insuffisant après correction (${reScore}/100)`);
            }
            step = "publication";
            await markStep(supabase, jobId, target, step, attempt);
            await publishPage(supabase, pageId);
          }
        };

        try {
          await withTimeout(run(), TASK_TIMEOUT_MS, step);
          return { target, status: "succeeded", attempts: attempt, step: "terminé", duration_ms: Date.now() - started, page_id: pageId || undefined };
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          const status = reason.toLowerCase().includes("timeout") ? "blocked" : "failed";
          return { target, status, attempts: attempt, step, duration_ms: Date.now() - started, reason, page_id: pageId || undefined };
        }
      };

      const runOne = async (target: Target) => {
        let lastResult: PipelineItem | null = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          lastResult = await processAttempt(target, attempt);
          logs.push(lastResult);
          if (lastResult.status === "succeeded") {
            succeeded++;
            done++;
            await updateJob(supabase, jobId, {
              done,
              succeeded,
              failed,
              last_progress_at: nowIso(),
              report: { logs: logs.slice(-100), warnings: retryQueue.slice(-50), blocked: blockedItems.slice(-50) },
              ...computeProgressMetrics(jobStartMs, done, total),
            });
            return;
          }

          await appendJobEvent(supabase, jobId, "retry_queue", {
            ...lastResult,
            at: nowIso(),
            label: targetLabel(target),
            next_attempt: attempt < MAX_ATTEMPTS ? attempt + 1 : null,
          });

          if (attempt < MAX_ATTEMPTS) {
            retryQueue.push(lastResult);
            await sleep(750 * attempt);
          }
        }

        failed++;
        done++;
        const finalResult = lastResult ?? {
          target,
          status: "failed" as const,
          attempts: MAX_ATTEMPTS,
          step: "watchdog" as Step,
          duration_ms: 0,
          reason: "Échec inconnu après 3 tentatives",
        };
        blockedItems.push(finalResult);
        await appendJobEvent(supabase, jobId, "blocked_items", { ...finalResult, at: nowIso(), label: targetLabel(target) });
        await updateJob(supabase, jobId, {
          done,
          succeeded,
          failed,
          errors: blockedItems.slice(-100),
          last_progress_at: nowIso(),
          report: { logs: logs.slice(-100), warnings: retryQueue.slice(-50), blocked: blockedItems.slice(-50) },
          ...computeProgressMetrics(jobStartMs, done, total),
        });
      };

      try {
        const jobStartMs = Date.now();
        void jobStartMs; // ensure captured below via closure fallback
        for (let i = 0; i < items.length; i += CONCURRENCY) {
          const batch = items.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(runOne));
        }

        const qaAvg = qaScores.length ? Math.round(qaScores.reduce((sum, value) => sum + value, 0) / qaScores.length) : null;
        const finalStatus = failed === 0 ? "completed" : succeeded > 0 ? "completed_with_warnings" : "failed_with_retries";
        await updateJob(supabase, jobId, {
          status: finalStatus,
          current_step: "terminé",
          current_target: null,
          current_started_at: null,
          finished_at: nowIso(),
          report: {
            total,
            succeeded,
            failed,
            qa_avg: qaAvg,
            mode,
            wave,
            final_status: finalStatus,
            logs: logs.slice(-200),
            warnings: retryQueue.slice(-100),
            blocked: blockedItems.slice(-100),
          },
        });
      } finally {
        running = false;
        stopWatchdog();
      }
    })();

    const guardedProcessing = processing.catch(async (e) => {
      await updateJob(supabase, jobId, {
        status: "completed_with_warnings",
        finished_at: nowIso(),
        current_step: "terminé",
        report: { error: e instanceof Error ? e.message : String(e), final_status: "completed_with_warnings" },
      });
    });

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(guardedProcessing);
    }

    return json({ ok: true, job_id: jobId, total, mode, wave, timeout_seconds: TASK_TIMEOUT_MS / 1000, max_attempts: MAX_ATTEMPTS });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});