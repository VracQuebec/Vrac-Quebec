// ============================================================
// « RÉSUMÉ D'ACTIVITÉ » — VUE CALCULÉE, LECTURE SEULE.
// Aucune table, aucune RPC dédiée, aucune statistique parallèle :
// les compteurs réutilisent EXACTEMENT les logiques déjà validées
//   • Demandes          → loadMySubmissions (RPC get_my_submissions)
//   • Chantiers         → buildChantiers   (Mes chantiers)
//   • Sites recommandés → buildRecommendedSites (Sites recommandés)
//   • Transports        → transport_requests réellement rattachés
//                         (origin_submission_id), filtrés par RLS.
// Une donnée absente reste absente : jamais transformée en 0.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";
import { loadMySubmissions, type MySubmissionsResult } from "@/lib/parcours/mes-demandes";
import { buildChantiers } from "@/lib/parcours/chantiers";
import { buildRecommendedSites } from "@/lib/parcours/sites-recommandes";

export interface ActivityQueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface ActivityFilterBuilder {
  not: (column: string, op: string, value: unknown) => PromiseLike<ActivityQueryResult>;
}

export interface ActivityClient extends RpcClient {
  from: (table: string) => { select: (cols: string) => ActivityFilterBuilder };
}

export interface ActivitySummary {
  demandes: number;
  chantiers: number;
  sitesRecommandes: number;
  /** null = information non disponible (jamais affichée comme 0). */
  transports: number | null;
}

export type ActivityResult =
  | { state: "ok"; summary: ActivitySummary }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

/** Compte les transports RÉELLEMENT rattachés à une demande (RLS serveur). */
const countLinkedTransports = async (client: ActivityClient): Promise<number | null> => {
  try {
    const { data, error } = await client
      .from("transport_requests")
      .select("origin_submission_id")
      .not("origin_submission_id", "is", null);
    if (error) return null;
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const ids = new Set(
      rows.map((r) => String(r.origin_submission_id ?? "")).filter((v) => v.length > 0),
    );
    return ids.size;
  } catch {
    return null;
  }
};

/** Résumé d'activité du compte connecté. Lecture seule, aucune écriture. */
export const loadActivitySummary = async (
  client: ActivityClient = supabase as unknown as ActivityClient,
): Promise<ActivityResult> => {
  const res: MySubmissionsResult = await loadMySubmissions(client);
  if (res.state !== "ok") return res;
  const transports = await countLinkedTransports(client);
  return {
    state: "ok",
    summary: {
      demandes: res.submissions.length,
      chantiers: buildChantiers(res.submissions).length,
      sitesRecommandes: buildRecommendedSites(res.submissions).length,
      transports,
    },
  };
};
