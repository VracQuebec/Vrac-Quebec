// ============================================================
// SOURCE UNIQUE des dompes visibles par les entrepreneurs.
// Règle métier : une dompe est admissible dès que son statut est
// « en attente de livraison » et qu'elle possède une position
// publique anonymisée. Le champ « disponibilité » n'entre PAS
// dans l'admissibilité (il reste affiché à titre informatif).
//
// La carte, les listes, la recherche et les recommandations
// doivent toutes passer par getEligibleEntrepreneurDumpSites().
// Lecture temps réel : aucun cache, aucune copie mémorisée.
// Les coordonnées retournées sont TOUJOURS les coordonnées
// publiques anonymisées (jamais l'adresse ni le GPS réel).
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface EntrepreneurDumpSite {
  id: string;
  submission_number?: number | null;
  dompe_number?: string | null;
  materials?: string[] | null;
  /** Latitude PUBLIQUE anonymisée. */
  latitude: number | null;
  /** Longitude PUBLIQUE anonymisée. */
  longitude: number | null;
  availability_status?: string | null;
  truck_types_allowed?: string[] | null;
  opening_hours?: string | null;
  remaining_capacity?: string | null;
  accessibility?: string[] | null;
  freshness?: string | null;
  [key: string]: unknown;
}

export interface EligibleDumpSitesResult {
  sites: EntrepreneurDumpSite[];
  error: string | null;
  fetchedAt: number;
}

/**
 * Retourne, en temps réel, le bassin complet des dompes admissibles
 * côté entrepreneur. Les entrepreneurs approuvés reçoivent la vue
 * détaillée ; sinon, la vue publique (mêmes dompes, moins de champs).
 */
export async function getEligibleEntrepreneurDumpSites(): Promise<EligibleDumpSitesResult> {
  const at = () => Date.now();
  const leads = await supabase.rpc("get_entrepreneur_leads");
  if (!leads.error && Array.isArray(leads.data) && leads.data.length > 0) {
    return { sites: leads.data as unknown as EntrepreneurDumpSite[], error: null, fetchedAt: at() };
  }
  const pub = await supabase.rpc("get_public_dumps");
  if (pub.error) {
    return { sites: [], error: leads.error?.message ?? pub.error.message, fetchedAt: at() };
  }
  const rows = (pub.data ?? []) as unknown as EntrepreneurDumpSite[];
  if (rows.length === 0 && !leads.error && Array.isArray(leads.data)) {
    return { sites: [], error: null, fetchedAt: at() };
  }
  return { sites: rows, error: null, fetchedAt: at() };
}

/** Garde-fou d'affichage : ne garde que les points réellement cartographiables. */
export function mappableDumpSites<T extends { latitude?: number | null; longitude?: number | null }>(
  sites: T[],
): T[] {
  return sites.filter((s) => typeof s.latitude === "number" && typeof s.longitude === "number");
}

/**
 * Numéro CRM exact d'une dompe (« Dompe 128 » → « 128 »).
 * Aucun repli : ni submission_number, ni index, ni identifiant technique.
 * Retourne null si le CRM ne porte pas de numéro valide.
 */
export function crmDompeNumber(d: { dompe_number?: string | null }): string | null {
  const raw = (d.dompe_number ?? "").trim();
  const m = raw.match(/^(?:dompe\s*)?#?\s*(\d+)$/i);
  return m ? m[1] : null;
}
