// Priorité d'une demande d'accès aux dompes.
// Source unique : request_followups.priority (suivi du Centre de contrôle),
// jamais sur la demande elle-même. NULL = « Priorité non définie » :
// aucune urgence n'est jamais déduite de la date ou de la récence.
import { supabase } from "@/integrations/supabase/client";

export type AccessPriority = "normale" | "prioritaire" | "urgente";

export const ACCESS_PRIORITIES: { value: AccessPriority; label: string }[] = [
  { value: "normale", label: "Normale" },
  { value: "prioritaire", label: "Prioritaire" },
  { value: "urgente", label: "Urgente" },
];

export const priorityLabel = (p: AccessPriority | null | undefined) =>
  p ? `Priorité ${ACCESS_PRIORITIES.find((x) => x.value === p)!.label.toLocaleLowerCase("fr-CA")}` : "Priorité non définie";

/** Rang de tri : urgente → prioritaire → normale/non définie. */
export const priorityRank = (p: AccessPriority | null | undefined) =>
  p === "urgente" ? 0 : p === "prioritaire" ? 1 : 2;

/** Tri principal : priorité, puis plus récente d'abord. */
export function sortByPriority<T extends { id: string; created_at: string }>(rows: T[], map: Record<string, AccessPriority | null>): T[] {
  return [...rows].sort((a, b) => {
    const d = priorityRank(map[a.id]) - priorityRank(map[b.id]);
    if (d) return d;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/** Correspondance vers la priorité de notification existante. */
// Priorité explicite de l'administrateur → niveau de notification existant.
// Non définie (null) = le niveau d'origine de la notification est conservé.
export const toNotificationPriority = (p: AccessPriority | null | undefined) =>
  p === "urgente" ? "urgente" : p === "prioritaire" ? "importante" : p === "normale" ? "normale" : null;

/** Fiche d'une demande d'accès dans « Demandes d'accès aux dompes ». */
export const accessRequestUrl = (id: string) => `/admin/demandes-acces?demande=${id}`;

export async function fetchAccessPriorities(ids?: string[]): Promise<Record<string, AccessPriority | null>> {
  let q = supabase.from("request_followups").select("entity_id, priority").eq("entity_type", "transport_request");
  if (ids) {
    if (!ids.length) return {};
    q = q.in("entity_id", ids);
  }
  const { data, error } = await q.limit(5000);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.entity_id, (r.priority as AccessPriority | null) ?? null]));
}

/** Enregistre une priorité explicite (historisée par le déclencheur du suivi). */
export async function setAccessPriority(id: string, receivedAt: string, priority: AccessPriority) {
  const { error: e1 } = await supabase.from("request_followups").upsert(
    { entity_type: "transport_request", entity_id: id, received_at: receivedAt },
    { onConflict: "entity_type,entity_id", ignoreDuplicates: true });
  if (e1) throw e1;
  const { error } = await supabase.from("request_followups").update({ priority })
    .eq("entity_type", "transport_request").eq("entity_id", id);
  if (error) throw error;
}
