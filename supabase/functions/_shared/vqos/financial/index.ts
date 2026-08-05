// ============================================================
// MODULE 4 — MOTEUR FINANCIER TRANSPORT JSC
// ------------------------------------------------------------
// Consomme la sortie du moteur de trajets (module 3) et produit
// TOUS les montants d'une soumission : matériau, transport, temps
// facturable, suppléments, frais fixes, marge, taxes, total.
//
// RÈGLES :
//  - aucune valeur d'affaires codée : tout vient de `jsc_settings`,
//    `jsc_trucks`, `jsc_materials` et `jsc_taxes` ;
//  - le moteur est indépendant de l'interface : il retourne un objet
//    complet, jamais du HTML, du PDF ou un courriel ;
//  - chaque ligne du calcul est explicable (`explanation`).
// ============================================================
import { roundMoney, roundUpTo, type TaxRow } from "../core.ts";
import type { TripComputation } from "../routing/index.ts";
import { computeCharges, type ChargeDefinition, type ComputedCharge, CHARGES_MODULE_VERSION } from "./charges.ts";
import { resolveFinancialSettings, type FinancialSettings, FINANCIAL_SETTINGS_VERSION } from "./settings.ts";

export * from "./charges.ts";
export * from "./settings.ts";

export const FINANCIAL_ENGINE_VERSION = "financial-engine-1.0.0";

export interface BillableTime {
  raw_minutes: number;
  travel_minutes: number;
  operational_minutes: number;
  /** Temps brut moyen par voyage (information). */
  minutes_per_trip: number;
  rounding_step_minutes: number;
  rounded_minutes: number;
  minimum_minutes: number;
  minimum_applied: boolean;
  billable_minutes: number;
  billable_hours: number;
}

export interface MaterialCharge {
  material_id: string;
  material_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  pickup_id: string;
  pickup_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_taxable: boolean;
}

export interface TransportCharge {
  truck_id: string;
  truck_name: string | null;
  truck_type: string | null;
  capacity_tonnes: number;
  trips: number;
  hourly_rate: number;
  billable_hours: number;
  amount: number;
}

export interface TaxLine {
  id: string; name: string; code: string | null; rate_percent: number;
  base: number; amount: number;
}

export interface ExplanationLine {
  key: string;
  label: string;
  detail: string;
  amount: number;
  type: "line" | "subtotal" | "tax" | "total";
}

export interface FinancialResult {
  currency: string;
  settings: FinancialSettings;
  time: BillableTime;
  material: MaterialCharge;
  transport: TransportCharge;
  charges: ComputedCharge[];
  totals: {
    material_amount: number;
    transport_amount: number;
    surcharges_total: number;
    fixed_fees_total: number;
    base_amount: number;
    margin_percent: number;
    margin_amount: number;
    subtotal: number;
    taxable_base: number;
    taxes: TaxLine[];
    tax_total: number;
    total: number;
    minimum_order_adjustment: number;
  };
  explanation: ExplanationLine[];
  engine_version: string;
  modules: { settings: string; charges: string };
  computed_at: string;
}

export interface FinancialOptions {
  chargeDefinitions?: ChargeDefinition[];
  /** Le transport est-il taxable ? Paramètre admin `transport_is_taxable`. */
  settingsOverride?: Record<string, string>;
}

const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Temps facturable : brut → arrondi paramétré → minimum facturable. */
export function computeBillableTime(trips: TripComputation, settings: FinancialSettings): BillableTime {
  const raw = trips.totals.raw_minutes;
  const rounded = roundUpTo(raw, settings.time_rounding_minutes);
  const minimum = settings.min_billable_minutes;
  const billable = Math.max(rounded, minimum);
  return {
    raw_minutes: Number(raw.toFixed(2)),
    travel_minutes: Number(trips.totals.travel_minutes.toFixed(2)),
    operational_minutes: Number(trips.totals.operational_minutes.toFixed(2)),
    minutes_per_trip: Number((raw / Math.max(1, trips.totals.trips)).toFixed(2)),
    rounding_step_minutes: settings.time_rounding_minutes,
    rounded_minutes: rounded,
    minimum_minutes: minimum,
    minimum_applied: billable > rounded,
    billable_minutes: billable,
    billable_hours: Number((billable / 60).toFixed(4)),
  };
}

