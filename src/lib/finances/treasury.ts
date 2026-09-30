// FIN-05 — Moteur de trésorerie (fonctions pures, montants en cents entiers, dates AAAA-MM-JJ locales America/Toronto).
// Aucune écriture : le moteur lit des mouvements et retourne une projection.
import { addDays, addMonths, daysInMonth, parse, ymd } from "./period";

export const toCents = (n: number | string | null | undefined) => (n == null || n === "" ? null : Math.round(Number(n) * 100));
export const fromCents = (c: number) => c / 100;

export type Account = { id: string; name: string; kind: "bank" | "cash" | "card" | "credit"; currency: string; included: boolean; credit_limit?: number | null };
export type Balance = { account_id: string; amount: number; as_of: string; source: string }; // amount en dollars
export type MoveKind = "occurrence" | "late" | "payment" | "refund" | "inflow" | "transfer" | "scenario";
export type Movement = {
  id: string; date: string; cents: number | null; dir: "in" | "out"; kind: MoveKind; label: string;
  account_id?: string | null; currency?: string; certainty?: string; flag?: string;
  obligation_id?: string; category?: string | null; ref?: string; transfer_to?: string | null;
  unassigned?: boolean; via_card?: boolean; // FIN-05B
};
export type Reserve = { id: string; name: string; target: number; reserved: number; target_date: string; obligation_id?: string | null };
export type DayRow = { date: string; inC: number; outC: number; closeC: number | null; heldC: number; availC: number | null };
export type Forecast = {
  currency: string; from: string; to: string; startC: number | null; missingBalances: string[];
  inC: number; outC: number; endC: number | null; low: { date: string; c: number } | null; firstShort: string | null; neededC: number | null;
  unknown: Movement[]; days: DayRow[]; moves: Movement[]; toReplan: number; heldEndC: number; otherCurrencies: string[];
  partial: string[]; unassignedC: number; // FIN-05B : prévision partielle si un doublon ne peut être exclu
};

/** Montant d'une entrée attendue encore à recevoir (encaissement déclaré déduit, jamais négatif). */
export const remainingExpected = (amount: number, received: number) => Math.max(0, (toCents(amount) ?? 0) - (toCents(received) ?? 0));

/** Mois à mettre de côté par mois pour une réserve. */
export function reserveMonthly(r: Reserve, today: string) {
  const left = Math.max(0, (toCents(r.target) ?? 0) - (toCents(r.reserved) ?? 0));
  const a = parse(today), b = parse(r.target_date);
  const months = Math.max(1, (b.y - a.y) * 12 + (b.m - a.m));
  return { leftC: left, months, perMonthC: Math.ceil(left / months) };
}

