// Moteur de paie — miroir exact de public.pay_calc (même entrées, mêmes sorties, mêmes arrondis).
// Sert à l'aperçu et aux essais comparatifs; la paie réelle est toujours calculée côté serveur.
export type PayParams = Record<string, any>;
export type PayInput = {
  np: number; regular: number; bonus?: number;
  ytd?: Partial<Record<"ins" | "qpp1" | "qpp2" | "ei" | "qpip" | "qpip_er", number>>;
  fed_claim?: number | null; qc_claim?: number | null;
  sector?: "ordinaire" | "primaire_manufacturier" | "public" | "inconnu";
  total_payroll?: number | null; cnesst_rate_per_100?: number | null; ccq_applicable?: boolean | null; normes_exempt?: boolean;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: any) => (v === null || v === undefined ? null : Number(v));

export function bracketTax(inc: number, br: [number, number][]): number {
  let t = 0;
  for (let i = 0; i < br.length; i++) {
    const hi = i + 1 < br.length ? br[i + 1][0] : 1e15;
    t += Math.max(Math.min(inc, hi) - br[i][0], 0) * br[i][1];
  }
  return t;
}

export function payCalc(p: PayParams, i: PayInput) {
  const np = i.np, reg = i.regular, bon = i.bonus ?? 0, y = i.ytd ?? {}, t = reg + bon, yins = y.ins ?? 0;
  const missing: string[] = [];
  const q1r = p.qpp_rate, q1max = (p.qpp_max_pensionable - p.qpp_exempt) * p.qpp_rate;
  const enh = (p.qpp_rate - p.qpp_base_rate) / p.qpp_rate;
  const q1reg = r2(Math.max(reg - p.qpp_exempt / np, 0) * q1r);
  const q1 = Math.max(Math.min(r2(Math.max(t - p.qpp_exempt / np, 0) * q1r), q1max - (y.qpp1 ?? 0)), 0);
  const q2 = Math.max(Math.min(r2(Math.max(Math.min(yins + t, p.qpp2_ceiling) - Math.max(yins, p.qpp_max_pensionable), 0) * p.qpp2_rate), p.qpp2_max - (y.qpp2 ?? 0)), 0);
  const ei = Math.max(Math.min(r2(t * p.ei_rate), r2(p.ei_max_insurable * p.ei_rate) - (y.ei ?? 0)), 0);
  const eireg = r2(reg * p.ei_rate);
  const qp = Math.max(Math.min(r2(t * p.qpip_rate), r2(p.qpip_max * p.qpip_rate) - (y.qpip ?? 0)), 0);
  const qpreg = r2(reg * p.qpip_rate);
  const qper = Math.max(Math.min(r2(t * p.qpip_employer_rate), r2(p.qpip_max * p.qpip_employer_rate) - (y.qpip_er ?? 0)), 0);

  const a = Math.max(np * (reg - q1reg * enh), 0);
  const b = p.fed_bpa;
  const bpaf = a <= b.from ? b.max : a >= b.to ? b.min : b.max - ((b.max - b.min) * (a - b.from)) / (b.to - b.from);
  const k1 = p.fed_credit_rate * (num(i.fed_claim) ?? bpaf);
  const k2q = p.fed_credit_rate * (Math.min(np * q1reg * (1 - enh), q1max * (1 - enh)) + Math.min(np * eireg, p.ei_max_insurable * p.ei_rate) + Math.min(np * qpreg, p.qpip_max * p.qpip_rate));
  if (p.fed_cea == null) missing.push("fed_cea");
  const k4 = p.fed_credit_rate * Math.min(a, p.fed_cea ?? 0);
  const fedTax = (x: number) => Math.max(bracketTax(x, p.fed_brackets) - k1 - k2q - k4, 0) * (1 - p.fed_abatement);
  const fedann = fedTax(a), fedbon = bon > 0 ? fedTax(a + bon) - fedann : 0;
  const fed = r2(fedann / np + fedbon);

  if (p.qc_worker_ded_rate == null || p.qc_worker_ded_max == null) missing.push("qc_worker_deduction");
  const jded = Math.min(np * reg * (p.qc_worker_ded_rate ?? 0), p.qc_worker_ded_max ?? 0);
  const aq = Math.max(np * (reg - q1reg * enh) - jded, 0);
  const kq = p.qc_credit_rate * (num(i.qc_claim) ?? p.qc_basic);
  const qcTax = (x: number) => Math.max(bracketTax(x, p.qc_brackets) - kq, 0);
  const qcann = qcTax(aq), qcbon = bon > 0 ? qcTax(aq + bon) - qcann : 0;
  const qc = r2(qcann / np + qcbon);

  const P = num(i.total_payroll), f = p.fss;
  const fssr = i.sector === "ordinaire"
    ? (P == null ? null : P <= f.low ? f.low_rate : P >= f.high ? f.high_rate : f.base + (f.slope * P) / 1000000)
    : i.sector === "public" ? f.high_rate : null;
  if (fssr == null) missing.push("fss");
  const cn = i.cnesst_rate_per_100 == null ? null : r2((t * i.cnesst_rate_per_100) / 100);
  if (cn == null) missing.push("cnesst");
  if (i.ccq_applicable == null || i.ccq_applicable) missing.push("ccq");

  return {
    total: t, qpp1: q1, qpp2: q2, qpp: r2(q1 + q2), ei, qpip: qp, fed_tax: fed, qc_tax: qc,
    net: r2(t - q1 - q2 - ei - qp - fed - qc),
    fed: { annual_income: r2(a), bpaf: r2(bpaf), k1: r2(k1), k2q: r2(k2q), k4: r2(k4), bonus_tax: r2(fedbon) },
    qc: { annual_income: r2(aq), worker_deduction: r2(jded), k: r2(kq), bonus_tax: r2(qcbon) },
    employer: {
      qpp: r2(q1 + q2), ei: r2(ei * p.ei_employer_factor), qpip: qper,
      fss: fssr == null ? null : r2((t * fssr) / 100), fss_rate_pct: fssr,
      normes: i.normes_exempt ? 0 : r2(Math.max(Math.min(t, p.normes_max - yins), 0) * p.normes_rate),
      cnesst: cn, fdrcmo_check: P != null && P > p.fdrcmo_threshold,
    },
    missing,
  };
}

export const MISSING_LABELS: Record<string, string> = {
  fed_cea: "Montant canadien pour emploi (fédéral) — à confirmer dans T4127",
  qc_worker_deduction: "Déduction des travailleurs (Québec) — à confirmer dans TP-1015.F",
  fss: "FSS — secteur ou masse salariale de l'employeur manquant",
  cnesst: "CNESST — taux de l'employeur manquant",
  ccq: "CCQ — assujettissement non précisé ou paramètres du régime manquants",
};
