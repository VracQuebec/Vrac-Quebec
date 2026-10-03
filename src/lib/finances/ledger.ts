// FIN-14 — Grand livre comptable. Toute écriture passe par les RPC fin_gl_* (serveur) ; ce module ne calcule rien d'autorité.
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await db.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };

export type Cat = "actif" | "passif" | "capitaux" | "revenus" | "depenses";
export const CATS: { v: Cat; l: string }[] = [{ v: "actif", l: "Actif" }, { v: "passif", l: "Passif" }, { v: "capitaux", l: "Capitaux propres" }, { v: "revenus", l: "Revenus" }, { v: "depenses", l: "Dépenses" }];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.v, c.l])) as Record<Cat, string>;
export type GlAccount = { id: string; number: string; name: string; category: Cat; active: boolean };
export type Line = { gl: string; debit: number; credit: number; memo?: string | null };
export type Entry = { id: string; entry_no: number | null; entry_date: string; reference: string | null; description: string; status: "draft" | "validated"; origin: "manual" | "auto" | "reversal";
  source_kind: string | null; source_id: string | null; source_label: string | null; reverses_id: string | null; reversed_by_id: string | null; reversal_reason: string | null; rev: number; created_at: string; validated_at: string | null;
  lines: { id: string; line_no: number; gl_account_id: string; debit: number; credit: number; memo: string | null }[] };
export type Pending = { kind: string; src: string; purpose: "post" | "void"; on_date: string | null; ref: string | null; label: string; lines: { gl: string | null; debit: number; credit: number; role: string | null; facct: string | null }[]; missing: string[]; posted_id: string | null };

export const ROLES: { v: string; l: string; cat: Cat }[] = [
  { v: "ar", l: "Comptes clients", cat: "actif" }, { v: "revenue", l: "Revenus de ventes", cat: "revenus" },
  { v: "gst_payable", l: "TPS à payer", cat: "passif" }, { v: "qst_payable", l: "TVQ à payer", cat: "passif" },
  { v: "ap", l: "Comptes fournisseurs", cat: "passif" }, { v: "expense", l: "Dépenses (achats et notes de frais)", cat: "depenses" },
  { v: "gst_recoverable", l: "TPS à recouvrer", cat: "actif" }, { v: "qst_recoverable", l: "TVQ à recouvrer", cat: "actif" },
  { v: "obligation_expense", l: "Dépenses réglées sans facture fournisseur", cat: "depenses" }, { v: "supplier_advance", l: "Trop-payés et avances aux fournisseurs", cat: "actif" },
  { v: "employee_payable", l: "Remboursements dus aux employés", cat: "passif" }, { v: "employee_advance", l: "Avances aux employés", cat: "actif" },
  { v: "wages_expense", l: "Salaires et vacances (paie)", cat: "depenses" }, { v: "payroll_tax_expense", l: "Charges sociales de l'employeur (paie)", cat: "depenses" },
  { v: "source_deductions", l: "Retenues à la source à remettre (paie)", cat: "passif" }, { v: "wages_payable", l: "Salaires nets à verser (paie)", cat: "passif" },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.v, r.l])) as Record<string, string>;

/** Pièce source → onglet Finances où l'ouvrir. */
export const SOURCE: Record<string, { l: string; tab: string; sous?: string }> = {
  invoice: { l: "Facture client", tab: "factures" }, receipt: { l: "Encaissement client", tab: "factures", sous: "comptes" }, credit_note: { l: "Note de crédit client", tab: "factures" },
  bill: { l: "Facture fournisseur", tab: "achats" }, supplier_credit: { l: "Note de crédit fournisseur", tab: "achats" }, supplier_credit_refund: { l: "Remboursement de note de crédit fournisseur", tab: "achats" },
  payment: { l: "Règlement", tab: "reglements" }, refund: { l: "Remboursement de trop-payé", tab: "achats" }, exp_report: { l: "Note de frais", tab: "frais" }, restitution: { l: "Restitution d'avance", tab: "frais" },
  payroll: { l: "Paie finalisée", tab: "grand-livre" },
};
export const sourceHref = (company: string, kind: string | null) => {
  const s = kind ? SOURCE[kind] : null; if (!s) return null;
  const q = new URLSearchParams({ tab: s.tab, company }); if (s.sous) q.set("sous", s.sous); return `${window.location.pathname}?${q}`;
};
/** Libellé lisible d'un manque renvoyé par le serveur (« role:ar », « facct:<id>:<nom> », texte). */
export const missingLabel = (m: string) => m.startsWith("role:") ? `Association « ${ROLE_LABEL[m.slice(5)] ?? m.slice(5)} » à compléter`
  : m.startsWith("facct:") ? `Compte financier « ${m.split(":").slice(2).join(":") || "?"} » non associé à un compte comptable` : m;

