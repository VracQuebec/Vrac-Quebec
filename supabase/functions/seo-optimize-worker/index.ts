// Industrial SEO optimization worker.
// - Claims a batch of pending tasks (concurrency-limited).
// - Runs seo-qa-autofix on each in parallel.
// - Records journal (qa_before/after, ai_calls, duration, cost).
// - Self-invokes to continue until the run is done, paused, or cancelled.
// - Accepts admin JWT (manual kick) OR service-role key (self-invoke / cron).
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

// Rough per-call cost estimate for Gemini Flash (USD). Adjust as needed.
const COST_PER_AI_CALL = 0.0015;

type Task = {
  id: string;
  page_id: string;
  attempts: number;
  max_attempts: number;
  qa_before: number | null;
};

async function claimBatch(supabase: ReturnType<typeof createClient>, runId: string, size: number): Promise<Task[]> {
  // Atomic claim via RPC-less SQL: single UPDATE with SKIP LOCKED subquery.
  const { data, error } = await supabase.rpc("exec_claim_optim_tasks" as never, {
    _run_id: runId,
    _size: size,
  }).returns<Task[]>();
  if (!error && Array.isArray(data)) return data;
  // Fallback: two-step with FOR UPDATE SKIP LOCKED via raw select+update loop.
  const picked: Task[] = [];
  const { data: rows } = await supabase
    .from("seo_optimization_tasks")
    .select("id, page_id, attempts, max_attempts, qa_before")
    .eq("run_id", runId)
    .in("status", ["pending", "error"])
    .lte("attempts", 10)
    .order("created_at", { ascending: true })
    .limit(size);
  for (const row of rows ?? []) {
    const { data: upd } = await supabase
      .from("seo_optimization_tasks")
      .update({ status: "claimed", started_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .in("status", ["pending", "error"])
      .select("id, page_id, attempts, max_attempts, qa_before")
      .maybeSingle();
    if (upd) picked.push(upd as Task);
  }
  return picked;
}

async function processTask(supabase: ReturnType<typeof createClient>, supaUrl: string, serviceKey: string, task: Task, run: { qa_skip_above: number; force_all: boolean; actions: string[] }) {
  const start = Date.now();
  try {
    // Fetch current page qa
    const { data: page } = await supabase
      .from("seo_pages")
      .select("id, qa_last_score, status")
      .eq("id", task.page_id)
      .maybeSingle();

    const qaBefore = page?.qa_last_score ?? null;

    // Smart skip: already above threshold and not forced
    if (!run.force_all && qaBefore !== null && qaBefore >= run.qa_skip_above) {
      await supabase.from("seo_optimization_tasks").update({
        status: "skipped",
        skip_reason: `QA ${qaBefore} ≥ ${run.qa_skip_above}`,
        qa_before: qaBefore,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
      }).eq("id", task.id);
      return;
    }

    // Mark optimizing
    await supabase.from("seo_optimization_tasks").update({ status: "optimizing", qa_before: qaBefore }).eq("id", task.id);

    // Call autofix with service-role bearer (internal call)
    const res = await fetch(`${supaUrl}/functions/v1/seo-qa-autofix`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ page_id: task.page_id, actions: run.actions ?? [] }),
    });
    const body = await res.json().catch(() => ({}));
    // Edge Function runtime rate limit: retry without penalizing the task.
    if (res.status === 429 || /Rate limit exceeded for trace/i.test(String(body?.error ?? ""))) {
      const retryMsMatch = /Retry after (\d+)ms/i.exec(String(body?.error ?? "")) ?? /Retry after (\d+)ms/i.exec(res.headers.get("retry-after") ?? "");
      const retryMs = Math.min(60_000, Math.max(2_000, Number(retryMsMatch?.[1] ?? "5000")));
      await supabase.from("seo_optimization_tasks").update({
        status: "pending",
        attempts: Math.max(0, (task.attempts ?? 1) - 1), // don't consume an attempt on rate limit
        error: null,
        last_error_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now() + retryMs).toISOString(),
        started_at: null,
      }).eq("id", task.id);
      await new Promise((r) => setTimeout(r, retryMs));
      return;
    }
    if (!res.ok || body?.error) {
      throw new Error(body?.error || `autofix ${res.status}`);
    }
    const fixed: string[] = Array.isArray(body?.fixed) ? body.fixed : [];
    const aiCalls: number = Number(body?.ai_calls ?? 0);
    const qaAfter: number | null = typeof body?.new_score === "number" ? body.new_score : null;

    await supabase.from("seo_optimization_tasks").update({
      status: "completed",
      qa_after: qaAfter,
      fixed_actions: fixed,
      ai_calls: aiCalls,
      cost_estimate: aiCalls * COST_PER_AI_CALL,
      duration_ms: Date.now() - start,
      finished_at: new Date().toISOString(),
      error: null,
    }).eq("id", task.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const willRetry = task.attempts < task.max_attempts;
    await supabase.from("seo_optimization_tasks").update({
      status: willRetry ? "pending" : "error",
      error: message.slice(0, 500),
      last_error_at: new Date().toISOString(),
      next_attempt_at: willRetry ? new Date(Date.now() + Math.min(60_000, 5_000 * task.attempts)).toISOString() : null,
      duration_ms: Date.now() - start,
      finished_at: willRetry ? null : new Date().toISOString(),
    }).eq("id", task.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Non autorisé" }, 401);
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

    const isInternal = jwt === serviceKey;
    if (!isInternal) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Session invalide" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const runId: string | undefined = body?.run_id;
    if (!runId) {
      // No specific run: pick the currently active one.
      const { data: active } = await supabase
        .from("seo_optimization_runs")
        .select("id")
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return json({ ok: true, message: "Aucun run actif." });
      return await kick(supabase, supaUrl, serviceKey, active.id);
    }
    return await kick(supabase, supaUrl, serviceKey, runId);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function kick(supabase: ReturnType<typeof createClient>, supaUrl: string, serviceKey: string, runId: string): Promise<Response> {
  const worker = async () => {
    while (true) {
      const { data: run } = await supabase
        .from("seo_optimization_runs")
        .select("id, status, concurrency, qa_skip_above, force_all, actions")
        .eq("id", runId)
        .maybeSingle();
      if (!run || run.status !== "running") {
        console.log(`worker: stopping (run status = ${run?.status ?? "missing"})`);
        return;
      }

      const batch = await claimBatch(supabase, runId, Math.max(1, Math.min(20, run.concurrency ?? 5)));
      if (batch.length === 0) {
        console.log("worker: no tasks to claim; exiting loop.");
        return;
      }

      await Promise.all(batch.map((t) => processTask(supabase, supaUrl, serviceKey, t, {
        qa_skip_above: run.qa_skip_above ?? 95,
        force_all: run.force_all ?? false,
        actions: Array.isArray(run.actions) ? run.actions : [],
      })));

      // Bump last_progress_at
      await supabase.from("seo_optimization_runs").update({ last_progress_at: new Date().toISOString() }).eq("id", runId);
    }
  };

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(worker());
  } else {
    void worker();
  }
  return json({ ok: true, run_id: runId, kicked: true });
}