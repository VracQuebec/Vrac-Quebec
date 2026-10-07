import type { MySubmission } from "@/lib/parcours/mes-demandes";

export type SubmissionTone = "pending" | "active" | "done" | "refused" | "neutral";
export type SubmissionFilter = "active" | "pending" | "confirmed" | "done" | "cancelled";

export interface SubmissionDisplayState {
  key: string;
  label: string;
  tone: SubmissionTone;
  filter: SubmissionFilter;
  active: boolean;
  confirmed: boolean;
  closed: boolean;
}

export interface LinkedTransportEvidence {
  status?: unknown;
  lifecycle_status?: unknown;
}

export type JourneyStageKey = "request" | "search" | "solution" | "transport" | "execution" | "closed";

export interface JourneyStage {
  key: JourneyStageKey;
  label: string;
  detail: string;
}

/** Normalise uniquement pour comparer à l'écran; aucune valeur enregistrée n'est changée. */
export const normalizeSubmissionStatus = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const STATES: Record<string, Omit<SubmissionDisplayState, "key">> = {
  nouveau: { label: "Nouvelle", tone: "pending", filter: "pending", active: true, confirmed: false, closed: false },
  nouvelle: { label: "Nouvelle", tone: "pending", filter: "pending", active: true, confirmed: false, closed: false },
  en_analyse: { label: "En analyse", tone: "pending", filter: "pending", active: true, confirmed: false, closed: false },
  message_texte_envoye: { label: "Message texte envoyé", tone: "pending", filter: "pending", active: true, confirmed: false, closed: false },
  soumission_envoyee: { label: "Soumission envoyée", tone: "pending", filter: "pending", active: true, confirmed: false, closed: false },
  en_attente_proprietaire: { label: "En attente", tone: "pending", filter: "pending", active: true, confirmed: false, closed: false },
  informations_requises: { label: "Informations requises", tone: "pending", filter: "pending", active: true, confirmed: false, closed: false },
  acceptee: { label: "Acceptée", tone: "active", filter: "active", active: true, confirmed: true, closed: false },
  soumission_acceptee: { label: "Soumission acceptée", tone: "active", filter: "active", active: true, confirmed: true, closed: false },
  paiement_effectue: { label: "Paiement effectué", tone: "active", filter: "active", active: true, confirmed: true, closed: false },
  en_attente_de_livraison: { label: "En attente de livraison", tone: "active", filter: "active", active: true, confirmed: true, closed: false },
  planifiee: { label: "Planifiée", tone: "active", filter: "active", active: true, confirmed: true, closed: false },
  en_cours: { label: "En cours", tone: "active", filter: "active", active: true, confirmed: true, closed: false },
  terminee: { label: "Terminée", tone: "done", filter: "done", active: false, confirmed: true, closed: true },
  archive: { label: "Archivée", tone: "neutral", filter: "cancelled", active: false, confirmed: false, closed: true },
  perdu: { label: "Perdue", tone: "refused", filter: "cancelled", active: false, confirmed: false, closed: true },
  refusee: { label: "Refusée", tone: "refused", filter: "cancelled", active: false, confirmed: false, closed: true },
  annulee: { label: "Annulée", tone: "refused", filter: "cancelled", active: false, confirmed: false, closed: true },
};

export const submissionDisplayState = (status: string | null | undefined): SubmissionDisplayState => {
  const key = normalizeSubmissionStatus(status);
  const known = STATES[key];
  if (known) return { key, ...known };
  return {
    key,
    label: status?.trim() || "État à confirmer",
    tone: "neutral",
    filter: "pending",
    active: true,
    confirmed: false,
    closed: false,
  };
};

export const submissionNeedLabel = (
  submission: Pick<MySubmission, "material" | "quantity">,
  directionKnown: boolean,
  knownLabel: string,
): string => {
  if (directionKnown) return knownLabel;
  return submission.material || submission.quantity ? "Sens à confirmer" : "Informations à compléter";
};

const transportState = (transport: LinkedTransportEvidence | null | undefined) => {
  const lifecycle = normalizeSubmissionStatus(String(transport?.lifecycle_status ?? ""));
  const status = normalizeSubmissionStatus(String(transport?.status ?? ""));
  return { lifecycle, status };
};

/** Étape la plus avancée prouvée par les champs et liens déjà chargés. */
export const deriveJourneyStage = (
  submission: MySubmission,
  transport?: LinkedTransportEvidence | null,
): JourneyStage => {
  const state = submissionDisplayState(submission.status);
  if (state.closed) {
    return { key: "closed", label: "Dossier fermé", detail: state.label };
  }

  const linked = transport != null;
  const ts = transportState(transport);
  if (linked && (ts.lifecycle === "en_cours" || ts.status === "en_cours")) {
    return { key: "execution", label: "Exécution", detail: "Transport en cours" };
  }
  if (
    linked &&
    (["confirmee", "prete_transport"].includes(ts.lifecycle) ||
      ["acceptee", "planifiee"].includes(ts.status))
  ) {
    return { key: "transport", label: "Transport confirmé", detail: "Transport lié et confirmé" };
  }
  if (linked) {
    return {
      key: "transport",
      label: "Transport à organiser",
      detail: ts.lifecycle === "a_valider" ? "Transport lié, à valider" : "Transport lié",
    };
  }
  if (submission.selectedSiteId || submission.siteValidatedAt) {
    return {
      key: "solution",
      label: "Solution trouvée",
      detail: submission.siteValidatedAt ? "Site validé" : "Site choisi",
    };
  }
  if (["en_analyse", "message_texte_envoye", "soumission_envoyee", "en_attente_proprietaire"].includes(state.key)) {
    return { key: "search", label: "Recherche de solution", detail: state.label };
  }
  return { key: "request", label: "Demande créée", detail: state.label };
};