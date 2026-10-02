// FIN-12B — Commandes fournisseurs, réceptions et rapprochement. Toute règle (droits, entreprise, soldes,
// dépassements, idempotence, engagement restant) est appliquée par la base; ce module ne fait que transmettre.
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const err = (e: any) => { if (e) { const x = new Error(e.message || "Erreur serveur") as Error & { code?: string }; x.code = e.code; throw x; } };
const num = (x: any) => (x == null || x === "" ? null : Number(x));

export const UNITS: { v: string; l: string }[] = [
  { v: "t", l: "tonne" }, { v: "m3", l: "m³" }, { v: "vg3", l: "verge³" }, { v: "voyage", l: "voyage" }, { v: "h", l: "heure" }, { v: "u", l: "unité" },
];
export const unitLabel = (u: string) => UNITS.find((x) => x.v === u)?.l ?? u;

export type LineForm = { no: number | null; description: string; qty: string; unit: string; unit_price: string; amount: string; gst: string; qst: string };
export const emptyLine = (): LineForm => ({ no: null, description: "", qty: "", unit: "t", unit_price: "", amount: "", gst: "", qst: "" });
export type OrderForm = { supplier_id: string; number: string; supplier_ref: string; order_date: string; expected_date: string; site: string; project_id: string; notes: string;
  estimate_occ_id: string; file_id: string; file_name: string; lines: LineForm[] };
export const emptyOrder = (supplier = ""): OrderForm => ({ supplier_id: supplier, number: "", supplier_ref: "", order_date: "", expected_date: "", site: "", project_id: "", notes: "", estimate_occ_id: "", file_id: "", file_name: "", lines: [emptyLine()] });

const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
/** Champ vide = inconnu (null), jamais 0. */
export const linePayload = (l: LineForm) => ({ no: l.no, description: l.description, qty: n(l.qty), unit: l.unit, unit_price: n(l.unit_price), amount: n(l.amount), gst: n(l.gst), qst: n(l.qst) });
export const orderPayload = (f: OrderForm) => ({ supplier_id: f.supplier_id || null, number: f.number, supplier_ref: f.supplier_ref, order_date: f.order_date || null, expected_date: f.expected_date || null,
  site: f.site, project_id: f.project_id || null, notes: f.notes, estimate_occ_id: f.estimate_occ_id || null, file_id: f.file_id || null, lines: f.lines.map(linePayload) });
export const toLineForm = (l: any): LineForm => ({ no: l.no ?? null, description: l.description ?? "", qty: l.qty?.toString() ?? "", unit: l.unit ?? "t", unit_price: l.unit_price?.toString() ?? "", amount: l.amount?.toString() ?? "", gst: l.gst?.toString() ?? "", qst: l.qst?.toString() ?? "" });

export type OrderRow = { id: string; number: string; supplier_id: string; supplier: string; supplier_ref: string | null; order_date: string | null; expected_date: string | null;
  status: "draft" | "confirmed" | "closed" | "void"; total: number | null; engagement: number | null; engagement_unknown: boolean; due_unknown: boolean;
  received_all: boolean; received_any: boolean; billed_all: boolean; billed_any: boolean; over_any: boolean; created_at: string };
export type OrderTotals = { count: number; engagement_open: number; engagement_unknown_count: number; engagement_due_unknown: number; drafts: number; confirmed: number };
export type Stat = { line_no: number; qty: number | null; line_total: number | null; accepted: number; refused: number; billed: number; portion: number; bill_amount: number | null; amount_unknown: number };

