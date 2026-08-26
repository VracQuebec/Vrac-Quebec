import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ControlCityRow = {
  slug: string;
  name: string;
  planned: number;
  generated: number;
  published: number;
  remaining: number;
  errors: number;
  invalid: number;
  pending: number;
  unpublished: number;
  pct: number;
  status: "done" | "running" | "error" | "todo" | "partial";
};

export type ControlTotals = {
  per_city: number;
  cities: number;
  target_total: number;
  generated: number;
  published: number;
  drafts: number;
  errors: number;
  remaining: number;
};

export type ControlRun = {
  id: string;
  mode: string;
  status: string;
  total_pages: number;
  done_pages: number;
  succeeded_pages: number;
  failed_pages: number;
  current_city_slug: string | null;
  eta_seconds: number | null;
  pages_per_minute: number | null;
} | null;

export type ControlCenterState = {
  computed_at: string;
  totals: ControlTotals;
  cities: ControlCityRow[];
  active_run: ControlRun;
  queued_tasks: number;
  processing_tasks: number;
  stalled_tasks: number;
  pipeline_state: "running" | "waiting" | "partial" | "blocked" | "completed";
  problems: ControlProblem[];
};

export type ControlProblem = {
  city_slug: string;
  city_name: string;
  kind: "hub" | "material" | "service";
  material_slug: string | null;
  service_slug: string | null;
  label: string;
  gen_state: "error" | "invalid" | "pending" | "missing";
  task_status: string | null;
  task_step: string | null;
  task_attempts: number | null;
  task_error: string | null;
  task_updated_at: string | null;
  issues: string[] | null;
};

/**
 * Single source of truth for the SEO control center.
 * Everything is computed server-side from seo_pages / seo_cities / seo_page_tasks.
 */
export function useSeoControlCenter() {
  const [state, setState] = useState<ControlCenterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("seo_control_center" as never);
      if (error) throw error;
      setState(data as unknown as ControlCenterState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  const schedule = useCallback(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => { void load(); }, 600);
  }, [load]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("seo-control-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pages" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_page_tasks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pipeline_runs" }, schedule)
      .subscribe();
    const t = window.setInterval(() => { void load(); }, 30000);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
      window.clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [load, schedule]);

  return { state, loading, error, reload: load };
}