export function forecast(input: {
  from: string; to: string; currency?: string; accounts: Account[]; balances: Balance[]; moves: Movement[]; reserves?: Reserve[]; thresholdC?: number;
}): Forecast {
  const cur = input.currency ?? "CAD";
  const acc = new Map(input.accounts.map((a) => [a.id, a]));
  const cash = input.accounts.filter((a) => a.included && (a.kind === "bank" || a.kind === "cash") && a.currency === cur);
  const cashIds = new Set(cash.map((a) => a.id));
  const latest = new Map<string, Balance>();
  for (const b of input.balances) { const p = latest.get(b.account_id); if (!p || b.as_of > p.as_of) latest.set(b.account_id, b); }
  const missing = cash.filter((a) => !latest.has(a.id)).map((a) => a.name);
  const startC = cash.length === 0 || missing.length ? null : cash.reduce((s, a) => s + (toCents(latest.get(a.id)!.amount) ?? 0), 0);
  const asOfs = cash.map((a) => latest.get(a.id)?.as_of).filter(Boolean) as string[];
  const globalAsOf = asOfs.sort().at(-1) ?? null;

  const kept: Movement[] = []; const unknown: Movement[] = [];
  let toReplan = 0, viaCard = 0;
  for (const m0 of input.moves) {
    const m = { ...m0 };
    if ((m.currency ?? "CAD") !== cur) continue;
    // Compte hors trésorerie (carte, crédit, compte exclu) : n'affecte pas l'encaisse.
    if (m.account_id && !cashIds.has(m.account_id) && m.kind !== "transfer") continue;
    // Achat réglé par carte : aucune sortie bancaire; c'est le remboursement de la carte qui sort du compte, une seule fois.
    if (m.via_card) { viaCard++; continue; }
    if (m.kind === "transfer") {
      const inFrom = !!m.account_id && cashIds.has(m.account_id), inTo = !!m.transfer_to && cashIds.has(m.transfer_to);
      if (inFrom === inTo) continue; // deux comptes inclus (ou aucun) : effet global nul
      m.dir = inFrom ? "out" : "in";
    }
    // Déjà inclus dans le solde saisi : mouvement daté au plus tard à la date du solde du compte.
    const ref = m.account_id && latest.get(m.account_id) ? latest.get(m.account_id)!.as_of : globalAsOf;
    const occLike = m.kind === "occurrence" || m.kind === "late";
    if (!occLike && ref && m.date <= ref) continue;
    let date = m.date;
    if (date < input.from) { date = input.from; if (occLike) { m.flag = "À replanifier"; toReplan++; } }
    if (date > input.to) continue;
    if (m.cents == null) { unknown.push({ ...m, date }); continue; }
    kept.push({ ...m, date });
  }
  kept.sort((a, b) => a.date.localeCompare(b.date));

  const reserves = input.reserves ?? [];
  const usedByRes = new Map<string, number>();
  const days: DayRow[] = [];
  let bal = startC; let inC = 0, outC = 0; let low: Forecast["low"] = null; let firstShort: string | null = null;
  const th = input.thresholdC ?? 0;
  let i = 0;
  for (let d = input.from; d <= input.to; d = addDays(d, 1)) {
    let di = 0, doo = 0;
    while (i < kept.length && kept[i].date === d) {
      const m = kept[i++];
      if (m.dir === "in") di += m.cents!; else {
        doo += m.cents!;
        const r = reserves.find((x) => x.obligation_id && x.obligation_id === m.obligation_id);
        if (r) usedByRes.set(r.id, (usedByRes.get(r.id) ?? 0) + m.cents!);
      }
    }
    inC += di; outC += doo;
    if (bal != null) bal = bal + di - doo;
    // Réserve virtuelle : réduit le disponible, jamais le solde. Le paiement lié consomme la réserve (pas de double déduction).
    const held = reserves.reduce((s, r) => s + Math.max(0, (toCents(r.reserved) ?? 0) - (usedByRes.get(r.id) ?? 0)), 0);
    days.push({ date: d, inC: di, outC: doo, closeC: bal, heldC: held, availC: bal == null ? null : bal - held });
    if (bal != null) {
      if (!low || bal < low.c) low = { date: d, c: bal };
      if (!firstShort && bal < th) firstShort = d;
    }
  }
  const hasCard = input.accounts.some((a) => a.kind === "card" || a.kind === "credit");
  const unassigned = kept.filter((m) => m.unassigned);
  const unassignedC = unassigned.reduce((s, m) => s + (m.dir === "out" ? m.cents! : 0), 0);
  const partial: string[] = [];
  if (hasCard && unassigned.length) partial.push(`${unassigned.length} échéance(s) « Non affecté » : si certaines sont payées par carte, elles seraient comptées en plus du remboursement de la carte.`);
  if (viaCard && !hasCard) partial.push(`${viaCard} règlement(s) par carte sans compte carte : le remboursement de la carte n'est pas connu.`);
  const others = [...new Set(input.moves.map((m) => m.currency ?? "CAD").concat(input.accounts.map((a) => a.currency)))].filter((c) => c !== cur);
  return {
    currency: cur, from: input.from, to: input.to, startC, missingBalances: missing, inC, outC,
    endC: bal, low, firstShort, neededC: low ? Math.max(0, th - low.c) : null, unknown, days, moves: kept, toReplan,
    heldEndC: days.at(-1)?.heldC ?? 0, otherCurrencies: others, partial, unassignedC,
  };
}

