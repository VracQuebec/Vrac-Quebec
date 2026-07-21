import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSeoStats, type SeoStats } from "@/lib/seo/api";

type State = { stats: SeoStats | null; loading: boolean; error: string | null };

/**
 * Unified SEO stats hook — single source of truth.
 * Refetches automatically when seo_pages or seo_generation_jobs change.
 */
export function useSeoStats() {
  const [state, setState] = useState<State>({ stats: null, loading: true, error: null });
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const stats = await fetchSeoStats();
      setState({ stats, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Erreur" }));
    }
  }, []);

  const scheduleReload = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { void load(); }, 800);
  }, [load]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("seo-stats-live")
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