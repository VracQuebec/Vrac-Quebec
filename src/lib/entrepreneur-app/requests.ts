import type { MySubmission } from "@/lib/parcours/mes-demandes";
import type { AccessRequestRow } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { statusBucket, statusMeta } from "@/lib/access-requests/status";
import { lifecycleMeta } from "@/lib/entrepreneur-app/lifecycle";
import { NEED_LABELS, needDirection, needsDumpSearch } from "@/lib/parcours/besoin";
import { transportKindLabel } from "@/components/entrepreneur-app/SubmissionProvenance";
import {
  findChantierForSubmission,
  findChantierForTransport,
  type Chantier,
} from "@/lib/parcours/chantiers";

export type RequestTone = "pending" | "active" | "done" | "refused" | "neutral";
export type RequestFilter = "all" | "active" | "pending" | "done" | "cancelled";

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
  chantierKey: string | null;
  chantierLabel: string;
  /** Libellé du sens du besoin ou de la nature de la demande d'accès. */
  natureLabel: string;
  /** true seulement pour une évacuation déclarée. */
  dumpSearch: boolean;
  submission?: MySubmission;
  transport?: AccessRequestRow;
}

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
  filter === "all" || request.filter === filter;