// ============================================================
// COUCHE D'ACCÈS AUX NOTIFICATIONS CRM
// ------------------------------------------------------------
// Les notifications ne dupliquent jamais les données du CRM :
// elles référencent l'élément concerné (lead, soumission,
// livraison, facture, événement) et fournissent un lien direct.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type NotifStatus = "unread" | "read" | "in_progress" | "done" | "archived";
export type NotifPriority = "urgente" | "importante" | "normale" | "information";
export type NotifCategory =
  | "lead" | "relance" | "soumission" | "livraison"
  | "paiement" | "facturation" | "calendrier" | "site" | "alerte";

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
};

export const CATEGORY_ICONS: Record<NotifCategory, string> = {
  lead: "👥", relance: "💬", soumission: "📄", livraison: "🚚",
  paiement: "💰", facturation: "🧾", calendrier: "📅", site: "📍", alerte: "⚠️",
};

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
  | "all" | "unread" | "todo" | "urgent" | "today" | "overdue" | "done";

export const FILTER_LABELS: Record<NotifFilter, string> = {
  all: "Toutes",
  unread: "Non lues",
  todo: "À faire",
  urgent: "Urgentes",
  today: "Aujourd'hui",
  overdue: "En retard",
  done: "Terminées",
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
    case "done": return n.status === "done" || n.status === "archived";
    default: return true;
  }
}

/** Tri intelligent : urgent → en retard → aujourd'hui → nouveau → normal. */
export function sortNotifications(rows: CrmNotification[]) {
  return [...rows].sort((a, b) => {
    const oa = isOverdue(a) ? 0 : 1;
    const ob = isOverdue(b) ? 0 : 1;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    }
    if (oa !== ob) return oa - ob;
    const ta = isToday(a) ? 0 : 1;
    const tb = isToday(b) ? 0 : 1;
    if (ta !== tb) return ta - tb;
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
  return (data ?? []) as unknown as CrmNotification[];
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
  const patch: Record<string, unknown> = { status };
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
