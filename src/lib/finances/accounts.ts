// FIN-10 — comptes clients, état de compte, portail et préparation de relance.
// Toutes les sommes viennent du serveur (fin_ar_* → fin_invoice_position) : aucun recalcul ici.
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { csvCell, download, toCsv } from "./query";

const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call<T = J>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message || "Erreur serveur"), { code: error.code });
  return data as T;
}

export type Sums = { rest: number; unallocated: number; not_due: number; due_today: number; b1_30: number; b31_60: number; b61_90: number; b90: number;
  overdue: number; due_now: number; future_ret: number; partial: boolean; invoices: number };
export type AccountRow = Sums & { client_key: string; client_id: string | null; client_name: string };
export type Accounts = { on: string; currency: "CAD"; count: number; totals: Sums; rows: AccountRow[]; q: string; filter: string };
export type Filter = "all" | "open" | "overdue" | "credit" | "partial";
export const FILTERS: [Filter, string][] = [["all", "Tous"], ["open", "Solde ouvert"], ["overdue", "En retard"], ["credit", "Crédit non affecté"], ["partial", "Données incomplètes"]];

export const accounts = (company: string, on: string, q: string, filter: Filter, limit: number, offset: number) =>
  call<Accounts>("fin_ar_accounts", { _company: company, _on: on, _q: q, _filter: filter, _limit: limit, _offset: offset });
export const statement = (company: string, key: string, on: string) => call("fin_ar_statement", { _company: company, _client_key: key, _on: on });
export const collectPreview = (company: string, key: string, on: string) => call("fin_ar_collect_preview", { _company: company, _client_key: key, _on: on });
export const portalGrant = (company: string, client: string, email: string, expires: string | null) => call<string>("fin_portal_grant", { _company: company, _client: client, _email: email, _expires: expires });
export const portalRevoke = (access: string, reason: string) => call("fin_portal_revoke", { _access: access, _reason: reason });
export const portalStaffList = (company: string, client: string) => call<J[]>("fin_portal_staff_list", { _company: company, _client: client });
export const requestHandle = (id: string, note: string) => call("fin_portal_request_handle", { _id: id, _note: note });
export const portalMine = () => call<J[]>("fin_portal_mine", {});
export const portalStatement = (access: string, on: string) => call("fin_portal_statement", { _access: access, _on: on });
export const portalRequest = (access: string, kind: "question" | "paiement_declare", invoice: string | null, message: string, reference: string, amount: string, paidOn: string) =>
  call<string>("fin_portal_request", { _access: access, _kind: kind, _invoice: invoice, _message: message, _reference: reference, _amount: amount, _paid_on: paidOn });

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
export const money = (v: unknown) => { const n = num(v); return n == null ? "non disponible" : n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }); };
export const BUCKETS: [keyof Sums, string][] = [["not_due", "Non échu"], ["due_today", "Échu aujourd'hui"], ["b1_30", "Retard 1–30 j"], ["b31_60", "Retard 31–60 j"], ["b61_90", "Retard 61–90 j"], ["b90", "Retard +90 j"]];
export const KIND: Record<string, string> = { question: "Demande de précision", paiement_declare: "« J'ai payé » — à vérifier" };

/** Résumé commun (fiche, CSV, PDF) : mêmes clés, même ordre — garantit l'égalité des montants. */
export function summaryRows(st: J, filters: string): [string, unknown][] {
  const t = st.totals ?? {};
  return [["État de compte (solde actuel, pas un solde historique)", ""], ["Émetteur", st.seller?.name ?? ""], ["Client", st.client?.name ?? ""],
    ["Date de référence", st.on], ["Édité le", new Date(st.generated_at ?? Date.now()).toLocaleString("fr-CA", { timeZone: "America/Toronto" })], ["Devise", st.currency ?? "CAD"], ["Filtres", filters],
    ["Solde restant", num(t.rest)], ["Exigible maintenant", num(t.due_now)], ["dont en retard", num(t.overdue)],
    ...BUCKETS.map(([k, l]) => [l, num(t[k])] as [string, unknown]), ["Retenues à échéance future", num(t.future_ret)], ["Crédits / versements non affectés", num(t.unallocated)],
    ["Total partiel (données manquantes)", t.partial ? "oui" : "non"]];
}
const INV_HEAD = ["Facture", "Date", "Échéance", "Total", "Avoirs", "Encaissé", "Solde", "Exigible maintenant", "En retard", "Retenue future", "Données manquantes"];
const invRow = (l: J) => {
  const od = (num(l.b1_30) ?? 0) + (num(l.b31_60) ?? 0) + (num(l.b61_90) ?? 0) + (num(l.b90) ?? 0);
  return [`${l.number ?? ""}${l.is_test ? " (TEST)" : ""}`, l.issue_date, l.due_date ?? "non disponible", num(l.total), num(l.credits), num(l.collected), num(l.rest), od + (num(l.due_today) ?? 0), od, num(l.future_ret), (l.unknown ?? []).join(" ; ")];
};

export function statementCsv(st: J, filters: string) {
  const rows: unknown[][] = (st.invoices ?? []).map(invRow);
  rows.push([], ["Règlements"], ...((st.receipts ?? []).map((r: J) => [r.invoice_number, r.received_on, "", num(r.amount), "", "", "", "", "", "", r.reference ?? ""])));
  rows.push([], ["Notes de crédit appliquées"], ...((st.credits ?? []).map((c: J) => [c.invoice_number, (c.issued_at ?? "").slice(0, 10), c.number, num(c.total)])));
  download(`etat-de-compte-${(st.client?.name ?? "client").replace(/[^\w-]+/g, "_")}-${st.on}.csv`, toCsv(summaryRows(st, filters), INV_HEAD, rows));
}

export function statementPdf(st: J, filters: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" }); let y = 48; const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const line = (s: string, size = 9, bold = false) => { if (y > H - 48) { doc.addPage(); y = 48; } doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    for (const part of doc.splitTextToSize(s, W - 96)) { if (y > H - 48) { doc.addPage(); y = 48; } doc.text(part, 48, y); y += size + 4; } };
  line("État de compte", 16, true);
  for (const [k, v] of summaryRows(st, filters)) line(v === "" ? k : `${k} : ${typeof v === "number" ? money(v) : String(v ?? "")}`, 9, v === "");
  y += 6; line("Factures", 11, true);
  for (const l of st.invoices ?? []) { const r = invRow(l); line(`${r[0]} · ${r[1]} · échéance ${r[2]} · total ${money(r[3])} · avoirs ${money(r[4])} · encaissé ${money(r[5])} · solde ${money(r[6])} · exigible ${money(r[7])} · retard ${money(r[8])} · retenue future ${money(r[9])}${r[10] ? ` · manquant : ${r[10]}` : ""}`); }
  y += 6; line("Règlements", 11, true);
  for (const r of st.receipts ?? []) line(`${r.received_on} · ${r.invoice_number} · ${money(r.amount)}${r.reference ? ` · réf. ${r.reference}` : ""}`);
  if (!(st.receipts ?? []).length) line("Aucun");
  y += 6; line("Notes de crédit appliquées", 11, true);
  for (const c of st.credits ?? []) line(`${(c.issued_at ?? "").slice(0, 10)} · ${c.number} sur ${c.invoice_number} · ${money(c.total)}`);
  if (!(st.credits ?? []).length) line("Aucune");
  y += 6; line("Document informatif : aucune facture, écriture ni créance n'est créée par cet état. Montants en CAD, aucune conversion.", 8);
  return doc;
}
export { csvCell };