/** Taxes configurées (`jsc_taxes`), dans l'ordre, avec taxes composées. */
export function computeTaxes(base: number, taxes: TaxRow[], decimals: number): { lines: TaxLine[]; total: number } {
  const ordered = [...taxes].sort((a, b) => (a.apply_order ?? 0) - (b.apply_order ?? 0));
  const lines: TaxLine[] = [];
  let running = base;
  let total = 0;
  for (const t of ordered) {
    const amount = roundMoney(running * (Number(t.rate_percent) / 100), decimals);
    lines.push({
      id: t.id, name: t.name, code: t.code, rate_percent: Number(t.rate_percent),
      base: roundMoney(running, decimals), amount,
    });
    total += amount;
    if (t.compound) running += amount;
  }
  return { lines, total: roundMoney(total, decimals) };
}

/**
 * Point d'entrée du module 4.
 * @param trips    sortie complète du moteur de trajets (module 3)
 * @param taxes    taxes configurées dans l'administration
 * @param settings paramètres administrateur bruts (`jsc_settings`)
 */
export function computeFinancials(
  trips: TripComputation,
  taxes: TaxRow[],
  rawSettings: Record<string, string>,
  options: FinancialOptions = {},
): FinancialResult {
  const settings = resolveFinancialSettings(rawSettings);
  const d = settings.price_rounding_decimals;
  const ctx = trips.context;

  // --- Temps facturable -------------------------------------------------
  const time = computeBillableTime(trips, settings);

  // --- Matériau ---------------------------------------------------------
  const quantity = ctx.quantity.tonnage;
  const unitPrice = ctx.material.price_per_tonne;
  const materialAmount = roundMoney(quantity * unitPrice, d);
  const material: MaterialCharge = {
    material_id: ctx.material.id,
    material_name: ctx.material.name,
    supplier_id: ctx.supply.supplier_id,
    supplier_name: ctx.supply.supplier_name,
    pickup_id: ctx.supply.id,
    pickup_name: ctx.supply.name,
    unit: "tonne",
    quantity,
    unit_price: unitPrice,
    amount: materialAmount,
    is_taxable: ctx.material.is_taxable,
  };

  // --- Transport --------------------------------------------------------
  const hourlyRate = ctx.truck.hourly_rate;
  const transportAmount = roundMoney(time.billable_hours * hourlyRate, d);
  const transport: TransportCharge = {
    truck_id: ctx.truck.id,
    truck_name: ctx.truck.name,
    truck_type: ctx.truck.type,
    capacity_tonnes: ctx.truck.capacity_tonnes,
    trips: trips.totals.trips,
    hourly_rate: hourlyRate,
    billable_hours: time.billable_hours,
    amount: transportAmount,
  };

  // --- Suppléments et frais fixes --------------------------------------
  const chargeResult = computeCharges(
    rawSettings,
    {
      transport_amount: transportAmount,
      material_amount: materialAmount,
      trips: trips.totals.trips,
      distance_km: trips.totals.travel_distance_km,
      tonnage: quantity,
    },
    options.chargeDefinitions,
  );
  const charges = chargeResult.charges.map((c) => ({ ...c, amount: roundMoney(c.amount, d) }));
  const surcharges = roundMoney(chargeResult.surcharges_total, d);
  const fixedFees = roundMoney(chargeResult.fixed_fees_total, d);

  // --- Marge ------------------------------------------------------------
  const baseAmount = roundMoney(materialAmount + transportAmount + surcharges + fixedFees, d);
  const marginAmount = roundMoney(baseAmount * (settings.margin_percent / 100), d);
  let subtotal = roundMoney(baseAmount + marginAmount, d);

  // --- Montant minimum de commande (paramètre admin optionnel) ----------
  let minimumAdjustment = 0;
  if (settings.min_order_amount !== null && subtotal < settings.min_order_amount) {
    minimumAdjustment = roundMoney(settings.min_order_amount - subtotal, d);
    subtotal = roundMoney(settings.min_order_amount, d);
  }

  // --- Taxes ------------------------------------------------------------
  // Le transport est toujours taxable ; le matériau suit sa configuration.
  const transportIsTaxable = (rawSettings["transport_is_taxable"] ?? "true").toLowerCase() !== "false";
  const nonTaxableShare = material.is_taxable ? 0 : materialAmount;
  const taxableBase = roundMoney(
    transportIsTaxable ? Math.max(0, subtotal - nonTaxableShare) : Math.max(0, subtotal - transportAmount - nonTaxableShare),
    d,
  );
  const { lines: taxLines, total: taxTotal } = computeTaxes(taxableBase, taxes, d);
  const total = roundMoney(subtotal + taxTotal, d);

  // --- Transparence : chaque ligne expliquée ----------------------------
  const explanation: ExplanationLine[] = [
    {
      key: "material", label: `Matériau — ${material.material_name}`,
      detail: `${fmt(quantity)} t × ${fmt(unitPrice)} $/t (${material.pickup_name})`,
      amount: materialAmount, type: "line",
    },
    {
      key: "transport", label: `Transport — ${transport.truck_name ?? "camion"}`,
      detail: `${fmt(time.billable_hours)} h × ${fmt(hourlyRate)} $/h · ${transport.trips} voyage(s)` +
        (time.minimum_applied ? ` · minimum facturable de ${time.minimum_minutes} min appliqué` : ""),
      amount: transportAmount, type: "line",
    },
    ...charges
      .filter((c) => c.configured && c.amount !== 0)
      .map((c): ExplanationLine => ({ key: c.key, label: c.label, detail: c.detail, amount: c.amount, type: "line" })),
    {
      key: "margin", label: "Marge",
      detail: `${settings.margin_percent} % de ${fmt(baseAmount)} $`,
      amount: marginAmount, type: "line",
    },
    ...(minimumAdjustment > 0
      ? [{
          key: "minimum_order", label: "Ajustement montant minimum",
          detail: `Minimum de commande : ${fmt(settings.min_order_amount!)} $`,
          amount: minimumAdjustment, type: "line" as const,
        }]
      : []),
    { key: "subtotal", label: "Sous-total", detail: "", amount: subtotal, type: "subtotal" },
    ...taxLines.map((t): ExplanationLine => ({
      key: t.code ?? t.id, label: t.name,
      detail: `${t.rate_percent} % de ${fmt(t.base)} $`,
      amount: t.amount, type: "tax",
    })),
    { key: "total", label: "Total", detail: "", amount: total, type: "total" },
  ];

  return {
    currency: rawSettings["currency"] ?? "CAD",
    settings,
    time,
    material,
    transport,
    charges,
    totals: {
      material_amount: materialAmount,
      transport_amount: transportAmount,
      surcharges_total: surcharges,
      fixed_fees_total: fixedFees,
      base_amount: baseAmount,
      margin_percent: settings.margin_percent,
      margin_amount: marginAmount,
      subtotal,
      taxable_base: taxableBase,
      taxes: taxLines,
      tax_total: taxTotal,
      total,
      minimum_order_adjustment: minimumAdjustment,
    },
    explanation,
    engine_version: FINANCIAL_ENGINE_VERSION,
    modules: { settings: FINANCIAL_SETTINGS_VERSION, charges: CHARGES_MODULE_VERSION },
    computed_at: new Date().toISOString(),
  };
}

/** Objet complet destiné au module suivant (soumission, PDF, courriel). */
export interface QuoteComputation {
  trips: TripComputation;
  financial: FinancialResult;
}

export function assembleQuote(trips: TripComputation, financial: FinancialResult): QuoteComputation {
  return { trips, financial };
}