// Tests du moteur de calcul financier (P1 audit) : conversions, temps,
// tarification, marges, arrondis et taxes TPS/TVQ.
import { describe, expect, it } from "vitest";
import {
  fromTonnes, roundMoney, roundUpTo, toTonnes, resolveSettings, type EngineSettings,
} from "../../supabase/functions/_shared/vqos/core.ts";
import {
  calculatePlan, calculateTaxes, calculateTime, calculateTransportCost,
} from "../../supabase/functions/_shared/vqos/calculation-engine.ts";
import type { TransportPlan } from "../../supabase/functions/_shared/vqos/decision-engine.ts";

const TAXES = [
  { id: "tps", name: "TPS", code: "TPS", rate_percent: 5, apply_order: 1, compound: false },
  { id: "tvq", name: "TVQ", code: "TVQ", rate_percent: 9.975, apply_order: 2, compound: false },
];

const SETTINGS: EngineSettings = {
  time_rounding_minutes: 15,
  price_rounding_decimals: 2,
  margin_percent: 15,
  fuel_surcharge_percent: 0,
  min_trip_minutes: 30,
};

function makePlan(over: Partial<TransportPlan> = {}): TransportPlan {
  return {
    plan_id: "p1",
    tonnage: 60,
    material: { id: "m1", name: "Pierre 0-3/4", unit: "tonne", density_kg_per_m3: 1600, is_taxable: true },
    supplier: { id: "s1", name: "Fournisseur" },
    pickup: { id: "pu1", name: "Carrière", zone_id: "z1", latitude: 46.8, longitude: -71.2 },
    carrier: { id: "c1", name: "Transporteur" },
    truck: {
      id: "t1", name: "10 roues", truck_type: "10_roues", capacity_tonnes: 15, capacity_m3: null,
      loading_time_minutes: 20, unloading_time_minutes: 10, fixed_time_minutes: 30, company_id: "c1",
    },
    rate: {
      id: "r1", name: "Horaire", rate_mode: "hourly", truck_id: "t1", zone_id: "z1",
      hourly_rate: 120, rate_per_km: 0, rate_per_trip: 0, flat_rate: 0,
      minimum_charge: 0, minimum_hours: 0, distance_from_km: null, distance_to_km: null, company_id: "c1",
    },
    price: {
      id: "pr1", material_id: "m1", supplier_id: "s1", pickup_location_id: "pu1",
      unit: "tonne", selling_price: 20, purchase_price: 12, minimum_quantity: null, is_preferred: true,
    },
    zone: { id: "z1", name: "Québec", distance_surcharge: 0 },
    trips: 4,
    last_trip_tonnes: 15,
    distance_km: 30,
    drive_minutes: 30,
    loading_minutes: 20,
    unloading_minutes: 10,
    fixed_minutes: 30,
    ...over,
  };
}

describe("conversions", () => {
  it("convertit m3 et verges en tonnes selon la densité", () => {
    expect(toTonnes(10, "m3", 1600)).toBeCloseTo(16, 6);
    expect(toTonnes(10, "verge", 1600)).toBeCloseTo(12.2328777, 5);
    expect(toTonnes(10, "tonne", null)).toBe(10);
  });

  it("est réversible tonnes <-> volume", () => {
    expect(fromTonnes(toTonnes(7.5, "m3", 1450), "m3", 1450)).toBeCloseTo(7.5, 9);
  });

  it("refuse une conversion volumétrique sans densité", () => {
    expect(() => toTonnes(10, "m3", null)).toThrow();
    expect(() => fromTonnes(10, "verge", 0)).toThrow();
  });
});

describe("arrondis", () => {
  it("arrondit le temps au pas supérieur", () => {
    expect(roundUpTo(91, 15)).toBe(105);
    expect(roundUpTo(90, 15)).toBe(90);
    expect(roundUpTo(90, 0)).toBe(90);
  });

  it("arrondit l'argent à la décimale configurée", () => {
    expect(roundMoney(10.005, 2)).toBe(10.01);
    expect(roundMoney(1667.4949, 2)).toBe(1667.49);
    expect(roundMoney(1667.4949, 0)).toBe(1667);
  });
});

describe("paramètres administrateur", () => {
  it("échoue explicitement si un paramètre est absent", () => {
    expect(() => resolveSettings({ time_rounding_minutes: "15" })).toThrow(/manquants/);
  });

  it("lit tous les paramètres requis", () => {
    expect(resolveSettings({
      time_rounding_minutes: "15", price_rounding_decimals: "2", margin_percent: "15",
      fuel_surcharge_percent: "0", min_trip_minutes: "30",
    })).toEqual(SETTINGS);
  });
});

