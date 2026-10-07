// ============================================================
// « MES CHANTIERS » — VUE CALCULÉE (aucune table « chantiers »).
// Les chantiers sont dérivés en mémoire des demandes réellement
// enregistrées et retournées par la RPC sécurisée `get_my_submissions`.
// Lecture seule : aucune écriture, aucune création, aucune donnée inventée.
//
// Règle : aucune fusion sans lien explicite à un projet. Chaque demande
// reste un dossier séparé (clé « s:<id> »); ville, place_id approximatif
// et adresse identique ne suffisent jamais.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";
import { isApproximateLocation } from "@/lib/parcours/sens-besoin";
import { loadMySubmissions, type MySubmission, type MySubmissionsResult } from "@/lib/parcours/mes-demandes";
import { submissionDisplayState } from "@/lib/parcours/submission-display";

export interface Chantier {
  /** Clé de navigation locale ; la propriété réelle reste vérifiée en base. */
  key: string;
  /** Origine de la clé de regroupement, pour transparence/tests. */
  groupedBy: "place_id" | "address" | "city" | "single";
  /** true seulement avec un rattachement explicite à un projet de l'entreprise (aucun aujourd'hui). */
  projectLinked: boolean;
  label: string;
  city: string | null;
  address: string | null;
  materials: string[];
  lastActivity: string | null;
  submissions: MySubmission[];
}

export type ChantierTone = "pending" | "active" | "done" | "refused" | "neutral";

export interface ChantierSummary {
  material: string | null;
  quantity: string | null;
  createdAt: string | null;
  lastActivity: string | null;
  statusLabel: string;
  tone: ChantierTone;
  active: boolean;
}

export type ChantiersResult =
  | { state: "ok"; chantiers: Chantier[] }
  | { state: "unauthorized" }
  | { state: "error"; message: string };


/**
 * Aucune fusion sans lien explicite : ni ville, ni centre de ville, ni
 * identifiant Google approximatif, ni même une adresse identique ne
 * prouvent qu'il s'agit du même projet. Chaque demande reste séparée.
 */
export const groupingKey = (
  s: MySubmission,
): { key: string; groupedBy: Chantier["groupedBy"] } => ({ key: `s:${s.id}`, groupedBy: "single" });

export const buildChantiers = (submissions: MySubmission[]): Chantier[] =>
  submissions
    .map<Chantier>((s) => {
      const precise = !isApproximateLocation(s) ? s.address : null;
      return {
        key: groupingKey(s).key,
        groupedBy: "single",
        projectLinked: false,
        label: precise || (s.city ? `${s.city} — lieu à préciser` : "Lieu à préciser"),
        city: s.city,
        address: s.address,
        materials: s.material ? [s.material] : [],
        lastActivity: s.createdAt,
        submissions: [s],
      };
    })
    .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));

/** Résumé d'affichage dérivé uniquement des demandes déjà autorisées. */
export const summarizeChantier = (chantier: Chantier): ChantierSummary => {
  const latest = [...chantier.submissions].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  )[0] ?? null;
  const states = chantier.submissions.map((submission) => submissionDisplayState(submission.status));
  const allClosed = states.length > 0 && states.every((state) => state.closed);
  const representative = states.find((state) => state.active && state.confirmed) ?? states.find((state) => state.active) ?? states[0];
  return {
    material: latest?.material ?? chantier.materials[0] ?? null,
    quantity: latest?.quantity ?? null,
    createdAt: latest?.createdAt ?? null,
    lastActivity: chantier.lastActivity,
    statusLabel: representative?.label ?? "État à confirmer",
    tone: representative?.tone ?? "neutral",
    active: !allClosed,
  };
};

export const findChantierForSubmission = (chantiers: Chantier[], submissionId: string) =>
  chantiers.find((chantier) => chantier.submissions.some((submission) => submission.id === submissionId)) ?? null;


/** Un transport n'est associé que par son lien explicite à la demande d'origine. */
export const findChantierForTransport = (chantiers: Chantier[], transport: Record<string, unknown>) => {
  const origin = transport.origin_submission_id ? String(transport.origin_submission_id) : null;
  if (!origin) return null;
  return findChantierForSubmission(chantiers, origin);
};

/** Charge les chantiers de l'utilisateur connecté (vue calculée, lecture seule). */
export const loadMyChantiers = async (
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<ChantiersResult> => {
  const res: MySubmissionsResult = await loadMySubmissions(client);
  if (res.state !== "ok") return res;
  return { state: "ok", chantiers: buildChantiers(res.submissions) };
};
