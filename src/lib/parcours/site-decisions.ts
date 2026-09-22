// ============================================================
// APPROBATION DOMPE PAR DOMPE (relation demande + dompe).
// Une seule source : les RPC sécurisées `get_submission_sites`
// (lecture, divulgation progressive côté serveur) et
// `decide_submission_site` (décision, réservée à l'administration).
// Le frontend ne reçoit l'adresse/les coordonnées réelles QUE si la
// relation est approuvée : rien n'est masqué visuellement ici.
// Aucune logique de carte, de position publique ou d'admissibilité
// n'est redéfinie dans ce fichier.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";

export type SiteDecisionStatus = "en_attente" | "approuvee" | "refusee";

export interface SubmissionSite {
  submissionId: string;
  siteId: string;
  siteLabel: string | null;
  status: SiteDecisionStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string | null;
  /** Statut de la dompe elle-même (admissibilité) — jamais un déclencheur d'adresse. */
  siteStatus: string | null;
  siteMaterial: string | null;
  /** Position publique anonymisée (déjà en place, inchangée). */
  publicLatitude: number | null;
  publicLongitude: number | null;
  /** Renseignés par le serveur uniquement si la relation est approuvée. */
  siteAddress: string | null;
  siteLatitude: number | null;
  siteLongitude: number | null;
}

export type SubmissionSitesResult =
  | { state: "ok"; sites: SubmissionSite[] }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const asStatus = (v: unknown): SiteDecisionStatus => {
  const t = String(v ?? "").trim();
  return t === "approuvee" || t === "refusee" ? t : "en_attente";
};

export const mapSubmissionSite = (row: unknown): SubmissionSite | null => {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (!r.site_id || !r.submission_id) return null;
  return {
    submissionId: String(r.submission_id),
    siteId: String(r.site_id),
    siteLabel: str(r.site_label),
    status: asStatus(r.status),
    decidedAt: str(r.decided_at),
    decisionNote: str(r.decision_note),
    createdAt: str(r.created_at),
    siteStatus: str(r.site_status),
    siteMaterial: str(r.site_material),
    publicLatitude: num(r.public_latitude),
    publicLongitude: num(r.public_longitude),
    siteAddress: str(r.site_address),
    siteLatitude: num(r.site_latitude),
    siteLongitude: num(r.site_longitude),
  };
};

/** Libellé humain de l'état d'approbation d'une dompe dans une demande. */
export const decisionLabel = (status: SiteDecisionStatus): string =>
  status === "approuvee" ? "Approuvée" : status === "refusee" ? "Refusée" : "En attente";

/**
 * Les dompes rattachées à une demande, avec leur état d'approbation.
 * Accessible à l'administration et au propriétaire réel de la demande.
 */
export const loadSubmissionSites = async (
  submissionId: string | null | undefined,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<SubmissionSitesResult> => {
  if (!submissionId) return { state: "ok", sites: [] };
  const { data, error } = await client.rpc("get_submission_sites", {
    p_submission_id: submissionId,
  });
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("not_authorized") || m.includes("permission")) return { state: "unauthorized" };
    return { state: "error", message: error.message || "Lecture impossible." };
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    state: "ok",
    sites: rows.map(mapSubmissionSite).filter((s): s is SubmissionSite => s !== null),
  };
};

export type DecisionResult =
  | { ok: true; site: { siteId: string; status: SiteDecisionStatus; changed: boolean } }
  | { ok: false; message: string };

/**
 * Décision administrateur sur UNE relation (demande + dompe).
 * Idempotente : rejouée avec la même décision, aucun second avis n'est créé.
 */
export const decideSubmissionSite = async (
  submissionId: string,
  siteId: string,
  decision: SiteDecisionStatus,
  note: string | null = null,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<DecisionResult> => {
  if (!submissionId || !siteId) return { ok: false, message: "Demande ou dompe manquante." };
  const { data, error } = await client.rpc("decide_submission_site", {
    p_submission_id: submissionId,
    p_site_id: siteId,
    p_decision: decision,
    p_note: note && note.trim() ? note.trim() : null,
  });
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("not_authorized")) {
      return { ok: false, message: "Action réservée à l'administration." };
    }
    return { ok: false, message: error.message || "Décision impossible." };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (!r.site_id) return { ok: false, message: "Réponse inattendue du serveur." };
  return {
    ok: true,
    site: {
      siteId: String(r.site_id),
      status: asStatus(r.status),
      changed: r.changed === true,
    },
  };
};

/** Ajoute une dompe admissible à une demande (propriétaire ou administration). */
export const addSubmissionSite = async (
  submissionId: string,
  siteId: string,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const { error } = await client.rpc("add_submission_site", {
    p_submission_id: submissionId,
    p_site_id: siteId,
  });
  if (!error) return { ok: true };
  const m = (error.message || "").toLowerCase();
  if (m.includes("site_not_eligible")) {
    return { ok: false, message: "Cette dompe n'est plus en attente de livraison." };
  }
  if (m.includes("not_authorized")) return { ok: false, message: "Accès refusé." };
  return { ok: false, message: error.message || "Ajout impossible." };
};

/** Retire une dompe d'une demande : son approbation ne suit jamais ailleurs. */
export const removeSubmissionSite = async (
  submissionId: string,
  siteId: string,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const { error } = await client.rpc("remove_submission_site", {
    p_submission_id: submissionId,
    p_site_id: siteId,
  });
  if (!error) return { ok: true };
  return { ok: false, message: error.message || "Retrait impossible." };
};