describe("calcul du temps", () => {
  it("distingue le premier voyage des suivants et applique l'arrondi", () => {
    const time = calculateTime(makePlan(), SETTINGS);
    expect(time.first_trip.raw_minutes).toBe(90);
    expect(time.next_trip?.raw_minutes).toBe(90);
    expect(time.total_minutes_rounded).toBe(360);
    expect(time.total_hours_billed).toBe(6);
    expect(time.total_distance_km).toBe(210); // 30 km x (4x2 - 1)
  });

  it("applique le plancher de temps par voyage", () => {
    const time = calculateTime(
      makePlan({ trips: 1, drive_minutes: 2, loading_minutes: 2, unloading_minutes: 2, fixed_minutes: 2 }),
      SETTINGS,
    );
    expect(time.first_trip.raw_minutes).toBe(30);
    expect(time.next_trip).toBeNull();
  });

  it("respecte le minimum d'heures du tarif", () => {
    const plan = makePlan({ trips: 1 });
    plan.rate = { ...plan.rate, minimum_hours: 4 };
    expect(calculateTime(plan, SETTINGS).total_hours_billed).toBe(4);
  });
});

describe("coût de transport", () => {
  const time = calculateTime(makePlan(), SETTINGS);

  it("mode horaire", () => {
    expect(calculateTransportCost(makePlan(), time)).toBe(720);
  });

  it("mode au kilomètre", () => {
    const plan = makePlan();
    plan.rate = { ...plan.rate, rate_mode: "per_km", rate_per_km: 3 };
    expect(calculateTransportCost(plan, time)).toBe(630);
  });

  it("mode au voyage", () => {
    const plan = makePlan();
    plan.rate = { ...plan.rate, rate_mode: "per_trip", rate_per_trip: 150 };
    expect(calculateTransportCost(plan, time)).toBe(600);
  });

  it("mode forfaitaire et charge minimale", () => {
    const plan = makePlan();
    plan.rate = { ...plan.rate, rate_mode: "flat", flat_rate: 400, minimum_charge: 500 };
    expect(calculateTransportCost(plan, time)).toBe(500);
  });

  it("rejette un mode inconnu", () => {
    const plan = makePlan();
    plan.rate = { ...plan.rate, rate_mode: "au_pif" };
    expect(() => calculateTransportCost(plan, time)).toThrow(/inconnu/);
  });
});

describe("taxes", () => {
  it("applique TPS 5 % et TVQ 9,975 % sur le même sous-total", () => {
    const { lines, total } = calculateTaxes(1000, TAXES, 2);
    expect(lines.map((l) => l.amount)).toEqual([50, 99.75]);
    expect(total).toBe(149.75);
  });

  it("supporte une taxe composée", () => {
    const { total } = calculateTaxes(1000, [
      { ...TAXES[0], compound: true },
      TAXES[1],
    ], 2);
    expect(total).toBe(154.74); // 50 + 9,975 % de 1050
  });

  it("ne taxe rien si aucune taxe n'est configurée", () => {
    expect(calculateTaxes(1000, [], 2)).toEqual({ lines: [], total: 0 });
  });
});

describe("chiffrage complet", () => {
  it("produit marge, sous-total et total cohérents", () => {
    const { cost } = calculatePlan(makePlan(), SETTINGS, TAXES);
    expect(cost.transport_cost).toBe(720);
    expect(cost.material_cost).toBe(1200); // 60 t x 20 $
    expect(cost.margin_amount).toBe(288); // 15 % de 1920
    expect(cost.subtotal).toBe(2208);
    expect(cost.tax_total).toBe(330.65); // 110.40 + 220.25
    expect(cost.total).toBe(2538.65);
    expect(cost.material_purchase_cost).toBe(720);
  });

  it("n'applique aucune taxe sur un matériau non taxable", () => {
    const plan = makePlan();
    plan.material = { ...plan.material, is_taxable: false };
    const { cost } = calculatePlan(plan, SETTINGS, TAXES);
    expect(cost.tax_total).toBe(0);
    expect(cost.total).toBe(cost.subtotal);
  });

  it("facture au voyage quand le prix est unitaire par voyage", () => {
    const plan = makePlan();
    plan.price = { ...plan.price, unit: "voyage", selling_price: 300, purchase_price: 180 };
    const { cost } = calculatePlan(plan, SETTINGS, TAXES);
    expect(cost.material_billed_quantity).toBe(4);
    expect(cost.material_cost).toBe(1200);
  });

  it("ajoute la surcharge carburant et la surcharge de zone", () => {
    const plan = makePlan();
    plan.zone = { ...plan.zone, distance_surcharge: 80 };
    const { cost } = calculatePlan(plan, { ...SETTINGS, fuel_surcharge_percent: 10 }, TAXES);
    expect(cost.fuel_surcharge).toBe(72);
    expect(cost.zone_surcharge).toBe(80);
    expect(cost.surcharges_total).toBe(152);
    expect(cost.subtotal).toBe(2382.8); // (720+72+80+1200) x 1,15
  });
});
