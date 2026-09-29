// ============================================================
// CENTRE DE CONTRÔLE — modèle unifié en LECTURE des demandes
// existantes (submissions + transport_requests). Aucune seconde
// base : on projette les statuts actuels vers des groupes d'affichage.
// ============================================================

export type Group = "nouvelle" | "attente" | "traitement" | "traitee" | "annulee";
export type Priority = "critique" | "urgent" | "attention" | "suivi" | "ok" | "normal";
export type Filter =
  | "all" | "new" | "unseen" | "urgent" | "waiting" | "processing" | "followup" | "done" | "cancelled";

export const FILTER_LABELS: Record<Filter, string> = {
  all: "Toutes", new: "Nouvelles", unseen: "Non consultées", urgent: "Urgentes",
  waiting: "En attente", processing: "En traitement", followup: "Suivi requis",
  done: "Traitées", cancelled: "Annulées",
};

export interface NotifLite {
  id: string; entity_id: string | null; entity_type: string | null; status: string;
  category: string; title: string; created_at: string; read_at: string | null;
}

export interface Followup {
  id: string; entity_type: string; entity_id: string; received_at: string; is_test: boolean;
  follow_status: "nouvelle" | "consultee" | "prise_en_charge" | "en_attente" | "resolue";
  seen_at: string | null; seen_by_email: string | null;
  assignee_email: string | null; taken_at: string | null;
  next_action: string | null; next_reminder_at: string | null; reminder_reason: string | null;
  reminder_fired_at: string | null; escalation_stage: number;
  resolved_at: string | null; resolution_note: string | null;
}

export const FOLLOW_LABEL: Record<Followup["follow_status"], string> = {
  nouvelle: "Nouvelle", consultee: "Consultée", prise_en_charge: "Prise en charge",
  en_attente: "En attente", resolue: "Résolue",
};

export interface ControlRequest {
  key: string;
  id: string;
  kind: "dompe" | "transport";
  number: string;
  typeLabel: string;
  requester: string;
  city: string;
  service: string;
  createdAt: string;
  updatedAt: string | null;
  status: string;
  group: Group;
  followUpAt: string | null;
  fullUrl: string;
  raw: Record<string, unknown>;
  // enrichi
  notifs: NotifLite[];
  followup: Followup | null;
  critical: boolean;
  unseen: boolean;
  taken: boolean;
  overdue: boolean;
  followup: boolean;
  priority: Priority;
  lastAction: string;
}

const SUB_GROUP: Record<string, Group> = {
  "nouveau": "nouvelle",
  "message texte envoyé": "attente",
  "soumission envoyée": "attente",
  "soumission acceptée": "traitement",
  "en attente de livraison": "traitee",
  "paiement effectué": "traitee",
  "perdu": "annulee",
  "archivé": "annulee",
};

const TR_GROUP: Record<string, Group> = {
  nouvelle: "nouvelle",
  a_rappeler: "attente", informations_requises: "attente", en_attente_proprietaire: "attente",
  soumission_envoyee: "attente",
  en_analyse: "traitement", acceptee: "traitement", planifiee: "traitement", en_cours: "traitement",
  terminee: "traitee",
  annulee: "annulee", refusee: "annulee",
};

export const TR_STATUS_LABEL: Record<string, string> = {
  nouvelle: "Nouvelle", a_rappeler: "À rappeler", en_analyse: "En analyse",
  soumission_envoyee: "Soumission envoyée", acceptee: "Acceptée", planifiee: "Planifiée",
  en_cours: "En cours", terminee: "Terminée", annulee: "Annulée",
  en_attente_proprietaire: "En attente du propriétaire", refusee: "Refusée",
  informations_requises: "Informations requises",
};

