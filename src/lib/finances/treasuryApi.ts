// FIN-05 — Lecture des données de trésorerie. Sécurité par la base (RLS fin_can_read / fin_can_write, même entreprise imposée par trigger).
// Aucune écriture sur les obligations ni les règlements.
import { supabase } from "@/integrations/supabase/client";
import * as api from "./api";
import { netPaid, toCents, type Account, type Balance, type Movement, type Reserve } from "./treasury";
import { addDays } from "./period";

const db = supabase as any;
const err = (e: any) => { if (e) throw new Error(e.message || "Erreur serveur"); };

export type Inflow = { id: string; account_id: string | null; amount: number; received: number; expected_on: string; counterparty: string; certainty: string; kind: string; note: string | null; archived_at: string | null };
export type Transfer = { id: string; from_account: string; to_account: string; amount: number; planned_on: string; note: string | null };
export type Budget = { id: string; category_id: string | null; truck_id: string | null; project_id: string | null; period_from: string; period_to: string; amount: number };
export type Scenario = { id: string; name: string; hypotheses: any[]; source_hash: string | null; updated_at: string };

const list = async <T,>(t: string, c: string, order: string) => { const { data, error } = await db.from(t).select("*").eq("company_id", c).is("archived_at", null).order(order); err(error); return (data ?? []) as T[]; };
export const accounts = (c: string) => list<Account & { id: string }>("fin_accounts", c, "name");
export async function balances(c: string) { const { data, error } = await db.from("fin_balances").select("account_id,amount,as_of,source,created_at").eq("company_id", c).order("as_of", { ascending: false }).limit(500); err(error); return (data ?? []).map((b: any) => ({ ...b, amount: Number(b.amount) })) as (Balance & { created_at: string })[]; }
export const inflows = (c: string) => list<Inflow>("fin_expected_inflows", c, "expected_on");
export const transfers = (c: string) => list<Transfer>("fin_transfers", c, "planned_on");
export const budgets = (c: string) => list<Budget>("fin_budgets", c, "period_from");
export const reserves = (c: string) => list<Reserve & { kind: string }>("fin_reserves", c, "target_date");
export const scenarios = (c: string) => list<Scenario>("fin_scenarios", c, "updated_at");

export async function insert(t: string, row: Record<string, unknown>) { const { data, error } = await db.from(t).insert(row).select("id").single(); err(error); return data.id as string; }
export async function update(t: string, id: string, row: Record<string, unknown>) { const { error } = await db.from(t).update(row).eq("id", id); err(error); }
export const archive = (t: string, id: string) => update(t, id, { archived_at: new Date().toISOString() });

/** Toutes les échéances (pages de 500) : restes dus seulement. */
async function allOcc(c: string, from: string, to: string, f: api.Filters = {}) {
  const rows: any[] = [];
  for (let off = 0; off < 10000; off += 500) { const r = await api.listOcc(c, from, to, "planned", f, "date_asc", 500, off); rows.push(...r.rows); if (rows.length >= r.total || !r.rows.length) break; }
  return rows;
}

/** Construit les mouvements réels (base de toute prévision et de tout scénario). */
export async function loadTreasury(c: string, from: string, to: string) {
  const [acc, bal, inf, trf, res, oa] = await Promise.all([accounts(c), balances(c), inflows(c), transfers(c), reserves(c), obligationAccounts(c)]);
  const oldest = bal.map((b) => b.as_of).sort()[0] ?? from;
  const [occ, pays, refs] = await Promise.all([
    allOcc(c, addDays(from, -730), to),
    db.from("fin_payments").select("id,amount,paid_on,payee_name,method").eq("company_id", c).eq("status", "validated").gt("paid_on", oldest).lte("paid_on", to),
    db.from("fin_refunds").select("id,amount,refunded_on,reason").eq("company_id", c).is("voided_at", null).gt("refunded_on", oldest).lte("refunded_on", to),
  ]);
  err(pays.error); err(refs.error);
  const moves: Movement[] = [];
  for (const o of occ) {
    if (o.status !== "active" || ["reglee", "aucun", "annulee"].includes(o.settle)) continue;
    const rest = o.amount == null ? null : toCents(o.balance ?? o.amount);
    if (rest !== null && rest <= 0) continue; // paiement partiel : seul le reste dû est prévu
    const account_id = oa[o.obligation_id] ?? null; // sans compte prévu : « Non affecté », compté dans la prévision globale seulement
    moves.push({ id: `o:${o.id}`, ref: o.id, date: o.planned_date, cents: rest, dir: "out", kind: o.planned_date < from ? "late" : "occurrence", label: o.label, obligation_id: o.obligation_id, category: o.category, account_id, unassigned: !account_id });
  }
  for (const p of pays.data ?? []) moves.push({ id: `p:${p.id}`, ref: p.id, date: p.paid_on, cents: toCents(p.amount), dir: "out", kind: "payment", label: `Règlement déclaré — ${p.payee_name ?? ""}${p.method === "carte" ? " (carte)" : ""}`, via_card: p.method === "carte" });
  for (const r of refs.data ?? []) moves.push({ id: `r:${r.id}`, ref: r.id, date: r.refunded_on, cents: toCents(r.amount), dir: "in", kind: "refund", label: `Remboursement reçu${r.reason ? ` — ${r.reason}` : ""}` });
  for (const i of inf) {
    const left = Math.max(0, (toCents(i.amount) ?? 0) - (toCents(i.received) ?? 0)); // encaissement déclaré : réduit l'entrée attendue
    if (left > 0 && i.kind !== "credit") moves.push({ id: `i:${i.id}`, ref: i.id, date: i.expected_on, cents: left, dir: "in", kind: "inflow", label: `${i.counterparty} (${i.certainty})`, account_id: i.account_id, certainty: i.certainty, currency: (acc.find((a) => a.id === i.account_id)?.currency) ?? "CAD" });
  }
  for (const t of trf) moves.push({ id: `t:${t.id}`, ref: t.id, date: t.planned_on, cents: toCents(t.amount), dir: "out", kind: "transfer", label: "Transfert entre comptes", account_id: t.from_account, transfer_to: t.to_account });
  return { obligationAccounts: oa, accounts: acc, balances: bal, inflows: inf, transfers: trf, reserves: res.map((r) => ({ ...r, target: Number(r.target), reserved: Number(r.reserved) })), moves };
}

