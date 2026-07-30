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

  return {
    public: {
      material: { id: best.plan.material.id, name: best.plan.material.name },
      quantity: input.quantity,
      unit: input.unit,
      tonnage: best.plan.tonnage,
      trips: best.plan.trips,
      estimated_duration_minutes: best.time.total_minutes_rounded,
      delivery_address: input.delivery.address ?? null,
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