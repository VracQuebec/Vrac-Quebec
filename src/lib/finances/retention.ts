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
export const CONSTRUCTION_BLOCK = "Retenue de construction avec taxes différées : non prise en charge ici. Pour un contrat de construction admissible, la TPS/TVQ sur la somme retenue est perçue à la première date où elle est payée ou exigible (Revenu Québec) — alors que cette facture a déjà figé ses taxes. Ce cas reste à valider (sous-lot FIN-09C2 restant). Chemin préparatoire FIN-09C2B1 : factures TEST seulement, à choisir AVANT l'émission depuis le brouillon.";
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

// FIN-09C2B1 — retenue construction à taxes différées, PRÉPARATOIRE, factures TEST seulement, choisie avant émission.
export type CtaxForm = { mode: "amount" | "percent"; amount: string; pct: string; reason: string; basis: "" | "law" | "written_agreement"; works: string;
  contract_ref: string; contract_date: string; clause_ref: string; release_condition: string; contractual_due: string; test_confirm: boolean };
export const EMPTY_CTAX: CtaxForm = { mode: "percent", amount: "", pct: "", reason: "", basis: "", works: "", contract_ref: "", contract_date: "", clause_ref: "", release_condition: "", contractual_due: "", test_confirm: false };
export const WORKS: Record<string, string> = { construction: "Construction", renovation: "Rénovation", transformation: "Transformation", reparation: "Réparation d'un immeuble", navire: "Navire" };
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;

/** Formulaire → charge utile serveur (chaînes canoniques; rien de déduit; vide ≠ 0). Validation finale : serveur. */
export function ctaxPayload(f: CtaxForm): { ok: boolean; p: J; errors: string[] } {
  const errors: string[] = []; const p: J = { mode: f.mode };
  if (f.mode === "amount") { const a = decFr(f.amount, 2); if (a == null || Number(a) <= 0) errors.push("Montant HT retenu positif requis (2 décimales au plus)"); else p.amount = a; }
  else { const v = decFr(f.pct, 4); if (v == null || Number(v) <= 0 || Number(v) > 100) errors.push("Pourcentage HT de plus de 0 à 100 requis"); else p.pct = v; }
  if (f.basis !== "law" && f.basis !== "written_agreement") errors.push("Fondement requis : loi ou convention écrite"); else p.basis = f.basis;
  if (!WORKS[f.works]) errors.push("Nature des travaux requise"); else p.works = f.works;
  for (const [k, l] of [["reason", "Motif"], ["contract_ref", "Référence du contrat"], ["clause_ref", "Clause ou preuve documentaire"], ["release_condition", "Condition de libération"]] as const) {
    const v = f[k].trim(); if (!v) errors.push(`${l} requis(e)`); else p[k] = v; }
  if (!isDate(f.contract_date)) errors.push("Date du contrat requise"); else p.contract_date = f.contract_date;
  if (!isDate(f.contractual_due)) errors.push("Échéance contractuelle requise"); else p.contractual_due = f.contractual_due;
  if (!f.test_confirm) errors.push("Confirmez le mode TEST préparatoire"); else p.test_confirm = "oui";
  return { ok: errors.length === 0, p, errors };
}
export const ctaxPreview = (invoice: string, p: J) => call("fin_construction_preview", { _invoice: invoice, _p: p });
export const ctaxIssue = (invoice: string, key: string, p: J, hash: string) => call("fin_construction_issue", { _invoice: invoice, _key: key, _p: p, _expect_hash: hash });
export const evaluate = (ret: string, key: string, on: string, rev: number) => call("fin_construction_evaluate", { _retention: ret, _key: key, _on: on, _expect_rev: rev });

// FIN-09C2B2A — paiement manuel TEST d'une retenue construction B1 (libération source « paiement » + encaissement lié, atomiques).
// Aucun paiement réel, aucune affectation implicite : la saisie porte uniquement sur la part retenue (part courante = encaissement ordinaire).
export type CpayForm = { amount: string; paid_on: string; method: string; reference: string; reason: string; test_confirm: boolean };
export const EMPTY_CPAY: CpayForm = { amount: "", paid_on: "", method: "virement", reference: "", reason: "", test_confirm: false };
export const PAY_METHODS: Record<string, string> = { virement: "Virement", interac: "Interac", cheque: "Chèque", especes: "Espèces", carte: "Carte", prelevement: "Prélèvement", autre: "Autre" };
export const ARC_RC4052 = "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4052/rc4052-gst-hst-information-home-construction-industry.html";

/** Formulaire → charge utile serveur (montant fr-CA canonique, jamais de 0 implicite; restant = borne locale indicative). */
export function cpayPayload(f: CpayForm, rest?: number | string | null): { ok: boolean; p: J; errors: string[] } {
  const errors: string[] = []; const p: J = {};
  const a = decFr(f.amount, 2);
  if (a == null || Number(a) <= 0) errors.push("Montant payé positif requis (2 décimales au plus)");
  else if (rest != null && (toCents(Number(a)) ?? 0) > (toCents(Number(rest)) ?? 0)) errors.push("Montant supérieur à la retenue restante : un paiement mêlant part courante et retenue n'est pas pris en charge (part courante = encaissement ordinaire)");
  else p.amount = a;
  if (!isDate(f.paid_on)) errors.push("Date de paiement reçu requise"); else p.paid_on = f.paid_on;
  if (!PAY_METHODS[f.method]) errors.push("Mode de paiement requis"); else p.method = f.method;
  const ref = f.reference.trim(); if (!ref) errors.push("Référence de preuve requise"); else p.reference = ref;
  const why = f.reason.trim(); if (!why) errors.push("Motif requis"); else p.reason = why;
  if (!f.test_confirm) errors.push("Confirmez le mode TEST (aucun paiement réel)"); else p.test_confirm = "oui";
  return { ok: errors.length === 0, p, errors };
}
export const cpayPreview = (ret: string, p: J) => call("fin_construction_pay_preview", { _retention: ret, _p: p });
export const cpay = (ret: string, key: string, p: J, rev: number, hash: string) => call("fin_construction_pay", { _retention: ret, _key: key, _p: p, _expect_rev: rev, _expect_hash: hash });
