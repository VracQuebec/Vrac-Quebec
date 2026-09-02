import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";

export type BulkMode = "optimize" | "refresh";
export type BulkScope = "all" | "to_improve" | "to_refresh" | "errors";

export type BulkOverview = {
  computed_at: string;
  total: number;
  excellent: number;
  good: number;
  weak: number;
  never_analyzed: number;
  to_improve: number;
  to_refresh: number;
  errors: number;
  avg_score: number;
};

export type BulkPreview = {
  mode: BulkMode;
  scope: BulkScope;
  analyzed: number;
  in_scope: number;
  will_process: number;
  to_improve: number;
  to_refresh: number;
  already_excellent: number;
  errors: number;
  sample: Array<{ slug: string; title: string; score: number | null; is_error: boolean; is_to_improve: boolean; is_to_refresh: boolean }>;
};

export type BulkRun = {
  id: string;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  skipped: number;
  concurrency: number;
  started_at: string | null;
  finished_at: string | null;
  last_progress_at: string | null;
  filter: Record<string, unknown>;
};

export type BulkCounts = {
  total: number; pending: number; in_progress: number;
  completed: number; skipped: number; errors: number; improved: number;
};

export type BulkTask = {
  id: string; status: string; qa_before: number | null; qa_after: number | null;
  fixed_actions: string[]; error: string | null; skip_reason: string | null;
  finished_at: string | null; slug: string; title: string;
};

export type BulkState = {
  run: BulkRun | null;
  mode: BulkMode | null;
  scope: BulkScope | null;
  current_page: { slug: string; title: string } | null;
  counts: BulkCounts | null;
  recent: BulkTask[];
};

export type BulkError = {
  task_id: string; page_id: string; slug: string; title: string;
  error: string | null; attempts: number; last_error_at: string | null;
};

const ACTIVE = new Set(["queued", "running", "paused"]);

export function useBulkOptimization() {
  const [overview, setOverview] = useState<BulkOverview | null>(null);
  const [state, setState] = useState<BulkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const watchdogRef = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        supabase.rpc("seo_bulk_overview" as never),
        supabase.rpc("seo_bulk_state" as never),
      ]);
      if (o.error) throw o.error;
      if (s.error) throw s.error;
      setOverview(o.data as unknown as BulkOverview);
      const st = (s.data ?? null) as unknown as BulkState | null;
      setState(st && st.run ? st : { run: null, mode: null, scope: null, current_page: null, counts: null, recent: [] });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  const isActive = !!state?.run && ACTIVE.has(state.run.status);

  /** Kick the worker (idempotent) — used at start, on resume and by the watchdog. */
  const kick = useCallback(async (runId: string) => {
    await invokeWithFreshSession("seo-optimize-worker", { run_id: runId });
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Live polling while an operation is active (plus slow refresh otherwise).
  useEffect(() => {
    const delay = isActive ? 3000 : 30000;
    const t = window.setInterval(() => { void load(); }, delay);
    return () => window.clearInterval(t);
  }, [isActive, load]);

  // Watchdog: a running queue with no progress for 90s is re-kicked automatically,
  // so a stalled worker can never freeze the whole operation.
  useEffect(() => {
    const run = state?.run;
    if (!run || run.status !== "running") return;
    const last = run.last_progress_at ? new Date(run.last_progress_at).getTime() : 0;
    if (Date.now() - last < 90_000) return;
    if (Date.now() - watchdogRef.current < 60_000) return;
    watchdogRef.current = Date.now();
    void kick(run.id);
  }, [state, kick]);

  const preview = useCallback(async (mode: BulkMode, scope: BulkScope): Promise<BulkPreview> => {
    const { data, error: e } = await supabase.rpc("seo_bulk_preview" as never, { _mode: mode, _scope: scope } as never);
    if (e) throw e;
    return data as unknown as BulkPreview;
  }, []);

  const start = useCallback(async (mode: BulkMode, scope: BulkScope, limit?: number) => {
    const { data, error: e } = await supabase.rpc("seo_bulk_start" as never, {
      _mode: mode, _scope: scope, _concurrency: 3, _limit: limit ?? null,
    } as never);
    if (e) throw e;
    const res = data as unknown as { run_id: string; total: number };
    if (res.total > 0) await kick(res.run_id);
    await load();
    return res;
  }, [kick, load]);

  const control = useCallback(async (action: "pause" | "resume" | "cancel" | "retry") => {
    const runId = state?.run?.id;
    if (!runId) return;
    const rpc = ({
      pause: "seo_optimization_pause",
      resume: "seo_optimization_resume",
      cancel: "seo_optimization_cancel",
      retry: "seo_optimization_retry_errors",
    } as const)[action];
    const { error: e } = await supabase.rpc(rpc as never, { _run_id: runId } as never);
    if (e) throw e;
    if (action === "resume" || action === "retry") await kick(runId);
    await load();
  }, [state, kick, load]);

  const listErrors = useCallback(async (runId: string): Promise<BulkError[]> => {
    const { data, error: e } = await supabase.rpc("seo_bulk_errors" as never, { _run_id: runId } as never);
    if (e) throw e;
    return (data ?? []) as unknown as BulkError[];
  }, []);

  const retryTask = useCallback(async (taskId: string, runId: string) => {
    const { error: e } = await supabase.rpc("seo_bulk_retry_task" as never, { _task_id: taskId } as never);
    if (e) throw e;
    await kick(runId);
    await load();
  }, [kick, load]);

  return { overview, state, loading, error, isActive, reload: load, preview, start, control, listErrors, retryTask };
}

export async function fetchPageHistory(pageId: string) {
  const { data, error } = await supabase.rpc("seo_page_optim_history" as never, { _page_id: pageId, _limit: 25 } as never);
  if (error) throw error;
  return (data ?? []) as unknown as Array<{
    task_id: string; run_id: string; status: string; qa_before: number | null; qa_after: number | null;
    fixed_actions: string[]; skip_reason: string | null; error: string | null; finished_at: string; mode: string;
  }>;
}
