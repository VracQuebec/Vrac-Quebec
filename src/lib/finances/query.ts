// FIN-04 — Contrat de requête commun : la même sélection sert à l'écran, aux totaux et aux exports.
// Dates métier en chaînes AAAA-MM-JJ locales (aucune conversion de fuseau).
import { addDays, addMonths, daysInMonth, parse, ymd } from "./period";

export type Ctx = "occ" | "pay";
export type RelKind =
  | "today" | "tomorrow" | "this_week" | "next_week" | "next_7" | "next_14" | "next_30" | "next_90"
  | "month" | "prev_month" | "next_month" | "quarter" | "half_civil" | "six_rolling" | "year" | "prev_year" | "last_90" | "fixed";
export const REL_LABELS: Record<RelKind, string> = {
  today: "Aujourd'hui", tomorrow: "Demain", this_week: "Cette semaine (lun.–dim.)", next_week: "Semaine suivante",
  next_7: "7 prochains jours", next_14: "14 prochains jours", next_30: "30 prochains jours", next_90: "90 prochains jours",
  month: "Mois courant", prev_month: "Mois précédent", next_month: "Mois suivant", quarter: "Trimestre civil courant",
  half_civil: "Semestre civil courant", six_rolling: "Six mois glissants (à partir d'aujourd'hui)", year: "Année civile courante",
  prev_year: "Année civile précédente", last_90: "90 derniers jours", fixed: "Dates fixes",
};
export type Period = { kind: RelKind; from?: string; to?: string };

/** Bornes inclusives. « 7 prochains jours » = aujourd'hui + 6 jours. Semaine du lundi au dimanche. */
export function resolvePeriod(p: Period, today: string): { from: string; to: string } {
  const { y, m, d } = parse(today);
  const monday = addDays(today, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
  const mon = (k: number) => { const n = addMonths(y, m, k); return { from: ymd(n.y, n.m, 1), to: ymd(n.y, n.m, daysInMonth(n.y, n.m)) }; };
  switch (p.kind) {
    case "today": return { from: today, to: today };
    case "tomorrow": { const t = addDays(today, 1); return { from: t, to: t }; }
    case "this_week": return { from: monday, to: addDays(monday, 6) };
    case "next_week": return { from: addDays(monday, 7), to: addDays(monday, 13) };
    case "next_7": return { from: today, to: addDays(today, 6) };
    case "next_14": return { from: today, to: addDays(today, 13) };
    case "next_30": return { from: today, to: addDays(today, 29) };
    case "next_90": return { from: today, to: addDays(today, 89) };
    case "last_90": return { from: addDays(today, -89), to: today };
    case "month": return mon(0);
    case "prev_month": return mon(-1);
    case "next_month": return mon(1);
    case "quarter": { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: ymd(y, qm, 1), to: ymd(y, qm + 2, daysInMonth(y, qm + 2)) }; }
    case "half_civil": return m <= 6 ? { from: ymd(y, 1, 1), to: ymd(y, 6, 30) } : { from: ymd(y, 7, 1), to: ymd(y, 12, 31) };
    case "six_rolling": { const e = addMonths(y, m, 6); const last = Math.min(d, daysInMonth(e.y, e.m)); return { from: today, to: addDays(ymd(e.y, e.m, last), -1) }; }
    case "year": return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
    case "prev_year": return { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) };
    default: return { from: p.from ?? today, to: p.to ?? today };
  }
}
export const daysInclusive = (from: string, to: string) => {
  const a = parse(from), b = parse(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1;
};

/** Filtres. Plusieurs valeurs d'une même liste = OU ; familles différentes = ET. */
export type OccFilters = {
  category_ids?: string[]; natures?: string[]; settles?: string[]; payee?: string; quality?: string; frequency?: string; seasonal?: string;
  recurring?: string; series?: string; status?: string; late?: string; amount_min?: string; amount_max?: string; balance_min?: string; balance_max?: string;
  method?: string; paid_from?: string; paid_to?: string; pay_file?: string; truck_id?: string; project_id?: string;
};
export type PayFilters = {
  category_ids?: string[]; methods?: string[]; pstatus?: string; payee?: string; reference?: string; account?: string; has_file?: string; unallocated?: string;
  amount_min?: string; amount_max?: string; date_base?: "paid" | "entered"; truck_id?: string; project_id?: string;
};
export type FinQuery = { ctx: Ctx; q: string; period: Period; base: "due" | "planned"; sort: string; occ: OccFilters; pay: PayFilters };

export const DEFAULT_QUERY = (ctx: Ctx): FinQuery => ({ ctx, q: "", period: { kind: ctx === "occ" ? "month" : "last_90" }, base: "due", sort: ctx === "occ" ? "date_asc" : "paid_desc", occ: {}, pay: {} });

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
export const cleanFilters = (f: Record<string, unknown>, q: string) => {
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(f).filter(([, v]) => !isEmpty(v)));
  const t = q.trim(); if (t) out.q = t;
  for (const k of ["amount_min", "amount_max", "balance_min", "balance_max"]) if (out[k] !== undefined && !Number.isFinite(Number(out[k]))) delete out[k];
  return out;
};
/** Filtres envoyés au serveur pour le contexte courant (contrat unique écran / totaux / export). */
export const serverFilters = (qy: FinQuery) => cleanFilters((qy.ctx === "occ" ? qy.occ : qy.pay) as Record<string, unknown>, qy.q);
export const activeCount = (qy: FinQuery) => Object.values(qy.ctx === "occ" ? qy.occ : qy.pay).filter((v) => !isEmpty(v)).length;

