import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSeoStats, type SeoStats } from "@/lib/seo/api";

type ActiveJob = {
  id: string; mode: string; wave: string | null;
  total: number; done: number; succeeded: number; failed: number;
  pages_per_minute: number | null; eta_seconds: number | null;
  current_step: string | null;
} | null;

type State = {
  stats: SeoStats | null;
  activeJob: ActiveJob;
  loading: boolean;
  error: string | null;
  /** Source réelle de l'échec, affichée à l'utilisateur au lieu d'un message générique. */
  errorSource: string | null;
  updatedAt: string | null;
};

const RETRIES = 2;

/**
 * Unified SEO pipeline state — single source of truth.
 * Reads `seo_pipeline_state()` RPC (stats + active job + recent jobs) and refetches
 * on any change to seo_pages or seo_generation_jobs.
 * Les statistiques déjà chargées sont conservées en cas d'échec transitoire ;
 * l'erreur est effacée dès qu'une lecture réussit.
 */
export function useSeoStats() {
  const [state, setState] = useState<State>({ stats: null, activeJob: null, loading: true, error: null, errorSource: null, updatedAt: null });
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    let lastError: string | null = null;
    let source = "Statistiques du pipeline SEO";
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const { data, error } = await supabase.rpc("seo_pipeline_state");
        if (error) throw error;
        const payload = data as { stats: SeoStats; active_job: ActiveJob } | null;
        if (payload?.stats) {
          setState({ stats: payload.stats, activeJob: payload.active_job ?? null, loading: false, error: null, errorSource: null, updatedAt: new Date().toISOString() });
          return;
        }
        // Fallback to legacy stats-only RPC
        source = "Statistiques consolidées (source de repli)";
        const stats = await fetchSeoStats();
        setState({ stats, activeJob: null, loading: false, error: null, errorSource: null, updatedAt: new Date().toISOString() });
        return;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Erreur inconnue";
        // Attente courte avant nouvelle tentative (erreur réseau ou requête lente).
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    setState((s) => ({ ...s, loading: false, error: lastError, errorSource: source }));
  }, []);

  const scheduleReload = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { void load(); }, 400);
  }, [load]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`seo-stats-live-` + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pages" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_generation_jobs" }, scheduleReload)
      .subscribe();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      void supabase.removeChannel(ch);
    };
  }, [load, scheduleReload]);

  return { ...state, reload: load };
}
