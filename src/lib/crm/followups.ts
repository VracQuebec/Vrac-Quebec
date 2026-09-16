// ============================================================
// CRM-03 — Suivi quotidien : prochaines actions datées, exécution
// d'une relance et historique conservé.
// Aucune communication automatique n'est envoyée ici : le CRM se
// contente d'enregistrer ce que l'équipe a réellement fait.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface FollowUpLead {
  id: string;
  name: string | null;
  dompe_number: string | null;
  status: string;
  priority: string | null;
  city: string | null;
  address: string | null;
  assigned_entrepreneur: string | null;
  next_follow_up_at: string | null;
  created_at: string;
}

export interface FollowUpActivity {
  id: string;
  owner_id: string;
  kind: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type DueBucket = "overdue" | "today" | "later" | "none";

/** Fin de journée locale : une action du jour reste « à traiter aujourd'hui ». */
export function endOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Classe une prochaine action. Une date absente n'est jamais traitée
 * comme une date passée : elle reste « none ».
 */
export function dueBucket(value: string | null | undefined, now = new Date()): DueBucket {
  if (!value) return "none";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "none";
  if (t < startOfDay(now).getTime()) return "overdue";
  if (t <= endOfDay(now).getTime()) return "today";
  return "later";
}

/** Une action est « à traiter aujourd'hui » si elle est échue ou prévue ce jour. */
export function isOpenToday(value: string | null | undefined, now = new Date()): boolean {
  const bucket = dueBucket(value, now);
  return bucket === "overdue" || bucket === "today";
}

/** Tri des actions ouvertes : les plus en retard d'abord, ordre stable par identifiant. */
export function sortOpenActions<T extends { id: string; next_follow_up_at: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/** Compteurs affichés : ils portent exactement sur la liste ouverte. */
export function countBuckets(rows: Array<{ next_follow_up_at: string | null }>, now = new Date()) {
  let overdue = 0, today = 0;
  for (const r of rows) {
    const b = dueBucket(r.next_follow_up_at, now);
    if (b === "overdue") overdue++;
    else if (b === "today") today++;
  }
  return { overdue, today, total: overdue + today };
}

const LEAD_FIELDS =
  "id, name, dompe_number, status, priority, city, address, assigned_entrepreneur, next_follow_up_at, created_at";

/** Actions échues et du jour, calculées côté base pour éviter de tout charger. */
export async function fetchTodayFollowUps(now = new Date()): Promise<FollowUpLead[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select(LEAD_FIELDS)
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", endOfDay(now).toISOString())
    .order("next_follow_up_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as FollowUpLead[];
}

/** Historique conservé d'un dossier : rien n'est jamais effacé. */
export async function fetchLeadHistory(leadId: string): Promise<FollowUpActivity[]> {
  const { data, error } = await supabase
    .from("crm_activities")
    .select("id, owner_id, kind, subject, body, outcome, due_at, completed_at, created_at")
    .eq("owner_type", "submission")
    .eq("owner_id", leadId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as FollowUpActivity[];
}

export interface CompleteFollowUpInput {
  leadId: string;
  /** Date à laquelle l'action était prévue (conservée dans l'historique). */
  dueAt: string | null;
  outcome: string;
  note?: string;
  /** Prochaine action : date locale « AAAA-MM-JJ », ou null si aucune. */
  nextDate: string | null;
  userId?: string | null;
}

/**
 * Enregistre une relance comme terminée, puis planifie la suivante.
 * Le statut commercial du dossier n'est jamais modifié ici : la
 * disponibilité réelle d'une demande de remblai reste indépendante.
 */
export async function completeFollowUp(input: CompleteFollowUpInput) {
  const nextAt = input.nextDate ? `${input.nextDate}T09:00:00` : null;

  const { error: histError } = await supabase.from("crm_activities").insert({
    owner_type: "submission",
    owner_id: input.leadId,
    kind: "task",
    subject: "Relance effectuée",
    body: input.note ?? null,
    outcome: input.outcome,
    due_at: input.dueAt,
    completed_at: new Date().toISOString(),
    created_by: input.userId ?? null,
    metadata: { source: "crm-suivi-quotidien" },
  });
  if (histError) throw new Error(histError.message);

  if (nextAt) {
    const { error: plannedError } = await supabase.from("crm_activities").insert({
      owner_type: "submission",
      owner_id: input.leadId,
      kind: "reminder",
      subject: "Prochaine action planifiée",
      due_at: nextAt,
      created_by: input.userId ?? null,
      metadata: { source: "crm-suivi-quotidien" },
    });
    if (plannedError) throw new Error(plannedError.message);
  }

  const { error: leadError } = await supabase
    .from("submissions")
    .update({ next_follow_up_at: nextAt })
    .eq("id", input.leadId);
  if (leadError) throw new Error(leadError.message);

  return { nextAt };
}

export const OUTCOMES = [
  { value: "joint", label: "Client rejoint" },
  { value: "message", label: "Message laissé" },
  { value: "sans_reponse", label: "Sans réponse" },
  { value: "a_rappeler", label: "À rappeler plus tard" },
  { value: "conclu", label: "Dossier conclu" },
] as const;

export function outcomeLabel(value: string | null | undefined): string {
  return OUTCOMES.find((o) => o.value === value)?.label ?? "Action enregistrée";
}