/** Regroupement pour l'affichage (semaines lun.–dim. ou mois). */
export function buckets(f: Forecast, by: "week" | "month") {
  const out: { key: string; from: string; to: string; inC: number; outC: number; closeC: number | null; lowC: number | null }[] = [];
  for (const d of f.days) {
    const { y, m, d: dd } = parse(d.date);
    const key = by === "month" ? ymd(y, m, 1) : addDays(d.date, -((new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7));
    let b = out.at(-1);
    if (!b || b.key !== key) { b = { key, from: d.date, to: d.date, inC: 0, outC: 0, closeC: null, lowC: null }; out.push(b); }
    b.to = d.date; b.inC += d.inC; b.outC += d.outC; b.closeC = d.closeC;
    if (d.closeC != null) b.lowC = b.lowC == null ? d.closeC : Math.min(b.lowC, d.closeC);
  }
  return out;
}

// ---------- Scénarios (simulation seulement : copie des mouvements, jamais d'écriture) ----------
export type Hypothesis =
  | { type: "delay_inflow"; days: number; certainty?: string }
  | { type: "expense_increase"; pct: number; category?: string }
  | { type: "one_off"; amount: number; date: string; label: string }
  | { type: "annual_to_monthly"; obligation_id: string; months: number };
export const HYP_LABEL: Record<Hypothesis["type"], string> = {
  delay_inflow: "Retard d'encaissement", expense_increase: "Hausse de dépenses", one_off: "Réparation ponctuelle", annual_to_monthly: "Paiement annuel en mensualités",
};
export function describe(h: Hypothesis) {
  switch (h.type) {
    case "delay_inflow": return `Entrées${h.certainty ? ` (${h.certainty})` : ""} retardées de ${h.days} jours`;
    case "expense_increase": return `Sorties prévues${h.category ? ` « ${h.category} »` : ""} +${h.pct} %`;
    case "one_off": return `${h.label || "Réparation"} : ${h.amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })} le ${h.date}`;
    case "annual_to_monthly": return `Paiement annuel remplacé par ${h.months} mensualités`;
  }
}
const addMonthsDate = (s: string, k: number) => { const { y, m, d } = parse(s); const n = addMonths(y, m, k); return ymd(n.y, n.m, Math.min(d, daysInMonth(n.y, n.m))); };

export function applyScenario(moves: readonly Movement[], hyps: readonly Hypothesis[]): Movement[] {
  let out = moves.map((m) => ({ ...m }));
  for (const h of hyps) {
    if (h.type === "delay_inflow") out = out.map((m) => m.dir === "in" && m.kind === "inflow" && (!h.certainty || m.certainty === h.certainty) ? { ...m, date: addDays(m.date, Math.trunc(h.days)) } : m);
    else if (h.type === "expense_increase") out = out.map((m) => m.dir === "out" && (m.kind === "occurrence" || m.kind === "late") && m.cents != null && (!h.category || m.category === h.category) ? { ...m, cents: Math.round(m.cents * (100 + h.pct) / 100) } : m);
    else if (h.type === "one_off") out.push({ id: `sc-${out.length}`, date: h.date, cents: toCents(h.amount), dir: "out", kind: "scenario", label: h.label || "Réparation simulée" });
    else if (h.type === "annual_to_monthly") {
      const n = Math.max(1, Math.trunc(h.months));
      const next: Movement[] = [];
      for (const m of out) {
        if (m.obligation_id !== h.obligation_id || m.dir !== "out" || m.cents == null) { next.push(m); continue; }
        const base = Math.floor(m.cents / n);
        for (let k = 0; k < n; k++) next.push({ ...m, id: `${m.id}-m${k}`, kind: "scenario", date: addMonthsDate(m.date, k), cents: k === n - 1 ? m.cents - base * (n - 1) : base, label: `${m.label} (mensualité ${k + 1}/${n})` });
      }
      out = next;
    }
  }
  return out;
}

/** Empreinte des données sources : change si un mouvement réel est ajouté, retiré ou modifié. */
export function sourceHash(moves: readonly Movement[]) {
  const s = moves.map((m) => `${m.id}:${m.date}:${m.cents}`).sort().join("|");
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------- FIN-05B : paiements nets d'un budget ----------
export type NetAlloc = { payment_id: string; cents: number; date: string; match: boolean };
export type NetRefund = { id: string; payment_id: string; cents: number; date: string };
export type NetLine = { date: string; type: "Versement" | "Remboursement"; payment_id: string; cents: number; note?: string };
/**
 * Versements affectés à la sélection (date d'affectation dans la période) moins remboursements reçus (date du remboursement dans la période).
 * Un remboursement consomme d'abord le reliquat non affecté du paiement (aucun effet sur les catégories), puis réduit les affectations
 * au prorata. Annulations et réaffectations : les affectations annulées sont exclues en amont, aucune ligne de remboursement.
 */
export function netPaid(i: { from: string; to: string; allocs: NetAlloc[]; payments: Record<string, number>; refunds: NetRefund[] }) {
  const lines: NetLine[] = [];
  let gross = 0;
  for (const a of i.allocs) if (a.match && a.date >= i.from && a.date <= i.to) { gross += a.cents; lines.push({ date: a.date, type: "Versement", payment_id: a.payment_id, cents: a.cents }); }
  const allBy = new Map<string, number>(), matchBy = new Map<string, number>();
  for (const a of i.allocs) { allBy.set(a.payment_id, (allBy.get(a.payment_id) ?? 0) + a.cents); if (a.match) matchBy.set(a.payment_id, (matchBy.get(a.payment_id) ?? 0) + a.cents); }
  const done = new Map<string, number>();
  let refunded = 0;
  for (const r of [...i.refunds].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const all = allBy.get(r.payment_id) ?? 0, before = done.get(r.payment_id) ?? 0;
    done.set(r.payment_id, before + r.cents);
    const unalloc = Math.max(0, (i.payments[r.payment_id] ?? all) - all);
    const reduce = Math.max(0, r.cents - Math.max(0, unalloc - before));
    const share = all > 0 ? (matchBy.get(r.payment_id) ?? 0) / all : 0;
    const c = Math.round(reduce * share);
    if (c > 0 && r.date >= i.from && r.date <= i.to) { refunded += c; lines.push({ date: r.date, type: "Remboursement", payment_id: r.payment_id, cents: -c, note: reduce < r.cents ? "partie reliquat non affecté exclue" : undefined }); }
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return { grossC: gross, refundC: refunded, netC: gross - refunded, lines };
}
