import type { MySubmission } from "@/lib/parcours/mes-demandes";
import type { AccessRequestRow } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { statusBucket, statusMeta } from "@/lib/access-requests/status";
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
      nextAction: waitingSite ? "Suivre la décision des dompes" : state.filter === "done" || state.filter === "cancelled" ? "Consulter le dossier" : "Suivre le dossier",
      chantierKey: chantier?.key ?? null,
      chantierLabel: chantier?.label ?? submission.location ?? "Chantier à confirmer",
      submission,
    };
  });

  const transports = accessRequests.map<EntrepreneurRequestView>((transport) => {
    const meta = statusMeta(String(transport.status));
    const bucket = statusBucket(String(transport.status));
    const cancelled = ["annulee", "refusee"].includes(String(transport.status));
    const filter = cancelled ? "cancelled" : bucket === "completed" ? "done" : bucket === "pending" ? "pending" : "active";
    const place = [transport.site_city, transport.site_address].filter(Boolean).join(" — ") || "Lieu à confirmer";
    const chantier = findChantierForTransport(chantiers, transport);
    return {
      id: `r-${String(transport.id)}`,
      sourceId: String(transport.id),
      kind: "transport",
      title: String(transport.material_type ?? "Transport en vrac"),
      place,
      quantity: transport.estimated_trips != null ? `${String(transport.estimated_trips)} voyage(s)` : null,
      date: (transport.created_at as string | null) ?? null,
      status: String(transport.status),
      statusLabel: meta.label,
      tone: cancelled ? "refused" : bucket === "completed" ? "done" : bucket === "accepted" ? "active" : "pending",
      filter,
      nextAction: filter === "pending" ? "En traitement par notre équipe" : filter === "active" ? "Suivre le transport" : "Consulter le dossier",
      chantierKey: chantier?.key ?? null,
      chantierLabel: chantier?.label ?? place,
      transport,
    };
  });

  return [...transports, ...materialRequests].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export const requestMatchesFilter = (request: EntrepreneurRequestView, filter: RequestFilter) =>
  filter === "all" || request.filter === filter;