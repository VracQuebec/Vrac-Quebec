import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";

export type SlotRow = {
  city_slug: string;
  city_name: string;
  kind: "hub" | "material" | "service";
  material_slug: string | null;
  service_slug: string | null;
  label: string;
  page_id: string | null;
  page_slug: string | null;
  title: string | null;
  page_status: string | null;
  published_at: string | null;
  word_count: number | null;
  seo_score: number | null;
  last_generated_at: string | null;
  issues: string[] | null;
  gen_state: "ok" | "invalid" | "error" | "pending" | "missing";
  pub_state: "published" | "unpublished" | "na";
  task_status: string | null;
  task_step: string | null;
  task_attempts: number | null;
  task_error: string | null;
  task_updated_at: string | null;
};

export type CityMatrix = {
  city_slug: string;
  computed_at: string;
  summary: {
    planned: number; generated: number; published: number;
    remaining: number; errors: number; invalid: number; unpublished: number;
  };
  slots: SlotRow[];
};

export const GEN_LABEL: Record<SlotRow["gen_state"], string> = {
  ok: "Générée",
  invalid: "Invalide",
  error: "Erreur",
  pending: "En cours",
  missing: "À générer",
};

/** Matrice réelle d'une ville : un emplacement = ville + matériau/service. */
export function useSeoCityMatrix(citySlug: string | null) {
  const [matrix, setMatrix] = useState<CityMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!citySlug) { setMatrix(null); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("seo_city_matrix" as never, { _city_slug: citySlug } as never);
      if (error) throw error;
      setMatrix(data as unknown as CityMatrix);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [citySlug]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh tant qu'une page est en cours de traitement.
  useEffect(() => {
    if (!matrix?.slots.some((s) => s.gen_state === "pending")) return;
    const t = window.setInterval(() => { void load(); }, 8000);
    return () => window.clearInterval(t);
  }, [matrix, load]);

  return { matrix, loading, error, reload: load };
}

/** Régénère une seule page (ou toutes celles réellement en erreur d'une ville). */
export async function repairSeoPages(input: {
  citySlug: string;
  materialSlug?: string | null;
  serviceSlug?: string | null;
  allErrors?: boolean;
}) {
  const { data, error } = await invokeWithFreshSession("seo-page-repair", {
    city_slug: input.citySlug,
    material_slug: input.materialSlug ?? null,
    service_slug: input.serviceSlug ?? null,
    all_errors: input.allErrors ?? false,
  });
  if (error) throw new Error(error.message);
  const d = data as { error?: string; queued?: number; done?: boolean; message?: string; skipped_published?: number };
  if (d?.error) throw new Error(d.error);
  return d;
}