export async function overview(c: string, f: { supplier_id?: string; status?: string; q?: string }, limit = 25, offset = 0) {
  const { data, error } = await db.rpc("fin_po_overview", { _company: c, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)), _limit: limit, _offset: offset }); err(error);
  return { rows: ((data.rows ?? []) as any[]).map((r) => ({ ...r, total: num(r.total), engagement: num(r.engagement) })) as OrderRow[], total: Number(data.total ?? 0),
    totals: Object.fromEntries(Object.entries(data.totals ?? {}).map(([k, v]) => [k, Number(v)])) as unknown as OrderTotals };
}
export async function detail(id: string) {
  const { data, error } = await db.rpc("fin_po_detail", { _id: id }); err(error);
  const stats = ((data.stats ?? []) as any[]).map((s) => ({ line_no: s.line_no, qty: num(s.qty), line_total: num(s.line_total), accepted: Number(s.accepted), refused: Number(s.refused), billed: Number(s.billed),
    portion: Number(s.portion), bill_amount: num(s.bill_amount), amount_unknown: Number(s.amount_unknown ?? 0) })) as Stat[];
  return { ...data, total: num(data.total), stats, engagement: data.engagement ? { ...data.engagement, remaining: num(data.engagement.remaining), base: num(data.engagement.base), paid: Number(data.engagement.paid ?? 0) } : null };
}
export async function save(c: string, id: string | null, f: OrderForm, rev: number | null, createKey: string | null) {
  const { data, error } = await db.rpc("fin_po_save", { _company: c, _id: id, _p: orderPayload(f), _base_rev: rev, _create_key: createKey }); err(error); return data as { id: string; rev: number; number: string; replay?: boolean };
}
export async function confirm(id: string, rev: number, key: string) { const { data, error } = await db.rpc("fin_po_confirm", { _id: id, _expect_rev: rev, _key: key }); err(error); return data as { replay?: boolean }; }
export async function amend(id: string, rev: number, lines: LineForm[], reason: string) { const { data, error } = await db.rpc("fin_po_amend", { _id: id, _expect_rev: rev, _lines: lines.map(linePayload), _reason: reason }); err(error); return data; }
export async function receive(order: string, p: Record<string, unknown>, key: string) { const { data, error } = await db.rpc("fin_po_receive", { _order: order, _p: p, _key: key }); err(error); return data as { id: string; replay?: boolean }; }
export async function voidReceipt(id: string, reason: string) { const { error } = await db.rpc("fin_po_receipt_void", { _receipt: id, _reason: reason }); err(error); }
export async function match(order: string, bill: string, lines: { no: number; qty: number; bill_amount: number | null; portion: number | null }[], key: string, billRev: number | null, billKey: string | null, exception: string | null) {
  const { data, error } = await db.rpc("fin_po_match", { _order: order, _bill: bill, _lines: lines, _key: key, _bill_rev: billRev, _bill_key: billKey, _exception: exception }); err(error);
  return data as { replay?: boolean; matched?: number };
}
export async function voidMatch(order: string, bill: string, reason: string) { const { error } = await db.rpc("fin_po_match_void", { _order: order, _bill: bill, _reason: reason }); err(error); }
export async function close(id: string, rev: number, reason: string, reopen = false) { const { error } = await db.rpc("fin_po_close", { _id: id, _expect_rev: rev, _reason: reason, _reopen: reopen }); err(error); }
export async function voidOrder(id: string, rev: number, reason: string) { const { error } = await db.rpc("fin_po_void", { _id: id, _expect_rev: rev, _reason: reason }); err(error); }
export async function engagedOccurrences(c: string) {
  const { data } = await db.from("fin_purchase_orders").select("occurrence_id").eq("company_id", c).in("status", ["confirmed", "closed"]);
  return new Set(((data ?? []) as any[]).map((x) => x.occurrence_id as string));
}

/** Clé d'idempotence conservée sur l'appareil jusqu'au succès : un nouvel essai après une réponse perdue rejoue la même demande. */
export function stickyKey(k: string): string { try { const v = localStorage.getItem(k); if (v) return v; const nk = crypto.randomUUID(); localStorage.setItem(k, nk); return nk; } catch { return crypto.randomUUID(); } }
export function dropKey(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

/** État de rapprochement d'une ligne : « Conforme » seulement si toutes les données sont connues et concordent. */
export function lineState(s: Stat): { label: string; tone: "ok" | "warn" | "muted" } {
  if (s.billed === 0) return { label: "Non facturée", tone: "muted" };
  if (s.line_total == null || s.amount_unknown > 0 || s.bill_amount == null || s.qty == null) return { label: "À vérifier", tone: "warn" };
  if (s.billed > s.accepted) return { label: "Facturé avant réception", tone: "warn" };
  if (s.billed > s.qty) return { label: "Écart : facturé > commandé", tone: "warn" };
  if (Math.abs(s.bill_amount - s.portion) >= 0.005) return { label: `Écart de montant ${(s.bill_amount - s.portion).toFixed(2)} $`, tone: "warn" };
  return { label: s.billed < s.qty ? "Conforme (partiel)" : "Conforme", tone: "ok" };
}
export const receptionLabel = (r: Pick<OrderRow, "received_all" | "received_any" | "over_any" | "status">) =>
  r.status === "draft" ? "—" : r.over_any ? "Excédent" : r.received_all ? "Reçue" : r.received_any ? "Partielle" : "Non reçue";
export const billingLabel = (r: Pick<OrderRow, "billed_all" | "billed_any" | "status">) => r.status === "draft" ? "—" : r.billed_all ? "Facturée" : r.billed_any ? "Partiellement facturée" : "Non facturée";
export const ORDER_STATUS: Record<string, string> = { draft: "Brouillon", confirmed: "Confirmée", closed: "Clôturée", void: "Annulée" };
export const ORDER_EVENT: Record<string, string> = { draft_create: "Brouillon créé", confirm: "Commande confirmée", amend: "Lignes modifiées", receive: "Réception", receive_void: "Réception annulée",
  match: "Facture rapprochée", match_void: "Rapprochement annulé", close: "Clôturée", reopen: "Rouverte", void: "Annulée" };
