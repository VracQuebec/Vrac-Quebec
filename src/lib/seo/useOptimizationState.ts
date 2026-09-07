import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OptimizationRun = {
  id: string;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  concurrency: number;
  qa_threshold: number;
  qa_skip_above: number;
  force_all: boolean;
  actions: string[];
  filter: Record<string, unknown>;
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  skipped: number;
  retried: number;
  ai_calls: number;
  cost_estimate: number;
  started_at: string | null;
  finished_at: string | null;
  last_progress_at: string | null;
  created_at: string;
};

export type OptimizationTask = {
  id: string;
  status: string;
  qa_before: number | null;
  qa_after: number | null;
  ai_calls: number;
  cost_estimate: number;
  duration_ms: number | null;
  fixed_actions: string[];
  error: string | null;
  skip_reason: string | null;
  attempts: number;
  finished_at: string | null;
  started_at: string | null;
  slug: string;
  title: string;
};

export type OptimizationToday = {
  runs_today: number;
  pages_today: number;
  skipped_today: number;
  failed_today: number;
  ai_calls_today: number;
  cost_today: number;
  avg_duration_ms: number;
};

type State = {
  activeRun: OptimizationRun | null;
  journal: OptimizationTask[];
  history: OptimizationRun[];
  today: OptimizationToday | null;
  loading: boolean;
  error: string | null;
};

export function useOptimizationState() {
  const [state, setState] = useState<State>({
    activeRun: null, journal: [], history: [], today: null, loading: true, error: null,
  });
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("seo_optimization_state");
      if (error) throw error;
      const payload = data as {
        active_run: OptimizationRun | null;
        journal: OptimizationTask[];
        history: OptimizationRun[];
        today: OptimizationToday | null;
      } | null;
      setState({
        activeRun: payload?.active_run ?? null,
        journal: payload?.journal ?? [],
        history: payload?.history ?? [],
        today: payload?.today ?? null,
        loading: false,
        error: null,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Erreur" }));
    }
  }, []);

  const schedule = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { void load(); }, 500);
  }, [load]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`seo-optim-live-` + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_optimization_runs" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_optimization_tasks" }, schedule)
      .subscribe();
    // Poll every 5s as fallback (in case realtime is throttled during heavy inserts)
    const poll = window.setInterval(() => { void load(); }, 5000);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      window.clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [load, schedule]);

  return { ...state, reload: load };
}