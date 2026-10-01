// FIN-07 — Moteur commun TPS/TVQ (miroir exact de public.fin_tax_compute).
// Calcul décimal exact (BigInt), aucun taux codé ici : les taux viennent de fin_tax_rates (versionnés par date).
// Règle d'arrondi : chaque taxe arrondie au cent (demi éloigné de zéro) sur la base du document.
// Prix taxes incluses : chaque taxe = total × taux / (1 + taux cumulés), arrondie au cent; la base hors taxes est le solde
// (aucune taxe n'absorbe d'écart; rounding_gap = écart éventuel de ±1 ¢ entre base × taux et la taxe extraite, documenté).
export type TaxTreatment = "taxable" | "detaxe" | "exonere" | "a_determiner";
export type RegStatus = "inscrit" | "non_inscrit" | "a_completer";
export type TaxLine = { qty: number | string | null; price: number | string | null; disc_pct?: number | string | null; tax?: TaxTreatment | null };
export type TaxRates = { gst: string | number | null; qst: string | number | null };
export type TaxResult = {
  currency: "CAD"; prices_include_tax: boolean; gst_status: RegStatus; qst_status: RegStatus;
  gst_rate: number | null; qst_rate: number | null;
  subtotal: number; discount: number; taxable_base: number | null; zero_rated_base: number; exempt_base: number; undetermined: number;
  gst: number | null; qst: number | null; rounding_gap?: number | null; pre_tax: number | null; total: number | null; resolved: boolean; reasons: string[];
};

export const TREATMENT_LABEL: Record<TaxTreatment, string> = { taxable: "Taxable", detaxe: "Détaxé (0 %)", exonere: "Exonéré", a_determiner: "À déterminer" };
export const STATUS_LABEL: Record<RegStatus, string> = { inscrit: "Inscrit", non_inscrit: "Non inscrit", a_completer: "À compléter" };

// Décimal exact : valeur = n / 10^s
type D = { n: bigint; s: number };
const dec = (v: number | string): D => {
  const t = String(v).trim(); if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(t)) throw new Error(`Nombre invalide : ${t}`);
  if (/e/i.test(t)) return dec(Number(t).toFixed(12));
  const neg = t.startsWith("-"); const [i, f = ""] = t.replace("-", "").split(".");
  return { n: BigInt((neg ? "-" : "") + i + f), s: f.length };
};
const pow = (k: number) => 10n ** BigInt(k);
/** Arrondit n/10^s (×mul/div) au cent, demi éloigné de zéro → cents entiers. */
const toCents = (num: bigint, den: bigint): bigint => {
  const neg = (num < 0n) !== (den < 0n); const a = num < 0n ? -num : num; const b = den < 0n ? -den : den;
  const q = (a * 2n + b) / (b * 2n); return neg ? -q : q;
};
const mulCents = (a: D, b: D) => toCents(a.n * b.n * 100n, pow(a.s + b.s));
const cents = (c: bigint) => Number(c) / 100;

