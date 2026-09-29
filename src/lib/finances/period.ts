// FIN-01 — Dates métier en DATE locale (chaînes AAAA-MM-JJ), sans conversion
// de fuseau : une échéance ne glisse jamais à la veille.

export type PeriodKind = "day" | "week" | "month" | "quarter" | "half" | "year" | "custom";
export const PERIOD_LABELS: Record<PeriodKind, string> = {
  day: "Jour", week: "Semaine", month: "Mois", quarter: "Trimestre", half: "Six mois", year: "Année", custom: "Dates personnalisées",
};

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const addDays = (s: string, n: number) => {
  const { y, m, d } = parse(s); const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
export const addMonths = (y: number, m: number, k: number) => { const i = y * 12 + (m - 1) + k; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; };

/** Date locale d'aujourd'hui dans le fuseau de l'entreprise. */
export const todayIn = (tz = "America/Toronto") =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Même règle que le serveur (fin_month_date) : jour d'ancrage, dernier jour si le mois est trop court. */
export const monthlyDate = (anchor: string, day: number, k: number) => {
  const a = parse(anchor); const { y, m } = addMonths(a.y, a.m, k);
  return ymd(y, m, Math.min(day, daysInMonth(y, m)));
};
export const previewMonthly = (anchor: string, day: number, count = 4, end?: string | null) => {
  const out: string[] = [];
  for (let k = 0; out.length < count && k < 600; k++) {
    const d = monthlyDate(anchor, day, k);
    if (end && d > end) break;
    if (d >= anchor) out.push(d);
  }
  return out;
};

/** Bornes calendaires exactes (pas d'approximation 30/365 jours). */
export const periodBounds = (kind: PeriodKind, ref: string, custom?: { from: string; to: string }) => {
  const { y, m } = parse(ref);
  switch (kind) {
    case "day": return { from: ref, to: ref };
    case "week": { const { d } = parse(ref); const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; const from = addDays(ref, -dow); return { from, to: addDays(from, 6) }; }
    case "month": return { from: ymd(y, m, 1), to: ymd(y, m, daysInMonth(y, m)) };
    case "quarter": { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: ymd(y, qm, 1), to: ymd(y, qm + 2, daysInMonth(y, qm + 2)) }; }
    case "half": { const e = addMonths(y, m, 5); return { from: ymd(y, m, 1), to: ymd(e.y, e.m, daysInMonth(e.y, e.m)) }; }
    case "year": return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
    default: return custom ?? { from: ref, to: ref };
  }
};

export const fmtDate = (s: string) => { const { y, m, d } = parse(s); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-CA", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }); };
export const fmtMoney = (n: number | null | undefined) => n == null ? "À compléter" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

export type Occ = { id: string; obligation_id: string; due_date: string; planned_date: string; ref_date: string; amount: number | null; amount_quality: "confirmed" | "estimated" | "unknown"; status: "active" | "cancelled"; cancel_reason: string | null; label: string; payee: string | null; category: string | null; frequency: "once" | "monthly"; planned_override: boolean; amount_override: boolean };

/** Totaux (référence client, identique au calcul serveur fin_period_totals). */
export const totals = (rows: Pick<Occ, "amount" | "amount_quality" | "status">[]) => {
  const act = rows.filter((r) => r.status === "active");
  const sum = (q: string) => Math.round(act.filter((r) => r.amount_quality === q).reduce((s, r) => s + (r.amount ?? 0), 0) * 100) / 100;
  const confirmed = sum("confirmed"), estimated = sum("estimated");
  return { confirmed, estimated, known: Math.round((confirmed + estimated) * 100) / 100, unknown_count: act.filter((r) => r.amount_quality === "unknown").length, count: rows.length };
};
export const QUALITY_LABEL = { confirmed: "Confirmé", estimated: "Estimé", unknown: "À compléter" } as const;
