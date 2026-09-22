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

// Lecture mutualisée : plusieurs blocs du Centre affichent la même couverture.
// Sans cela, chaque bloc déclenchait son propre calcul lourd en parallèle et
// la base annulait les requêtes (délai dépassé), d'où des compteurs à 0.
const CC_TTL_MS = 60_000;
let ccCache: { at: number; state: ControlCenterState } | null = null;
let ccInFlight: Promise<ControlCenterState> | null = null;

async function readControlCenter(force: boolean): Promise<ControlCenterState> {
  if (!force && ccCache && Date.now() - ccCache.at < CC_TTL_MS) return ccCache.state;
  if (ccInFlight) return ccInFlight;
  const run = (async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.rpc("seo_control_center" as never);
      if (!error) {
        const st = data as unknown as ControlCenterState;
        ccCache = { at: Date.now(), state: st };
        return st;
      }
      lastError = error;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    throw lastError instanceof Error ? lastError : new Error("Erreur de chargement");
  })().finally(() => { if (ccInFlight === run) ccInFlight = null; });
  ccInFlight = run;
  return run;
}

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
    try {
      const st = await readControlCenter(false);
      setState(st);
      hasData.current = true;
      setError(null);
    } catch (e) {
      // Un rafraîchissement périodique en échec ne doit pas effacer ni contredire
      // des chiffres déjà lus correctement : on garde l'état affiché.
      if (!hasData.current) setError(e instanceof Error ? e.message : "Erreur de chargement");
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
      .channel(`seo-control-center-` + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pages" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_page_tasks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_pipeline_runs" }, schedule)
      .subscribe();
    // Ce calcul de couverture est coûteux : rafraîchissement espacé pour garder
    // le Centre réactif (l'utilisateur peut toujours actualiser manuellement).
    const t = window.setInterval(() => { void load(); }, 180000);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
      window.clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [load, schedule]);

  return { state, loading, error, reload: load };
}