export function computeTaxes(lines: TaxLine[], opts: { gstStatus: RegStatus; qstStatus: RegStatus; rates: TaxRates; pricesIncludeTax?: boolean }): TaxResult {
  let sub = 0n, dsum = 0n, bt = 0n, bz = 0n, be = 0n, bu = 0n; const reasons: string[] = [];
  for (const l of lines) {
    if (l.qty == null || l.qty === "" || l.price == null || l.price === "") continue;
    const gross = mulCents(dec(l.qty), dec(l.price));
    const pct = l.disc_pct == null || l.disc_pct === "" ? null : dec(l.disc_pct);
    const disc = pct ? toCents(gross * pct.n, 100n * pow(pct.s)) : 0n;
    const net = gross - disc; sub += gross; dsum += disc;
    switch (l.tax ?? "a_determiner") { case "taxable": bt += net; break; case "detaxe": bz += net; break; case "exonere": be += net; break; default: bu += net; }
  }
  if (bu !== 0n) reasons.push("Ligne au traitement fiscal à déterminer");
  const gi = opts.gstStatus === "inscrit", qi = opts.qstStatus === "inscrit";
  const g = opts.rates.gst == null ? null : dec(opts.rates.gst), q = opts.rates.qst == null ? null : dec(opts.rates.qst);
  if (bt !== 0n) {
    if (!["inscrit", "non_inscrit"].includes(opts.gstStatus)) reasons.push("Statut TPS de l'entreprise à compléter");
    if (!["inscrit", "non_inscrit"].includes(opts.qstStatus)) reasons.push("Statut TVQ de l'entreprise à compléter");
    if ((gi && !g) || (qi && !q)) reasons.push("Taux non disponible à cette date");
  }
  const ok = reasons.length === 0; let base = bt, tg = 0n, tq = 0n, gap = 0n;
  if (ok && bt !== 0n) {
    if (opts.pricesIncludeTax) {
      // Chaque taxe = total TTC × taux / (1 + taux cumulés), précision complète puis arrondi au cent ; base = solde.
      const S = Math.max(g?.s ?? 0, q?.s ?? 0); const one = pow(S);
      const sc = (x: D | null, on: boolean) => (on && x ? x.n * pow(S - x.s) : 0n);
      const f = one + sc(g, gi) + sc(q, qi);
      if (gi) tg = toCents(bt * sc(g, true), f);
      if (qi) tq = toCents(bt * sc(q, true), f);
      base = bt - tg - tq;
      gap = (gi ? toCents(base * g!.n, pow(g!.s)) : 0n) + (qi ? toCents(base * q!.n, pow(q!.s)) : 0n) - (tg + tq);
    } else {
      if (gi) tg = toCents(bt * g!.n, pow(g!.s));
      if (qi) tq = toCents(bt * q!.n, pow(q!.s));
    }
  }
  return {
    currency: "CAD", prices_include_tax: !!opts.pricesIncludeTax, gst_status: opts.gstStatus, qst_status: opts.qstStatus,
    gst_rate: gi && g ? Number(opts.rates.gst) : null, qst_rate: qi && q ? Number(opts.rates.qst) : null,
    subtotal: cents(sub), discount: cents(dsum), taxable_base: ok ? cents(base) : null,
    zero_rated_base: cents(bz), exempt_base: cents(be), undetermined: cents(bu),
    gst: ok ? cents(tg) : null, qst: ok ? cents(tq) : null,
    pre_tax: ok ? cents(base + bz + be) : null, total: ok ? cents(base + tg + tq + bz + be) : null,
    resolved: ok, reasons, rounding_gap: ok ? cents(gap) : null,
  };
}

/** Correction liée à un document (future note de crédit) : reprend taux et statuts historiques figés. */
export function computeCorrection(snapshot: { gst_status: RegStatus; qst_status: RegStatus; gst_rate: number | null; qst_rate: number | null; prices_include_tax: boolean }, lines: TaxLine[]) {
  return computeTaxes(lines, { gstStatus: snapshot.gst_status, qstStatus: snapshot.qst_status, pricesIncludeTax: snapshot.prices_include_tax, rates: { gst: snapshot.gst_rate ?? 0, qst: snapshot.qst_rate ?? 0 } });
}

/** Taux en vigueur à une date (America/Toronto), lus dans la table centrale. */
export async function loadRates(db: any, on?: string): Promise<TaxRates> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const day = on ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
  const { data } = await db.from("fin_tax_rates").select("tax,rate,effective_from").eq("jurisdiction", "QC").lte("effective_from", day).order("effective_from", { ascending: false });
  const pick = (t: string) => (data ?? []).find((r: { tax: string }) => r.tax === t)?.rate ?? null;
  return { gst: pick("gst"), qst: pick("qst") };
}

export const GST_FORMAT = /^\d{9}\s?RT\s?\d{4}$/i;
export const QST_FORMAT = /^\d{10}\s?TQ\s?\d{4}$/i;
