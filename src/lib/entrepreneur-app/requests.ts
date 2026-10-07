import type { MySubmission } from "@/lib/parcours/mes-demandes";
import type { AccessRequestRow } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { statusBucket, statusMeta } from "@/lib/access-requests/status";
import { lifecycleMeta } from "@/lib/entrepreneur-app/lifecycle";
import { NEED_LABELS, needDirection, needsDumpSearch } from "@/lib/parcours/sens-besoin";
import { transportKindLabel } from "@/components/entrepreneur-app/SubmissionProvenance";
import {
  findChantierForSubmission,
  findChantierForTransport,
  type Chantier,
} from "@/lib/parcours/chantiers";

export type RequestTone = "pending" | "active" | "done" | "refused" | "neutral";
export type RequestFilter = "all" | "active" | "pending" | "confirmed" | "done" | "cancelled";

export interface EntrepreneurRequestView {
  id: string;
  sourceId: string;
  kind: "materiau" | "transport";
  title: string;
  place: string;
  quantity: string | null;
  date: string | null;
  status: string | null;
  statusLabel: string;
  tone: RequestTone;
  filter: Exclude<RequestFilter, "all">;
  nextAction: string;
  reference: string;
  typeLabel: string;
  city: string;
  subjectLabel: string;
  isConfirmed: boolean;
  chantierKey: string | null;
  chantierLabel: string;
  /** Libellé du sens du besoin ou de la nature de la demande d'accès. */
  natureLabel: string;
  /** true seulement pour une évacuation déclarée. */
  dumpSearch: boolean;
  submission?: MySubmission;
  transport?: AccessRequestRow;
}

const CONFIRMED_STATUSES = new Set(["acceptee", "planifiee", "en_cours"]);
const CONFIRMED_LIFECYCLES = new Set(["confirmee", "prete_transport", "en_cours"]);

const submissionState = (status: string | null, waitingSite: boolean) => {
  if (status === "annulee" || status === "refusee") {
    return { label: status === "annulee" ? "Annulée" : "Refusée", tone: "refused" as const, filter: "cancelled" as const };
  }
  if (status === "terminee") return { label: "Terminée", tone: "done" as const, filter: "done" as const };
  if (waitingSite || ["nouvelle", "en_analyse", "soumission_envoyee", "en_attente_proprietaire"].includes(status ?? "")) {
    return { label: waitingSite ? "Dompe en attente" : "En attente", tone: "pending" as const, filter: "pending" as const };
  }
  return { label: "En cours", tone: "active" as const, filter: "active" as const };
};

