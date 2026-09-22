import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ControlCityRow = {
  slug: string;
  name: string;
  planned: number;
  generated: number;
  published: number;
  drafts: number;
  remaining: number;
  errors: number;
  invalid: number;
  pending: number;
  unpublished: number;
  /** Progression de GÉNÉRATION (la publication reste manuelle). */
  pct: number;
  pct_published: number;
  status: "done" | "running" | "error" | "todo" | "partial";
};

export type ControlTotals = {
  per_city: number;
  cities: number;
  /** Combinaisons théoriques (informatif seulement, jamais une file de production). */
  potential_total?: number;
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
  const hasData = useRef(false);

  const load = useCallback(async () => {
    // Nouvelles tentatives : sous forte charge (lecture complète des 2 077 pages
    // en parallèle), l'appel peut dépasser le délai d'exécution de la base.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.rpc("seo_control_center" as never);
      if (!error) {
        setState(data as unknown as ControlCenterState);
        hasData.current = true;
        setError(null);
        setLoading(false);
        return;
      }
      lastError = error;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    // Un rafraîchissement périodique en échec ne doit pas effacer ni contredire
    // des chiffres déjà lus correctement : on garde l'état affiché.
    if (!hasData.current) {
      setError(lastError instanceof Error ? lastError.message : "Erreur de chargement");
    }
    setLoading(false);
  }, []);

  const schedule = useCallback(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => { void load(); }, 600);
  }, [load]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`seo-control-center-` + Math.random().toString(36).slice(2))
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
