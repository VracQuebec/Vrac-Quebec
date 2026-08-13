// ============================================================
// « SITES RECOMMANDÉS » — VUE CALCULÉE, LECTURE SEULE.
// Aucune table, aucun moteur de matching, aucune recommandation
// inventée : un site n'est affiché que lorsqu'il est RÉELLEMENT
// rattaché à une demande de l'entrepreneur connecté
// (`submissions.selected_site_id`, enregistré par le comparateur).
// Les informations affichées proviennent uniquement de la RPC
// sécurisée `get_my_submissions` (SECURITY DEFINER, auth.uid()).
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";
import { loadMySubmissions, type MySubmission, type MySubmissionsResult } from "@/lib/parcours/mes-demandes";
import { availabilityInfo, type AvailabilityInfo } from "@/lib/entrepreneur/site-match";

/** Origine réelle de la recommandation (jamais « meilleur site »). */
export type RecommendationReason = "selected_site" | "validated_site";

export interface RecommendedSite {
  /** Identifiant du site réellement enregistré sur la demande. */
  siteId: string;
  /** Demande d'origine : le contexte est toujours affiché. */
  submissionId: string;
  submissionNumber: number | null;
  reason: RecommendationReason;
  label: string | null;
  address: string | null;
  /** Matériau réellement lié à la demande (jamais supposé). */
  material: string | null;
  /** Chantier (ville/adresse de la demande). */
  chantier: string | null;
  /** Distance/durée uniquement si déjà calculées et enregistrées. */
  distanceKm: number | null;
  durationMinutes: number | null;
  /** Disponibilité réelle du site, ou « À confirmer ». */
  availability: AvailabilityInfo;
  selectionUpdatedAt: string | null;
}

export type RecommendedSitesResult =
  | { state: "ok"; sites: RecommendedSite[] }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

export const buildRecommendedSites = (submissions: MySubmission[]): RecommendedSite[] =>
  submissions
    .filter((s) => !!s.selectedSiteId)
    .map((s) => ({
      siteId: s.selectedSiteId as string,
      submissionId: s.id,
      submissionNumber: s.number,
      reason: s.siteValidatedAt ? ("validated_site" as const) : ("selected_site" as const),
      label: s.selectedSiteLabel,
      address: s.selectedSiteAddress,
      material: s.quoteMaterial ?? s.material,
      chantier: s.city ?? s.location ?? s.address,
      distanceKm: s.distanceKm,
      durationMinutes: s.durationMinutes,
      availability: availabilityInfo({
        materials: null,
        truck_types_allowed: null,
        accessibility: null,
        availability_status: s.siteAvailabilityStatus,
        availability_updated_at: s.siteAvailabilityUpdatedAt,
      }),
      selectionUpdatedAt: s.selectionUpdatedAt,
    }));

/** Charge les sites réellement rattachés aux demandes de l'utilisateur. */
export const loadRecommendedSites = async (
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<RecommendedSitesResult> => {
  const res: MySubmissionsResult = await loadMySubmissions(client);
  if (res.state !== "ok") return res;
  return { state: "ok", sites: buildRecommendedSites(res.submissions) };
};
