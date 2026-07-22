import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PipelineRun = {
  id: string; mode: string; status: string;
  city_slugs: string[]; qa_threshold: number; max_retries: number;
  force_regenerate: boolean;
  total_pages: number; done_pages: number; succeeded_pages: number; failed_pages: number;
  retries_count: number; qa_avg: number | null;
  current_city_slug: string | null;
  pages_per_minute: number | null; eta_seconds: number | null;
  started_at: string | null; finished_at: string | null;
  created_at: string;
};

export type CityBatch = {
  id: string; run_id: string; city_slug: string; status: string; sort_order: number;
  total_tasks: number; done_tasks: number; succeeded_tasks: number; failed_tasks: number;
  qa_avg: number | null; current_step: string | null;
  started_at: string | null; finished_at: string | null; last_error: string | null;
};

export type PipelineState = {
  active_run: PipelineRun | null;
  batches: CityBatch[];
  recent_runs: Array<Pick<PipelineRun, "id" | "mode" | "status" | "total_pages" | "done_pages" | "succeeded_pages" | "failed_pages" | "qa_avg" | "started_at" | "finished_at" | "created_at">>;
  computed_at: string;
};

export function useSeoPipelineV2() {
  const [state, setState] = useState<PipelineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);
  const pokerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("seo_pipeline_state_v2");
      if (error) throw error;
      setState(data as unknown as PipelineState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  const schedule = useCallback(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => { void load(); }, 400);
  }, [load]);

  const poke = useCallback(async () => {
    try { await supabase.functions.invoke("seo-pipeline-orchestrator", { body: { steps: 2 } }); }
    catch { /* ignore */ }
  }, []);

  // Client-side poker: while a run is active, ping orchestrator every 4s
  useEffect(() => {
    if (pokerRef.current) { window.clearInterval(pokerRef.current); pokerRef.current = null; }
    const run = state?.active_run;
    if (run && (run.status === "running" || run.status === "queued")) {
      pokerRef.current = window.setInterval(() => { void poke(); }, 4000);
      void poke();
    }
    return () => { if (pokerRef.current) window.clearInterval(pokerRef.current); };
  }, [state?.active_run?.id, state?.active_run?.status, poke]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("seo-pipeline-v2-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pipeline_runs" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_city_batches" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_page_tasks" }, schedule)
      .subscribe();
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
      void supabase.removeChannel(ch);
    };
  }, [load, schedule]);

  const start = useCallback(async (opts?: { mode?: string; city_slugs?: string[]; qa_threshold?: number; force?: boolean }) => {
    const { error } = await supabase.rpc("seo_pipeline_start", {
      _mode: opts?.mode ?? "all_cities",
      _city_slugs: opts?.city_slugs ?? null,
      _qa_threshold: opts?.qa_threshold ?? 90,
      _force_regenerate: opts?.force ?? false,
    });
    if (error) throw error;
    await load();
    void poke();
  }, [load, poke]);

  const pause = useCallback(async (id: string) => { await supabase.rpc("seo_pipeline_pause", { _run_id: id }); await load(); }, [load]);
  const resume = useCallback(async (id: string) => { await supabase.rpc("seo_pipeline_resume", { _run_id: id }); await load(); void poke(); }, [load, poke]);
  const stop = useCallback(async (id: string) => { await supabase.rpc("seo_pipeline_stop", { _run_id: id }); await load(); }, [load]);
  const cancel = useCallback(async (id: string) => { await supabase.rpc("seo_pipeline_cancel", { _run_id: id }); await load(); }, [load]);
  const retryErrors = useCallback(async (id: string) => { await supabase.rpc("seo_pipeline_retry_errors", { _run_id: id }); await load(); void poke(); }, [load, poke]);
  const regenerateCity = useCallback(async (slug: string) => { await supabase.rpc("seo_pipeline_regenerate_city", { _city_slug: slug }); await load(); void poke(); }, [load, poke]);
  const republishCity = useCallback(async (slug: string) => { await supabase.rpc("seo_pipeline_republish_city", { _city_slug: slug }); await load(); void poke(); }, [load, poke]);

  return { state, loading, error, reload: load, start, pause, resume, stop, cancel, retryErrors, regenerateCity, republishCity, poke };
}