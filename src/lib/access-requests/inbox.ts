// Boîte des nouvelles demandes de dompes (accueil super admin).
// État d'affichage dérivé : statut de la demande + suivi (request_followups).
// Ouvrir une demande la marque « Consultée », jamais « Traitée ».
import { normalizeStatus } from "./status";

export type InboxState = "nouvelle" | "consultee" | "en_traitement" | "traitee";

export const INBOX_LABELS: Record<InboxState, string> = {
  nouvelle: "Nouvelle",
  consultee: "Consultée",
  en_traitement: "En traitement",
  traitee: "Traitée",
};

const HANDLED = new Set(["acceptee", "refusee", "terminee", "annulee"]);
const IN_PROGRESS = new Set(["en_analyse", "informations_requises", "en_attente_proprietaire"]);

export interface InboxFollowup {
  seen_at: string | null;
  taken_at: string | null;
  follow_status: string | null;
  resolved_at?: string | null;
}

export function inboxState(rawStatus: string | null | undefined, f?: InboxFollowup | null): InboxState {
  const s = normalizeStatus(rawStatus);
  if (HANDLED.has(s)) return "traitee";
  if (IN_PROGRESS.has(s) || f?.taken_at || f?.follow_status === "prise_en_charge") return "en_traitement";
  if (f?.seen_at) return "consultee";
  return "nouvelle";
}

/** Demandes à garder visibles : tout ce qui n'est pas traité. */
export const isPending = (state: InboxState) => state !== "traitee";

/** Statuts bruts exclus du compteur « À traiter » (décision finale, y compris anciens équivalents). */
export const CLOSED_RAW_STATUSES = ["acceptee", "refusee", "terminee", "annulee", "planifiee", "en_cours"];

const URGENCY_RANK: Record<InboxState, number> = { nouvelle: 0, consultee: 1, en_traitement: 2, traitee: 3 };

/** Plus urgentes d'abord : jamais ouvertes, puis consultées, puis en traitement; à égalité, la plus ancienne d'abord. */
export function sortByUrgency<T extends { state: InboxState; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    URGENCY_RANK[a.state] - URGENCY_RANK[b.state] || a.created_at.localeCompare(b.created_at));
}
