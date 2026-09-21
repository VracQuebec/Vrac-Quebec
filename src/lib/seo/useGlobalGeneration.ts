import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_PREVIEW, normalizePreview, type MissingPreview } from "@/lib/seo/globalGeneration";

/**
 * Orchestration du bouton « Générer toutes les pages manquantes ».
 * Aucune logique SEO ici : la pertinence, l'unicité et la file sont gérées
 * par le moteur existant (seo_city_slots_expected + seo_pipeline_*).
 */
export function useGlobalGeneration(active: boolean) {
  const [preview, setPreview] = useState<MissingPreview>(EMPTY_PREVIEW);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [baseline, setBaseline] = useState<MissingPreview | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const { data, error } = await supabase.rpc("seo_pipeline_missing_preview" as never);
      if (error) throw error;
      setPreview(normalizePreview(data));
    } catch { /* l'écran conserve les derniers chiffres connus */ }
    finally { inflight.current = false; setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => { void refresh(); }, 8000);
    return () => window.clearInterval(t);
  }, [active, refresh]);

  /** Démarre (ou rejoint) la génération globale. Idempotent côté base. */
  const start = useCallback(async (): Promise<{ created: boolean; cities: number; runId: string | null }> => {
    setStarting(true);
    setBaseline(preview);
    try {
      const { data, error } = await supabase.rpc("seo_pipeline_start_missing" as never, { _qa_threshold: 90 } as never);
      if (error) throw error;
      const r = (data ?? {}) as Record<string, unknown>;
      // Le cron reprend de toute façon, mais on démarre tout de suite.
      void supabase.functions.invoke("seo-pipeline-orchestrator", { body: { steps: 20 } }).catch(() => {});
      await refresh();
      return {
        created: r.created === true,
        cities: Number(r.cities ?? 0),
        runId: typeof r.run_id === "string" ? r.run_id : null,
      };
    } finally { setStarting(false); }
  }, [preview, refresh]);

  return { preview, baseline, loading, starting, refresh, start, clearBaseline: () => setBaseline(null) };
}
