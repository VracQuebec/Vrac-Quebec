// FIN-BUD — Budget des dépenses et calendrier de paiement : lecture seule des échéances
// (fin_list) et budgets (fin_budgets). Aucun second système : le statut affiché est
// dérivé de l'état de règlement serveur; rien n'est « payé » sans règlement confirmé.
import type { Occ } from "./period";
import { addDays } from "./period";

export type PayStatus = "a_venir" | "a_payer" | "paye" | "en_retard" | "annule";
export const PAY_STATUS_LABEL: Record<PayStatus, string> = { a_venir: "À venir", a_payer: "À payer", paye: "Payé", en_retard: "En retard", annule: "Annulé" };

/** Fenêtre « à payer » : échéance dans les 7 prochains jours (ou passée), non réglée. */
export const DUE_SOON_DAYS = 7;

export function payStatus(o: Pick<Occ, "status" | "settle" | "late" | "ref_date" | "due_date">, today: string): PayStatus {
  if (o.status === "cancelled") return "annule";
  // Seul un règlement confirmé (ou rapprochement existant) donne « payé ».
  if (o.settle === "reglee") return "paye";
  const d = o.ref_date || o.due_date;
  if (o.late || d < today) return "en_retard";
  if (d <= addDays(today, DUE_SOON_DAYS)) return "a_payer";
  return "a_venir";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Totaux d'une liste d'échéances : prévu (confirmé/estimé), payé, restant. */
export function summarize(rows: Occ[], today: string) {
  const act = rows.filter((r) => r.status === "active");
  const sumQ = (q: string) => r2(act.filter((r) => r.amount_quality === q).reduce((s, r) => s + (r.amount ?? 0), 0));
  const paid = r2(act.reduce((s, r) => s + (r.paid ?? 0), 0));
  const remaining = r2(act.reduce((s, r) => s + Math.max(0, r.balance ?? r.amount ?? 0), 0));
  const late = act.filter((r) => payStatus(r, today) === "en_retard");
  return {
    confirmed: sumQ("confirmed"), estimated: sumQ("estimated"), planned: r2(sumQ("confirmed") + sumQ("estimated")),
    unknown: act.filter((r) => r.amount == null).length, paid, remaining,
    lateCount: late.length, lateAmount: r2(late.reduce((s, r) => s + Math.max(0, r.balance ?? r.amount ?? 0), 0)),
  };
}

/** Regroupement par mois (AAAA-MM) selon la date de référence. */
export function byMonth(rows: Occ[]) {
  const m: Record<string, Occ[]> = {};
  for (const r of rows) (m[(r.ref_date || r.due_date).slice(0, 7)] ||= []).push(r);
  return m;
}

/** Écart budget : positif = sous le budget, négatif = dépassement. */
export const budgetGap = (budget: number, paid: number, remaining: number) => r2(budget - paid - remaining);