export function buildEntrepreneurRequests(
  submissions: MySubmission[],
  accessRequests: AccessRequestRow[],
  chantiers: Chantier[] = [],
): EntrepreneurRequestView[] {
  const materialRequests = submissions.map<EntrepreneurRequestView>((submission) => {
    const waitingSite = Boolean(submission.selectedSiteId && !submission.siteValidatedAt);
    const state = submissionState(submission.status, waitingSite);
    const chantier = findChantierForSubmission(chantiers, submission.id);
    const need = needDirection(submission);
    return {
      id: `s-${submission.id}`,
      sourceId: submission.id,
      kind: "materiau",
      title: submission.material || "Demande de matériau",
      place: submission.location || "Lieu à confirmer",
      quantity: submission.quantity,
      date: submission.createdAt,
      status: submission.status,
      statusLabel: state.label,
      tone: state.tone,
      filter: state.filter,
      nextAction: waitingSite ? "Suivre la décision des dompes" : need === "a_preciser" ? "Préciser le besoin (recevoir, évacuer ou acheter)" : state.filter === "done" || state.filter === "cancelled" ? "Consulter le dossier" : "Suivre le dossier",
      reference: submission.number != null ? String(submission.number) : submission.id.slice(0, 8).toUpperCase(),
      typeLabel: submission.requestType ? submission.requestType.replace(/_/g, " ") : "Non précisé",
      city: submission.city || "À compléter",
      subjectLabel: submission.material || "Non précisé",
      isConfirmed: CONFIRMED_STATUSES.has(submission.status ?? "") || Boolean(submission.siteValidatedAt),
      chantierKey: chantier?.key ?? null,
      chantierLabel: chantier?.label ?? submission.location ?? "Chantier à confirmer",
      natureLabel: NEED_LABELS[need],
      dumpSearch: needsDumpSearch(need),
      submission,
    };
  });

  const transports = accessRequests.map<EntrepreneurRequestView>((transport) => {
    const meta = statusMeta(String(transport.status));
    const bucket = statusBucket(String(transport.status));
    const cancelled = ["annulee", "refusee"].includes(String(transport.status));
    const life = lifecycleMeta(transport.lifecycle_status as string | undefined);
    const filter = life ? life.filter : cancelled ? "cancelled" : bucket === "completed" ? "done" : bucket === "pending" ? "pending" : "active";
    const place = [transport.site_city, transport.site_address].filter(Boolean).join(" — ") || "Lieu à confirmer";
    const chantier = findChantierForTransport(chantiers, transport);
    return {
      id: `r-${String(transport.id)}`,
      sourceId: String(transport.id),
      kind: "transport",
      title: `${transport.request_number ? `Nº ${String(transport.request_number)} · ` : ""}${String(transport.material_type ?? "Transport en vrac")}`,
      place,
      quantity: transport.estimated_trips != null ? `${String(transport.estimated_trips)} voyage(s)` : null,
      date: (transport.created_at as string | null) ?? null,
      status: String(transport.status),
      // Libellé unique partagé avec l'administration (seule la revalidation est propre à l'entrepreneur).
      statusLabel: transport.lifecycle_status === "revalidation_requise" && life ? life.label : meta.label,
      tone: life ? life.tone : cancelled ? "refused" : bucket === "completed" ? "done" : bucket === "accepted" ? "active" : "pending",
      filter,
      nextAction: filter === "pending" ? "Demande envoyée — accès non encore accordé" : filter === "active" ? "Suivre le transport" : "Consulter le dossier",
      reference: transport.request_number ? String(transport.request_number) : String(transport.id).slice(0, 8).toUpperCase(),
      typeLabel: transport.request_kind === "transport" ? "Transport" : "Accès à une dompe",
      city: transport.site_city ? String(transport.site_city) : "À compléter",
      subjectLabel: transport.material_type ? String(transport.material_type) : "Non précisé",
      isConfirmed: CONFIRMED_STATUSES.has(String(transport.status)) || CONFIRMED_LIFECYCLES.has(String(transport.lifecycle_status ?? "")),
      chantierKey: chantier?.key ?? null,
      chantierLabel: chantier?.label ?? place,
      natureLabel: transportKindLabel(transport),
      dumpSearch: false,
      transport,
    };
  });

  return [...transports, ...materialRequests].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export const requestMatchesFilter = (request: EntrepreneurRequestView, filter: RequestFilter) =>
  filter === "all" || (filter === "confirmed" ? request.isConfirmed : request.filter === filter);

export type TrackingStepState = "done" | "current" | "upcoming";
export interface TrackingStep { label: string; state: TrackingStepState }

/** Présentation seulement : chaque étape s'appuie sur un statut ou un lien déjà chargé. */
export function buildRequestTracking(request: EntrepreneurRequestView): TrackingStep[] {
  const terminal = request.filter === "done";
  const stopped = request.filter === "cancelled";
  const submission = request.submission;
  const transport = request.transport;
  const solutionFound = Boolean(submission?.siteValidatedAt || request.isConfirmed || terminal);
  const transportRequested = Boolean(transport || submission?.id && false);

  if (request.kind === "transport") {
    return [
      { label: "Demande créée", state: "done" },
      { label: "Recherche de solution", state: request.isConfirmed || terminal ? "done" : stopped ? "upcoming" : "current" },
      { label: "Transport confirmé", state: terminal ? "done" : request.isConfirmed ? "current" : "upcoming" },
      { label: "Terminé", state: terminal ? "done" : "upcoming" },
    ];
  }

  return [
    { label: "Demande créée", state: "done" },
    { label: "Recherche de solution", state: solutionFound ? "done" : stopped ? "upcoming" : "current" },
    { label: "Solution trouvée", state: solutionFound ? (transportRequested || terminal ? "done" : "current") : "upcoming" },
    ...(transportRequested ? [{ label: "Transport demandé", state: terminal ? "done" : "current" } as TrackingStep] : []),
    { label: "Terminé", state: terminal ? "done" : "upcoming" },
  ];
}