/** Contrôle d'écran (le serveur refait tout) : équilibre au cent près. */
export function balance(lines: { debit: number; credit: number }[]) {
  const c = (n: number) => Math.round((Number(n) || 0) * 100);
  const d = lines.reduce((s, l) => s + c(l.debit), 0), k = lines.reduce((s, l) => s + c(l.credit), 0);
  return { debit: d / 100, credit: k / 100, gap: (d - k) / 100, ok: d === k && d > 0 };
}

export const accounts = async (company: string): Promise<GlAccount[]> => { const { data, error } = await db.from("fin_gl_accounts").select("id,number,name,category,active").eq("company_id", company).order("number"); if (error) throw error; return data; };
export const saveAccount = (company: string, a: { id?: string | null; number: string; name: string; category: Cat; active: boolean }) => rpc("fin_gl_account_save", { _company: company, _id: a.id ?? null, _number: a.number, _name: a.name, _category: a.category, _active: a.active }) as Promise<string>;
export const mappings = async (company: string): Promise<Record<string, string>> => { const { data, error } = await db.from("fin_gl_mappings").select("role,gl_account_id").eq("company_id", company); if (error) throw error; return Object.fromEntries(data.map((m: any) => [m.role, m.gl_account_id])); };
export const links = async (company: string): Promise<Record<string, string>> => { const { data, error } = await db.from("fin_gl_account_links").select("fin_account_id,gl_account_id").eq("company_id", company); if (error) throw error; return Object.fromEntries(data.map((m: any) => [m.fin_account_id, m.gl_account_id])); };
export const setMapping = (company: string, role: string, gl: string | null) => rpc("fin_gl_map_set", { _company: company, _role: role, _gl: gl });
export const setLink = (company: string, finAccount: string, gl: string | null) => rpc("fin_gl_link_set", { _company: company, _fin_account: finAccount, _gl: gl });
export const entries = async (company: string, f: { from?: string; to?: string; status?: string; q?: string }): Promise<Entry[]> => {
  let qy = db.from("fin_gl_entries").select("*, lines:fin_gl_lines(id,line_no,gl_account_id,debit,credit,memo)").eq("company_id", company).order("entry_date", { ascending: false }).order("entry_no", { ascending: false, nullsFirst: true }).limit(300);
  if (f.from) qy = qy.gte("entry_date", f.from); if (f.to) qy = qy.lte("entry_date", f.to); if (f.status) qy = qy.eq("status", f.status);
  if (f.q) qy = qy.or(`description.ilike.%${f.q.replace(/[%,()]/g, " ")}%,reference.ilike.%${f.q.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await qy; if (error) throw error; return data.map((e: any) => ({ ...e, lines: [...e.lines].sort((a: any, b: any) => a.line_no - b.line_no) }));
};
export const entry = async (id: string): Promise<Entry | null> => { const { data, error } = await db.from("fin_gl_entries").select("*, lines:fin_gl_lines(id,line_no,gl_account_id,debit,credit,memo)").eq("id", id).maybeSingle(); if (error) throw error; return data ? { ...data, lines: [...data.lines].sort((a: any, b: any) => a.line_no - b.line_no) } : null; };
export const events = async (entryId: string) => { const { data, error } = await db.from("fin_gl_events").select("action,reason,at,actor").eq("entry_id", entryId).order("at"); if (error) throw error; return data as { action: string; reason: string | null; at: string }[]; };
export const saveDraft = (company: string, d: { id: string | null; rev: number | null; date: string; ref: string; desc: string; lines: Line[]; key: string }) =>
  rpc("fin_gl_entry_save", { _company: company, _id: d.id, _rev: d.rev, _date: d.date, _ref: d.ref, _desc: d.desc, _lines: d.lines, _key: d.key }) as Promise<{ id: string; rev: number }>;
export const discard = (id: string, rev: number) => rpc("fin_gl_entry_discard", { _id: id, _rev: rev });
export const validate = (id: string, rev: number) => rpc("fin_gl_entry_validate", { _id: id, _rev: rev }) as Promise<{ id: string; entry_no: number }>;
export const reverse = (id: string, reason: string, date: string, key: string) => rpc("fin_gl_entry_reverse", { _id: id, _reason: reason, _date: date, _key: key }) as Promise<{ id: string; entry_no: number }>;
export const pending = (company: string) => rpc("fin_gl_pending", { _company: company }) as Promise<Pending[]>;
export const sync = (company: string) => rpc("fin_gl_sync", { _company: company }) as Promise<{ posted: number; reversed: number; a_completer: number }>;
export type LedgerRow = { entry_id: string; entry_no: number; date: string; reference: string | null; description: string; memo: string | null; debit: number; credit: number; balance: number; source_kind: string | null; source_id: string | null; origin: string };
export const ledger = (company: string, account: string, from: string, to: string) => rpc("fin_gl_ledger", { _company: company, _account: account, _from: from, _to: to }) as Promise<{ account: GlAccount; opening: number; rows: LedgerRow[]; closing: number }>;
export type TrialRow = GlAccount & { debit: number; credit: number; balance: number };
export const trial = (company: string, to: string) => rpc("fin_gl_trial", { _company: company, _to: to }) as Promise<TrialRow[]>;
