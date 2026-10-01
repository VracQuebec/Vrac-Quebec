// FIN-09C2 — Retenues contractuelles sur facture émise (taxes déjà figées/exigibles).
// Toute écriture passe par les RPC fin_retention_* (droits entreprise, verrou facture, idempotence, révision);
// la répartition exigible / retenu vient d'une seule source serveur (fin_invoice_position).
import { supabase } from "@/integrations/supabase/client";
import { decFr } from "./recurring";
import { toCents } from "./treasury";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RetKind = "taxes_exigibles" | "construction_differee";
export type RetForm = { kind: RetKind; mode: "amount" | "percent"; amount: string; pct: string; reason: string; contract_ref: string; planned_release: string; release_condition: string };
export const EMPTY_RET: RetForm = { kind: "taxes_exigibles", mode: "amount", amount: "", pct: "", reason: "", contract_ref: "", planned_release: "", release_condition: "" };
export const CONSTRUCTION_BLOCK = "Retenue de construction avec taxes différées : non prise en charge ici. Pour un contrat de construction admissible, la TPS/TVQ sur la somme retenue est perçue à la première date où elle est payée ou exigible (Revenu Québec) — alors que cette facture a déjà figé ses taxes. Ce cas reste à valider (sous-lot FIN-09C2 restant).";
export const REVENU_QC = "https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/perception-de-la-tps-et-de-la-tvq/moment-ou-la-tpstvh-et-la-tvq-doivent-etre-percues/";

/** Formulaire → charge utile serveur (montants fr-CA canonisés, jamais de 0 implicite) ou erreurs locales. Validation finale : serveur. */
export function retPayload(f: RetForm): { ok: boolean; p: J; errors: string[] } {
  const errors: string[] = [];
  if (f.kind === "construction_differee") errors.push(CONSTRUCTION_BLOCK);
  const p: J = { kind: f.kind, mode: f.mode, reason: f.reason.trim(), release_condition: f.release_condition.trim() };
  if (f.mode === "amount") { const a = decFr(f.amount, 2); if (a == null || Number(a) <= 0) errors.push("Montant CAD positif requis (2 décimales au plus)"); else p.amount = a; }
  else { const v = decFr(f.pct, 4); if (v == null || Number(v) <= 0 || Number(v) > 100) errors.push("Pourcentage de plus de 0 à 100 requis"); else p.pct = v; }
  if (!p.reason) errors.push("Motif requis");
  if (!p.release_condition) errors.push("Condition de libération requise");
  if (f.contract_ref.trim()) p.contract_ref = f.contract_ref.trim();
  if (f.planned_release) { if (!/^\d{4}-\d{2}-\d{2}$/.test(f.planned_release)) errors.push("Date prévue invalide"); else p.planned_release = f.planned_release; }
  return { ok: errors.length === 0, p, errors };
}

/** Une entrée attendue liée → mouvements de trésorerie : part courante à l'échéance, part retenue à sa date prévue;
 *  retenue sans date = « à compléter », exclue des dates précises. Total = reste dû de l'entrée (jamais compté deux fois).
 *  Échéancier invalide ou retenu > reste dû : projection REFUSÉE (erreur), jamais plafonnée ni ajustée. */
export function splitInflow(i: { amount: number; received: number; expected_on: string; retention_schedule?: unknown }) {
  const left = Math.max(0, (toCents(i.amount) ?? 0) - (toCents(i.received) ?? 0));
  const parts: { date: string; cents: number; retention?: string }[] = []; let undated = 0; let held = 0;
  const sch = i.retention_schedule ?? [];
  const bad = (why: string) => new Error(`Prévision refusée : échéancier de retenue incohérent (${why}). Rechargez ou corrigez la retenue.`);
  if (!Array.isArray(sch)) throw bad("format");
  for (const s of sch as { id?: unknown; date?: unknown; amount?: unknown }[]) {
    const c = s && typeof s === "object" && typeof s.amount !== "boolean" ? toCents(s.amount as number) : null;
    if (!s || typeof s.id !== "string" || c == null || !Number.isFinite(c) || c <= 0) throw bad("montant invalide");
    if (s.date != null && (typeof s.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.date))) throw bad("date invalide");
    held += c;
    if (s.date) parts.push({ date: s.date as string, cents: c, retention: s.id }); else undated += c;
  }
  if (held > left) throw bad(`retenu ${(held / 100).toFixed(2)} $ > reste dû ${(left / 100).toFixed(2)} $`);
  const current = left - held;
  if (current > 0) parts.unshift({ date: i.expected_on, cents: current });
  return { parts, undated, left };
}

const call = async (fn: string, args: J) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) { const e = new Error(error.message || "Erreur serveur") as Error & { code?: string }; e.code = error.code; throw e; }
  return data as J;
};
export const summary = (invoice: string) => call("fin_retention_summary", { _invoice: invoice });
export const preview = (invoice: string, p: J) => call("fin_retention_preview", { _invoice: invoice, _p: p });
export const create = (invoice: string, key: string, p: J, hash: string) => call("fin_retention_create", { _invoice: invoice, _key: key, _p: p, _expect_hash: hash });
export const release = (ret: string, key: string, amount: string, date: string, reason: string, rev: number) => call("fin_retention_release", { _retention: ret, _key: key, _amount: amount, _date: date, _reason: reason, _expect_rev: rev });
export const voidRetention = (ret: string, key: string, reason: string, rev: number) => call("fin_retention_void", { _retention: ret, _key: key, _reason: reason, _expect_rev: rev });
export const voidRelease = (rel: string, key: string, reason: string, rev: number) => call("fin_retention_release_void", { _release: rel, _key: key, _reason: reason, _expect_rev: rev });
