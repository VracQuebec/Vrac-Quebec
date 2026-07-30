// ============================================================
// VRAC QUÉBEC OS — CALCULATION ENGINE
// ------------------------------------------------------------
// Rôle : CALCULER. Ne décide rien.
// Reçoit un plan du Decision Engine et produit tous les chiffres
// officiels : temps (premier voyage, voyages suivants, temps fixes,
// arrondis), coût de transport, coût du matériau, surcharges, marge,
// taxes et total. Toutes les règles viennent des paramètres admin.
// ============================================================
import {
  type EngineSettings, type TaxRow, type Unit, fromTonnes, roundMoney, roundUpTo,
} from "./core.ts";
import type { TransportPlan } from "./decision-engine.ts";

export interface TripTiming {
  travel_to_delivery_minutes: number;
  travel_return_minutes: number;
  loading_minutes: number;
  unloading_minutes: number;
  fixed_minutes: number;
  raw_minutes: number;
  rounded_minutes: number;
}

export interface TimeBreakdown {
  first_trip: TripTiming;
  next_trip: TripTiming | null;
  trips: number;
  total_minutes_raw: number;
  total_minutes_rounded: number;
  total_hours_billed: number;
  total_distance_km: number;
}

export interface TaxLine { id: string; name: string; code: string | null; rate_percent: number; amount: number }

export interface CostBreakdown {
  transport_cost: number;
  material_unit_price: number;
  material_billed_quantity: number;
  material_billed_unit: string;
  material_cost: number;
  fuel_surcharge: number;
  zone_surcharge: number;
  surcharges_total: number;
  margin_amount: number;
  subtotal: number;
  taxes: TaxLine[];
  tax_total: number;
  total: number;
  /** Coûts internes (achat matériau) — jamais exposés au client. */
  material_purchase_cost: number;
}

export interface CalculatedPlan {
  plan: TransportPlan;
  time: TimeBreakdown;
  cost: CostBreakdown;
}

/** Temps du premier voyage et des voyages suivants, avec plancher et arrondi admin. */
export function calculateTime(plan: TransportPlan, settings: EngineSettings): TimeBreakdown {
  const { drive_minutes: drive, loading_minutes: loading, unloading_minutes: unloading, fixed_minutes: fixed } = plan;
  const step = settings.time_rounding_minutes;
  const floorMin = settings.min_trip_minutes;

  const firstRaw = Math.max(fixed + loading + drive + unloading, floorMin);
  const first: TripTiming = {
    travel_to_delivery_minutes: drive,
    travel_return_minutes: 0,
    loading_minutes: loading,
    unloading_minutes: unloading,
    fixed_minutes: fixed,
    raw_minutes: firstRaw,
    rounded_minutes: roundUpTo(firstRaw, step),
  };

  let next: TripTiming | null = null;
  if (plan.trips > 1) {
    const nextRaw = Math.max(drive + loading + drive + unloading, floorMin);
    next = {
      travel_to_delivery_minutes: drive,
      travel_return_minutes: drive,
      loading_minutes: loading,
      unloading_minutes: unloading,
      fixed_minutes: 0,
      raw_minutes: nextRaw,
      rounded_minutes: roundUpTo(nextRaw, step),
    };
  }

  const extra = plan.trips - 1;
  const totalRaw = first.raw_minutes + (next ? next.raw_minutes * extra : 0);
  const totalRounded = first.rounded_minutes + (next ? next.rounded_minutes * extra : 0);

  let hoursBilled = totalRounded / 60;
  if (plan.rate.minimum_hours > 0) hoursBilled = Math.max(hoursBilled, plan.rate.minimum_hours);

  return {
    first_trip: first,
    next_trip: next,
    trips: plan.trips,
    total_minutes_raw: totalRaw,
    total_minutes_rounded: totalRounded,
    total_hours_billed: Number(hoursBilled.toFixed(3)),
    total_distance_km: Number((plan.distance_km * (plan.trips * 2 - 1)).toFixed(2)),
  };
}

/** Coût de transport selon le mode de tarification configuré. */
export function calculateTransportCost(plan: TransportPlan, time: TimeBreakdown): number {
  const rate = plan.rate;
  let cost: number;
  switch (rate.rate_mode) {
    case "hourly": cost = time.total_hours_billed * rate.hourly_rate; break;
    case "per_km": cost = time.total_distance_km * rate.rate_per_km; break;
    case "per_trip": cost = plan.trips * rate.rate_per_trip; break;
    case "flat": cost = rate.flat_rate; break;
    default: throw new Error(`Mode de tarification inconnu : ${rate.rate_mode}`);
  }
  if (rate.minimum_charge > 0) cost = Math.max(cost, rate.minimum_charge);
  return cost;
}

/** Taxes configurées, dans l'ordre, avec support des taxes composées. */
export function calculateTaxes(base: number, taxes: TaxRow[], decimals: number): { lines: TaxLine[]; total: number } {
  const ordered = [...taxes].sort((a, b) => (a.apply_order ?? 0) - (b.apply_order ?? 0));
  const lines: TaxLine[] = [];
  let running = base;
  let total = 0;
  for (const t of ordered) {
    const amount = roundMoney(running * (Number(t.rate_percent) / 100), decimals);
    lines.push({ id: t.id, name: t.name, code: t.code, rate_percent: Number(t.rate_percent), amount });
    total += amount;
    if (t.compound) running += amount;
  }
  return { lines, total: roundMoney(total, decimals) };
}

/** Chiffrage complet d'un plan décidé par le Decision Engine. */
export function calculatePlan(
  plan: TransportPlan,
  settings: EngineSettings,
  taxes: TaxRow[],
): CalculatedPlan {
  const decimals = settings.price_rounding_decimals;
  const time = calculateTime(plan, settings);

  const transport = calculateTransportCost(plan, time);
  const fuel = transport * (settings.fuel_surcharge_percent / 100);
  const zoneSurcharge = plan.zone.distance_surcharge ?? 0;

  const priceUnit = (plan.price.unit as Unit) ?? "tonne";
  const billedQty = priceUnit === "voyage"
    ? plan.trips
    : fromTonnes(plan.tonnage, priceUnit, plan.material.density_kg_per_m3);
  const materialCost = billedQty * plan.price.selling_price;
  const materialPurchase = billedQty * (plan.price.purchase_price ?? 0);

  const base = transport + fuel + zoneSurcharge + materialCost;
  const margin = base * (settings.margin_percent / 100);
  const subtotal = roundMoney(base + margin, decimals);

  const applicableTaxes = plan.material.is_taxable ? taxes : [];
  const { lines, total: taxTotal } = calculateTaxes(subtotal, applicableTaxes, decimals);

  return {
    plan,
    time,
    cost: {
      transport_cost: roundMoney(transport, decimals),
      material_unit_price: plan.price.selling_price,
      material_billed_quantity: Number(billedQty.toFixed(3)),
      material_billed_unit: priceUnit,
      material_cost: roundMoney(materialCost, decimals),
      fuel_surcharge: roundMoney(fuel, decimals),
      zone_surcharge: roundMoney(zoneSurcharge, decimals),
      surcharges_total: roundMoney(fuel + zoneSurcharge, decimals),
      margin_amount: roundMoney(margin, decimals),
      subtotal,
      taxes: lines,
      tax_total: taxTotal,
      total: roundMoney(subtotal + taxTotal, decimals),
      material_purchase_cost: roundMoney(materialPurchase, decimals),
    },
  };
}