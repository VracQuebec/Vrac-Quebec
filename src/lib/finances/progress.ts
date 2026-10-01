// FIN-09B1 — Facturation progressive cumulative : accès RPC (tous les calculs et plafonds sont décidés au serveur).
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Kind = "acompte" | "situation" | "solde";
export type Mode = "pct" | "amount" | "amount_ttc";
export type Parts = { bt: number; bz: number; be: number; gst: number; qst: number; ht: number; total: number; pct?: number; cap?: number };
export type Gap = { ht: number; gst: number; qst: number; total: number };
/** basis: plafond contractuel en HT (contrat HT) ou TTC (contrat taxes incluses). Taxes calculées sur chaque facture. */
export type Computed = { basis?: "ht" | "ttc"; contract: Parts; prev: Parts; cum: Parts; new: Parts; remaining: { ht: number; total: number; cap?: number }; gap_vs_quote?: Gap | null };
export type Situation = { id: string; seq: number | null; kind: Kind; mode: Mode; value: string; status: "brouillon" | "emise" | "abandonnee"; issue_date: string | null; due_date: string | null;
  computed: Computed; rev: number; hash: string; draft_key: string; abandon_reason: string | null; invoice_id: string | null; number: string | null;
  balance: { total: number; credits: number; net: number; collected: number; rest: number; unallocated: number } | null };
export type Summary = { id: string; company_id: string; quote_id: string; client_name: string | null; quote_number: string | null; quote_version: number | null;
  contract: Parts & { gst_rate: number | null; qst_rate: number | null }; billed: { ht: number; gst: number; qst: number; total: number }; situations: Situation[] };

export const KIND_LABEL: Record<Kind, string> = { acompte: "Acompte (part du prix)", situation: "Situation progressive", solde: "Solde final" };

/** Saisie fr-CA (« 30,5 », « 1 250,75 ») → texte décimal strict, ou null si invalide. Jamais de vide transformé en zéro. */
export function parseCumul(raw: string): string | null {
  const t = raw.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return null;
  if (Number(t) <= 0) return null;
  return t;
}

const fail = (e: { message?: string; code?: string } | null) => { if (e) { const x = new Error(e.message || "Erreur serveur") as Error & { code?: string }; x.code = e.code; throw x; } };
export async function createPlan(quoteId: string, key: string) { const { data, error } = await db.rpc("fin_progress_plan_create", { _quote: quoteId, _key: key }); fail(error); return data as { plan_id?: string; already?: boolean; conflict?: "invoice" | "family_plan"; invoice_id?: string; family?: boolean; message?: string }; }
export async function planForQuote(quoteId: string) { const { data, error } = await db.rpc("fin_progress_for_quote", { _quote: quoteId }); fail(error); return data as { plan_id: string | null; invoice_id: string | null; family: boolean }; }
export async function listPlans(company: string) { const { data, error } = await db.rpc("fin_progress_list", { _company: company }); fail(error); return (data ?? []) as { id: string; quote_number: string | null; quote_version: number | null; client_name: string | null; contract_total: number; billed_total: number; has_draft: boolean }[]; }
export async function summary(plan: string) { const { data, error } = await db.rpc("fin_progress_summary", { _plan: plan }); fail(error); return data as Summary; }
export async function saveDraft(p: { plan: string; key: string; kind: Kind; mode: Mode; value: string | null; issue: string | null; due: string | null; baseRev: number | null }) {
  const { data, error } = await db.rpc("fin_progress_draft_save", { _plan: p.plan, _draft_key: p.key, _kind: p.kind, _mode: p.mode, _value: p.value, _issue_date: p.issue || null, _due_date: p.due || null, _base_rev: p.baseRev });
  fail(error); return data as Situation;
}
export async function issue(id: string, key: string, rev: number, hash: string) { const { data, error } = await db.rpc("fin_progress_issue", { _situation: id, _issue_key: key, _expect_rev: rev, _expect_hash: hash }); fail(error); return data as { invoice_id: string; number: string; already: boolean }; }
/** Abandon contrôlé : révision + empreinte attendues; au réessai, renvoyer exactement les mêmes paramètres. */
export async function abandon(id: string, key: string, reason: string, rev: number, hash: string) { const { data, error } = await db.rpc("fin_progress_abandon", { _situation: id, _key: key, _reason: reason, _expect_rev: rev, _expect_hash: hash }); fail(error); return data as Situation; }
export const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