/** Une vue enregistrée garde la période relative (recalculée) ou des dates fixes. */
export function sanitizeView(raw: unknown, ctx: Ctx): FinQuery | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<FinQuery>;
  if (r.ctx !== ctx || !r.period || !(r.period.kind in REL_LABELS)) return null;
  if (r.period.kind === "fixed" && !(r.period.from && r.period.to && /^\d{4}-\d{2}-\d{2}$/.test(r.period.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.period.to))) return null;
  return { ...DEFAULT_QUERY(ctx), ...r, occ: { ...(r.occ ?? {}) }, pay: { ...(r.pay ?? {}) }, q: typeof r.q === "string" ? r.q : "" };
}

// ---------- Moyennes de planification ----------
export type AvgInput = { confirmed: number; estimated: number; unknown_count: number; count: number };
/** Mode A : budget d'une année civile complète. T = total connu des occurrences de l'année ; D = 365 ou 366. */
export function annualEquivalents(year: number, t: AvgInput) {
  const D = daysInclusive(ymd(year, 1, 1), ymd(year, 12, 31));
  const T = t.confirmed + t.estimated;
  return { D, T, allUnknown: t.count > 0 && t.unknown_count === t.count, day: T / D, week: (T * 7) / D, two_weeks: (T * 14) / D, month: T / 12, quarter: T / 4, half: T / 2, year: T };
}
/** Mode B : période libre ; aucune annualisation. */
export function freeAverages(from: string, to: string, t: AvgInput) {
  const D = daysInclusive(from, to);
  const T = t.confirmed + t.estimated;
  return { D, T, allUnknown: t.count > 0 && t.unknown_count === t.count, day: T / D, week: (T * 7) / D, two_weeks: (T * 14) / D };
}

// ---------- CSV ----------
/** Neutralise les formules (=, +, -, @, tabulation, retour) dans les champs texte. Les nombres restent numériques. */
export const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Séparateur « ; » (Excel français) et BOM UTF-8 pour les accents. */
export const toCsv = (summary: [string, unknown][], header: string[], rows: unknown[][]) =>
  "\uFEFF" + [...summary.map(([k, v]) => `${csvCell(k)};${csvCell(v)}`), "", header.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\r\n");

export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
