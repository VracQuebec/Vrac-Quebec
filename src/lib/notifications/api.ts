// ============================================================
// COUCHE D'ACCÈS AUX NOTIFICATIONS CRM
// ------------------------------------------------------------
// Les notifications ne dupliquent jamais les données du CRM :
// elles référencent l'élément concerné (lead, soumission,
// livraison, facture, événement) et fournissent un lien direct.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { accessRequestUrl, fetchAccessPriorities, toNotificationPriority } from "@/lib/access-requests/priority";

export type NotifStatus = "unread" | "read" | "in_progress" | "done" | "archived";
export type NotifPriority = "urgente" | "importante" | "normale" | "information";
export type NotifCategory =
  | "lead" | "relance" | "soumission" | "livraison"
  | "paiement" | "facturation" | "calendrier" | "site" | "alerte" | "flotte";

export type NotificationDisplayCategory =
  | "vrac" | "remblai" | "dompes" | "transport" | "soumissions" | "systeme";

export interface CrmNotification {
  id: string;
  dedupe_key: string;
  category: NotifCategory;
  type: string;
  priority: NotifPriority;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  action_url: string | null;
  client_name: string | null;
  lead_number: string | null;
  due_at: string | null;
  status: NotifStatus;
  read_at: string | null;
  resolved_at: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export const OPEN_STATUSES: NotifStatus[] = ["unread", "read", "in_progress"];

export const CATEGORY_LABELS: Record<NotifCategory, string> = {
  lead: "Nouveaux leads",
  relance: "Relances",
  soumission: "Soumissions",
  livraison: "Livraisons",
  paiement: "Paiements",
  facturation: "Facturation",
  calendrier: "Calendrier",
  site: "Dompes / sites",
  alerte: "Alertes importantes",
  flotte: "Flotte",
};

export const CATEGORY_ICONS: Record<NotifCategory, string> = {
  lead: "👥", relance: "💬", soumission: "📄", livraison: "🚚",
  paiement: "💰", facturation: "🧾", calendrier: "📅", site: "📍", alerte: "⚠️",
  flotte: "🛠️",
};

export const DISPLAY_CATEGORY_LABELS: Record<NotificationDisplayCategory, string> = {
  vrac: "Vrac",
  remblai: "Remblai",
  dompes: "Dompes",
  transport: "Transport",
  soumissions: "Soumissions",
  systeme: "Système",
};

export const DISPLAY_CATEGORY_ICONS: Record<NotificationDisplayCategory, string> = {
  vrac: "◫",
  remblai: "↧",
  dompes: "⌖",
  transport: "⇢",
  soumissions: "◇",
  systeme: "⚙",
};

/** Catégorie de présentation dérivée uniquement des références déjà enregistrées. */
export function displayCategory(n: CrmNotification): NotificationDisplayCategory {
  const haystack = [n.type, n.entity_type, n.action_url, n.title, n.body]
    .filter(Boolean).join(" ").toLocaleLowerCase("fr-CA");
  if (/dompe|dump|site_access|transport_request/.test(haystack)) return "dompes";
  if (/remblai|fill/.test(haystack)) return "remblai";
  if (/transport|voyage|trip|livraison|delivery|dispatch/.test(haystack)) return "transport";
  if (/soumission|quote/.test(haystack) || n.category === "soumission") return "soumissions";
  if (/vrac|mat[eé]riau|lead|submission|jsc_request/.test(haystack) || n.category === "lead") return "vrac";
  return "systeme";
}

export interface NotificationGroup {
  key: string;
  latest: CrmNotification;
  items: CrmNotification[];
  unread: number;
}

/** Regroupe seulement les notifications qui référencent explicitement la même entité. */
export function groupNotifications(rows: CrmNotification[]): NotificationGroup[] {
  const groups = new Map<string, CrmNotification[]>();
  sortNotifications(rows).forEach((n) => {
    const key = n.entity_type && n.entity_id ? `${n.entity_type}:${n.entity_id}` : `notification:${n.id}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  });
  return Array.from(groups, ([key, items]) => ({
    key,
    latest: items[0],
    items,
    unread: items.filter((n) => n.status === "unread").length,
  }));
}

export const PRIORITY_LABELS: Record<NotifPriority, string> = {
  urgente: "Urgente", importante: "Importante", normale: "Normale", information: "Information",
};

export const PRIORITY_DOT: Record<NotifPriority, string> = {
  urgente: "🔴", importante: "🟠", normale: "🟢", information: "⚪",
};

const PRIORITY_RANK: Record<NotifPriority, number> = {
  urgente: 0, importante: 1, normale: 2, information: 3,
};

export type NotifFilter =
  | "all" | "unread" | "todo" | "urgent" | "today" | "overdue" | "done" | "info";

export const FILTER_LABELS: Record<NotifFilter, string> = {
  all: "Toutes",
  unread: "Non lues",
  todo: "À traiter",
  urgent: "Urgentes",
  today: "Aujourd'hui",
  overdue: "En retard",
  done: "Terminées",
  info: "Informations",
};

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

export function isOpen(n: CrmNotification) {
  return OPEN_STATUSES.includes(n.status);
}

export function isOverdue(n: CrmNotification) {
  return isOpen(n) && !!n.due_at && new Date(n.due_at) < new Date();
}

export function isToday(n: CrmNotification) {
  if (!isOpen(n) || !n.due_at) return false;
  const d = new Date(n.due_at);
  return d >= startOfToday() && d <= endOfToday();
}

export function matchesFilter(n: CrmNotification, filter: NotifFilter) {
  switch (filter) {
    case "unread": return n.status === "unread";
    case "todo": return isOpen(n);
    case "urgent": return isOpen(n) && n.priority === "urgente";
    case "today": return isToday(n) || isOverdue(n);
    case "overdue": return isOverdue(n);
    case "info": return isOpen(n) && n.priority === "information";
    case "done": return n.status === "done" || n.status === "archived";
    default: return true;
  }
}

/** Hiérarchie visuelle : urgent → à traiter → non lu → récent → information. */
export function sortNotifications(rows: CrmNotification[]) {
  return [...rows].sort((a, b) => {
    const rank = (n: CrmNotification) => {
      if (isOpen(n) && n.priority === "urgente") return 0;
      if (n.status === "in_progress" || isOverdue(n) || n.priority === "importante") return 1;
      if (n.status === "unread") return 2;
      if (n.priority === "information") return 4;
      return 3;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function fetchNotifications(limit = 200): Promise<CrmNotification[]> {
  const { data, error } = await supabase
    .from("crm_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return applyAccessPriorities((data ?? []) as unknown as CrmNotification[]);
}

/**
 * Une notification de demande d'accès reflète la priorité explicite fixée
 * par l'administrateur (request_followups.priority). Rien n'est réécrit en
 * base : seule la présentation est ajustée; sans priorité, celle d'origine reste.
 */
export async function applyAccessPriorities(rows: CrmNotification[]): Promise<CrmNotification[]> {
  const ids = [...new Set(rows.filter((n) => n.entity_type === "transport_request" && n.entity_id).map((n) => n.entity_id!))];
  if (!ids.length) return rows;
  const map = await fetchAccessPriorities(ids);
  return rows.map((n) => {
    if (n.entity_type !== "transport_request" || !n.entity_id) return n;
    // « Voir la demande » ouvre toujours la fiche de la demande d'accès (jamais le Centre de contrôle).
    const linked = n.action_url ? { ...n, action_url: accessRequestUrl(n.entity_id) } : n;
    const ap = map[n.entity_id];
    if (!ap) return linked;
    const mapped = toNotificationPriority(ap);
    return { ...linked, priority: (mapped ?? n.priority) as NotifPriority, meta: { ...(n.meta ?? {}), access_priority: ap } };
  });
}

export async function markRead(id: string) {
  const { error } = await supabase
    .from("crm_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "unread");
  if (error) throw error;
}

export async function markAllRead(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("crm_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "unread");
  if (error) throw error;
}

export async function setStatus(id: string, status: NotifStatus) {
  const patch: { status: NotifStatus; resolved_at?: string; read_at?: string } = { status };
  if (status === "done" || status === "archived") patch.resolved_at = new Date().toISOString();
  if (status === "read" || status === "in_progress") patch.read_at = new Date().toISOString();
  const { error } = await supabase.from("crm_notifications").update(patch).eq("id", id);
  if (error) throw error;
}

export interface NotificationOptions {
  /** Affichage des alertes CRM (cloche, « À faire »). N'efface aucune notification. */
  crm_enabled?: boolean;
  /** Envoi des notifications Push. Les notifications restent en attente. */
  push_enabled?: boolean;
}

export interface NotificationSettings {
  categories: Record<string, boolean>;
  push_categories: Record<string, boolean>;
  delays: Record<string, number>;
  options: NotificationOptions;
}

export async function fetchSettings(): Promise<NotificationSettings> {
  const { data } = await supabase
    .from("crm_notification_settings")
    .select("categories, push_categories, delays, options")
    .eq("scope", "global")
    .maybeSingle();
  const row = data as unknown as {
    categories?: unknown; push_categories?: unknown; delays?: unknown; options?: unknown;
  } | null;
  return {
    categories: (row?.categories ?? {}) as Record<string, boolean>,
    push_categories: (row?.push_categories ?? {}) as Record<string, boolean>,
    delays: (row?.delays ?? {}) as Record<string, number>,
    options: (row?.options ?? {}) as NotificationOptions,
  };
}

export async function saveSettings(patch: Partial<NotificationSettings>) {
  const { error } = await supabase
    .from("crm_notification_settings")
    .update(patch as never)
    .eq("scope", "global");
  if (error) throw error;
}

/** Regroupement pour « À faire maintenant ». */
export function summarize(rows: CrmNotification[]) {
  const open = rows.filter(isOpen);
  const count = (fn: (n: CrmNotification) => boolean) => open.filter(fn).length;
  return {
    total: open.length,
    unread: rows.filter((n) => n.status === "unread").length,
    urgent: count((n) => n.priority === "urgente"),
    overdue: count(isOverdue),
    today: count((n) => isToday(n) || isOverdue(n)),
    byCategory: (Object.keys(CATEGORY_LABELS) as NotifCategory[]).reduce((acc, c) => {
      acc[c] = count((n) => n.category === c);
      return acc;
    }, {} as Record<NotifCategory, number>),
  };
}

export function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `Aujourd'hui ${d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