export async function obligationAccounts(c: string) {
  const { data, error } = await db.from("fin_obligation_accounts").select("obligation_id,account_id").eq("company_id", c).is("archived_at", null); err(error);
  return Object.fromEntries((data ?? []).filter((r: any) => r.account_id).map((r: any) => [r.obligation_id, r.account_id])) as Record<string, string>;
}
export async function setObligationAccount(c: string, obligation_id: string, account_id: string | null) {
  const { error } = await db.from("fin_obligation_accounts").upsert({ obligation_id, company_id: c, account_id, updated_at: new Date().toISOString() }, { onConflict: "obligation_id" }); err(error);
}

/** Budget (FIN-05B) : versements affectés − remboursements reçus (dates), + engagements restants. Même résultat pour écran, détail et export. */
export async function budgetActuals(c: string, b: Budget) {
  const rows = await allOcc(c, b.period_from, b.period_to, { category_id: b.category_id ?? undefined, truck_id: b.truck_id ?? undefined, project_id: b.project_id ?? undefined });
  const act = rows.filter((r) => r.status === "active");
  const remainC = act.reduce((s, r) => s + Math.max(0, toCents(r.balance ?? r.amount ?? 0) ?? 0), 0);
  const unknown = act.filter((r) => r.amount == null).length;
  // Affectations actives (réaffectations annulées exclues) et remboursements non annulés de la période.
  const [inPer, refs] = await Promise.all([
    db.from("fin_allocations").select("payment_id").eq("company_id", c).is("reversed_at", null).gte("allocated_on", b.period_from).lte("allocated_on", b.period_to).limit(5000),
    db.from("fin_refunds").select("id,payment_id,amount,refunded_on").eq("company_id", c).is("voided_at", null).gte("refunded_on", b.period_from).lte("refunded_on", b.period_to).limit(5000),
  ]);
  err(inPer.error); err(refs.error);
  const pids = [...new Set([...(inPer.data ?? []), ...(refs.data ?? [])].map((r: any) => r.payment_id))];
  let net = { grossC: 0, refundC: 0, netC: 0, lines: [] as ReturnType<typeof netPaid>["lines"] };
  if (pids.length) {
    const [al, pays, allRefs] = await Promise.all([
      db.from("fin_allocations").select("payment_id,amount,allocated_on,occurrence_id,fin_occurrences(obligation_id,fin_obligations(category_id,truck_id,project_id))").eq("company_id", c).is("reversed_at", null).in("payment_id", pids).limit(10000),
      db.from("fin_payments").select("id,amount,status").eq("company_id", c).in("id", pids),
      // Tous les remboursements de ces paiements : les antérieurs consomment d'abord le reliquat non affecté.
      db.from("fin_refunds").select("id,payment_id,amount,refunded_on").eq("company_id", c).is("voided_at", null).in("payment_id", pids).limit(10000),
    ]);
    err(al.error); err(pays.error); err(allRefs.error);
    const okPay = new Set((pays.data ?? []).filter((p: any) => p.status === "validated").map((p: any) => p.id));
    const match = (o: any) => !!o && (!b.category_id || o.category_id === b.category_id) && (!b.truck_id || o.truck_id === b.truck_id) && (!b.project_id || o.project_id === b.project_id);
    net = netPaid({ from: b.period_from, to: b.period_to,
      allocs: (al.data ?? []).filter((a: any) => okPay.has(a.payment_id)).map((a: any) => ({ payment_id: a.payment_id, cents: toCents(a.amount)!, date: a.allocated_on, match: match(a.fin_occurrences?.fin_obligations) })),
      payments: Object.fromEntries((pays.data ?? []).map((p: any) => [p.id, toCents(p.amount)!])),
      refunds: (allRefs.data ?? []).filter((r: any) => okPay.has(r.payment_id)).map((r: any) => ({ id: r.id, payment_id: r.payment_id, cents: toCents(r.amount)!, date: r.refunded_on })) });
  }
  return { paidC: net.netC, grossC: net.grossC, refundC: net.refundC, lines: net.lines, remainC, unknown, gapC: (toCents(b.amount) ?? 0) - net.netC - remainC };
}