export const GROUP_LABEL: Record<Group, string> = {
  nouvelle: "Nouvelle", attente: "En attente", traitement: "En traitement",
  traitee: "Traitée", annulee: "Annulée",
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export function fromSubmission(r: Row): Omit<ControlRequest, "notifs" | "followup" | "critical" | "unseen" | "taken" | "overdue" | "followup" | "priority" | "lastAction"> {
  const status = s(r.status);
  const mats = Array.isArray(r.materials) ? (r.materials as string[]).join(", ") : "";
  return {
    key: `submission:${r.id}`,
    id: s(r.id),
    kind: "dompe",
    number: s(r.dompe_number) || (r.submission_number ? `#${r.submission_number}` : "—"),
    typeLabel: s(r.request_type) || "Demande de remblai",
    requester: s(r.company) || s(r.name) || "—",
    city: s(r.city),
    service: [s(r.service_type), mats, s(r.other_material)].filter(Boolean).join(" · "),
    createdAt: s(r.created_at),
    updatedAt: (r.updated_at as string) ?? null,
    status,
    group: SUB_GROUP[status] ?? "attente",
    followUpAt: (r.next_follow_up_at as string) ?? null,
    fullUrl: `/admin?lead=${r.id}`,
    raw: r,
  };
}

export function fromTransport(r: Row): ReturnType<typeof fromSubmission> {
  const status = s(r.status);
  return {
    key: `transport_request:${r.id}`,
    id: s(r.id),
    kind: "transport",
    number: s(r.request_number) || "—",
    typeLabel: "Transport",
    requester: s(r.client_company) || s(r.client_name) || "—",
    city: s(r.site_city),
    service: [s(r.material_type), s(r.material_other)].filter(Boolean).join(" · "),
    createdAt: s(r.created_at),
    updatedAt: (r.updated_at as string) ?? null,
    status: TR_STATUS_LABEL[status] ?? status,
    group: TR_GROUP[status] ?? "attente",
    followUpAt: null,
    fullUrl: `/admin/demandes-acces`,
    raw: r,
  };
}

export interface Delays { firstMin: number; secondMin: number; criticalHours: number; followupDays: number }

export function enrich(
  base: ReturnType<typeof fromSubmission>,
  notifs: NotifLite[],
  followup: Followup | null,
  delays: Delays,
  now = Date.now(),
): ControlRequest {
  const resolved = followup?.follow_status === "resolue";
  const open = !resolved && (base.group === "nouvelle" || base.group === "attente" || base.group === "traitement");
  // Afficher une demande ne la rend jamais « traitée » : seule une action enregistrée compte.
  const unseen = followup ? !followup.seen_at && followup.follow_status === "nouvelle" : notifs.some((n) => n.status === "unread");
  const taken = !!followup?.taken_at || resolved || base.group !== "nouvelle" || notifs.some((n) => n.status === "in_progress");
  const ageMin = (now - new Date(base.createdAt).getTime()) / 60_000;
  const overdue = open && base.group === "nouvelle" && !taken && ageMin > delays.firstMin;
  const critical = overdue && ageMin > delays.criticalHours * 60;
  const reminderAt = followup?.next_reminder_at ?? base.followUpAt;
  const updAgeD = base.updatedAt ? (now - new Date(base.updatedAt).getTime()) / 86_400_000 : 0;
  const followup_ = open && (
    (!!reminderAt && new Date(reminderAt).getTime() <= now) ||
    (base.group === "attente" && updAgeD > delays.followupDays)
  );
  let priority: Priority = "normal";
  if (!open) priority = base.group === "traitee" || resolved ? "ok" : "normal";
  else if (critical) priority = "critique";
  else if (overdue) priority = "attention";
  else if (base.group === "nouvelle" && !taken) priority = "urgent";
  else if (followup_) priority = "suivi";
  const last = [...notifs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    ...base, followUpAt: reminderAt, notifs, followup, critical, unseen, taken, overdue,
    followup: followup, followupDue: undefined as never, priority,
    lastAction: last ? last.title : "Aucune action enregistrée",
  } as unknown as ControlRequest & { followup: Followup | null } extends infer T ? T & { followup: Followup | null } : never;
}

export function matches(r: ControlRequest, f: Filter) {
  switch (f) {
    case "new": return r.group === "nouvelle" && !r.taken;
    case "unseen": return r.unseen;
    case "urgent": return r.overdue || r.priority === "critique";
    case "waiting": return r.group === "attente";
    case "processing": return r.group === "traitement" || (r.group === "nouvelle" && r.taken);
    case "followup": return r.followup;
    case "done": return r.group === "traitee";
    case "cancelled": return r.group === "annulee";
    default: return true;
  }
}

/** Ordre de la zone « Action immédiate » : urgent non pris → retard → suivi → nouvelles. */
export function actionRank(r: ControlRequest): number {
  if (r.group === "nouvelle" && !r.taken && r.overdue) return 0;
  if (r.overdue) return 1;
  if (r.followup) return 2;
  if (r.group === "nouvelle" && !r.taken) return 3;
  return 9;
}

export function elapsed(iso: string, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

export type SystemState = "ok" | "verify" | "error" | "late";
export const SYSTEM_LABEL: Record<SystemState, string> = {
  ok: "Fonctionnel", verify: "Vérification requise",
  error: "Erreur de notification", late: "Synchronisation en retard",
};

/**
 * Jamais « Fonctionnel » sans preuve : il faut une lecture réussie, un canal
 * temps réel confirmé, et un avis pour la dernière demande reçue.
 */
export function computeSystemState(p: {
  loadOk: boolean; lastSyncAt: number | null; realtime: boolean;
  lastRequestAt: string | null; lastRequestHasNotif: boolean | null; now?: number;
}): SystemState {
  const now = p.now ?? Date.now();
  if (!p.loadOk || !p.lastSyncAt) return "verify";
  if (now - p.lastSyncAt > 3 * 60_000) return "late";
  if (p.lastRequestAt && p.lastRequestHasNotif === false &&
      now - new Date(p.lastRequestAt).getTime() > 10 * 60_000) return "error";
  if (!p.realtime || p.lastRequestHasNotif == null) return "verify";
  return "ok";
}
