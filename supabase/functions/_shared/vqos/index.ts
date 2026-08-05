// ============================================================
// VRAC QUÉBEC OS — ORCHESTRATEUR DES MOTEURS
// ------------------------------------------------------------
// Enchaîne Decision Engine -> Calculation Engine -> décision finale.
// Point d'entrée unique de toute estimation de la plateforme :
// site web, calculateur public, CRM, commandes, répartition,
// API futures, IA téléphonique, applications mobiles.
// Le moteur retourne uniquement des données ; il ne décide jamais
// de ce qui sera affiché.
// ============================================================
import {
  type DistanceProvider, type EngineConfig, type QuoteInput, resolveSettings, type EngineSettings,
} from "./core.ts";
import { decide, selectBest, type DecisionTrace, type TransportPlan } from "./decision-engine.ts";
import { calculatePlan, type CalculatedPlan } from "./calculation-engine.ts";

export * from "./core.ts";
export * from "./supply.ts";
export * from "./decision-engine.ts";
export * from "./calculation-engine.ts";

export interface QuoteResult {
  /** Données destinées au client (aucune information stratégique). */
  public: {
    material: { id: string; name: string };
    quantity: number;
    unit: string;
    tonnage: number;
    trips: number;
    estimated_duration_minutes: number;
    delivery_address: string | null;
    /** Logistique affichable : décidée par le moteur, jamais choisie par le client. */
    pickup: { name: string | null };
    truck: { name: string | null; type: string | null; capacity_tonnes: number | null };
    distance_km: number;
    round_trip_km: number;
    /** Ventilation client : matériau et transport (marge déjà répartie, aucun coût interne). */
    material_amount: number;
    transport_amount: number;
    subtotal: number;
    taxes: Array<{ name: string; code: string | null; rate_percent: number; amount: number }>;
    tax_total: number;
    total: number;
  };
  /** Données internes : décision complète, coûts, marge, options écartées. */
  technical: {
    selected: CalculatedPlan;
    options: CalculatedPlan[];
    decision_trace: DecisionTrace;
    settings_used: EngineSettings;
  };
  computed_at: string;
  engine_version: string;
}

export const ENGINE_VERSION = "vqos-1.0.0";

export async function runQuote(
  input: QuoteInput,
  config: EngineConfig,
  distance: DistanceProvider,
): Promise<QuoteResult> {
  const settings = resolveSettings(config.settings);

  // 1. DECISION ENGINE — quelles combinaisons sont possibles.
  const { plans, trace } = await decide(input, config, distance);

  // 2. CALCULATION ENGINE — chiffrage officiel de chaque combinaison.
  const calculated = plans.map((plan: TransportPlan) => calculatePlan(plan, settings, config.taxes));

  // 3. Décision finale — coût total livré minimal.
  const { best, ranked } = selectBest(calculated, (c) => c.cost.total);

  // Ventilation affichable : la marge est répartie au prorata pour que
  // « matériau + transport » corresponde exactement au sous-total affiché.
  const decimals = settings.price_rounding_decimals;
  const factor = 10 ** Math.max(0, decimals);
  const rawBase = best.cost.material_cost + best.cost.transport_cost + best.cost.surcharges_total;
  const materialShare = rawBase > 0 ? best.cost.material_cost / rawBase : 0;
  const materialAmount = Math.round(best.cost.subtotal * materialShare * factor) / factor;
  const transportAmount = Math.round((best.cost.subtotal - materialAmount) * factor) / factor;

  return {
    public: {
      material: { id: best.plan.material.id, name: best.plan.material.name },
      quantity: input.quantity,
      unit: input.unit,
      tonnage: best.plan.tonnage,
      trips: best.plan.trips,
      estimated_duration_minutes: best.time.total_minutes_rounded,
      delivery_address: input.delivery.address ?? null,
      pickup: { name: best.plan.pickup.name ?? null },
      truck: {
        name: best.plan.truck.name ?? null,
        type: best.plan.truck.truck_type ?? null,
        capacity_tonnes: best.plan.truck.capacity_tonnes ?? null,
      },
      distance_km: best.plan.distance_km,
      round_trip_km: best.time.total_distance_km,
      material_amount: materialAmount,
      transport_amount: transportAmount,
      subtotal: best.cost.subtotal,
      taxes: best.cost.taxes.map((t) => ({ name: t.name, code: t.code, rate_percent: t.rate_percent, amount: t.amount })),
      tax_total: best.cost.tax_total,
      total: best.cost.total,
    },
    technical: {
      selected: best,
      options: ranked,
      decision_trace: trace,
      settings_used: settings,
    },
    computed_at: new Date().toISOString(),
    engine_version: ENGINE_VERSION,
  };
}