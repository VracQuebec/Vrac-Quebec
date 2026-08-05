// Tests du moteur de calcul UNIQUE (Transport JSC) et de la source
// unique des prix (jsc_material_prices).
import { describe, expect, it } from "vitest";
import {
  resolveJscSettings, roundTime, runCarrierQuote,
} from "../../supabase/functions/_shared/vqos/jsc-engine.ts";
import { resolveMaterialPrice } from "../../supabase/functions/_shared/vqos/supply.ts";
import type { EngineConfig } from "../../supabase/functions/_shared/vqos/core.ts";

const SETTINGS: Record<string, string> = {
  min_trip_minutes: "90",
  loading_time_minutes: "20",
  unloading_time_minutes: "15",
  buffer_time_minutes: "10",
  time_rounding_minutes: "5",
  price_rounding_decimals: "2",
  rounding_method: "superieur_strict",
  base_location_id: "base",
};

function makeConfig(over: Partial<EngineConfig> = {}): EngineConfig {
  return {
    material: {
      id: "m1", name: "Pierre 0-3/4", unit: "tonne",
      density_kg_per_m3: 1600, is_taxable: true, selling_price: 999,
      pickup_location_id: "quarry",
    },
    prices: [
      { id: "p1", material_id: "m1", unit: "tonne", selling_price: 15, is_preferred: true, is_active: true },
      { id: "p2", material_id: "m1", unit: "tonne", selling_price: 40, is_preferred: false, is_active: true },
    ],
    pickups: [
      { id: "base", name: "Logipark", type: "garage", address: null, city: null, postal_code: null, latitude: 46.8, longitude: -71.2, loading_time_minutes: null, supplier_id: null },
      { id: "quarry", name: "Carrière A", type: "carriere", address: null, city: null, postal_code: null, latitude: 46.9, longitude: -71.3, loading_time_minutes: null, supplier_id: "s1" },
    ],
    suppliers: [{ id: "s1", name: "Fournisseur A" }],
    carriers: [],
    trucks: [
      { id: "t10", name: "10 roues", type: "10_roues", capacity_tonnes: 15, hourly_rate: 150 },
      { id: "t12", name: "12 roues", type: "12_roues", capacity_tonnes: 18, hourly_rate: 160 },
    ],
    rates: [],
    zones: [],
    taxes: [
      { id: "tps", name: "TPS", code: "TPS", rate_percent: 5, apply_order: 1, compound: false },
      { id: "tvq", name: "TVQ", code: "TVQ", rate_percent: 9.975, apply_order: 2, compound: false },
    ],
    settings: SETTINGS,
    ...over,
  } as unknown as EngineConfig;
}

// Distances fixes : 10 km / 20 min pour chaque segment.
const distance = async (origins: Array<{ id: string }>) => {
  const out: Record<string, { distance_km: number; duration_minutes: number }> = {};
  origins.forEach((o) => { out[o.id] = { distance_km: 10, duration_minutes: 20 }; });
  return out;
};

const input = { material_id: "m1", quantity: 15, unit: "tonne" as const, delivery: { lat: 46.7, lng: -71.1, address: "1 rue Test" } };

describe("paramètres administrateur", () => {
  it("refuse une configuration sans méthode d'arrondissement", () => {
    expect(() => resolveJscSettings({ ...SETTINGS, rounding_method: "" })).toThrow(/rounding_method/);
  });
  it("lit tous les paramètres depuis l'administration", () => {
    expect(resolveJscSettings(SETTINGS).min_trip_minutes).toBe(90);
  });
});

describe("arrondi du temps", () => {
  it("passe toujours au palier supérieur suivant (méthode JSC)", () => {
    expect(roundTime(15, 5, "superieur_strict")).toBe(20);
    expect(roundTime(23, 5, "superieur_strict")).toBe(25);
    expect(roundTime(58, 5, "superieur_strict")).toBe(60);
  });
  it("supporte les autres méthodes configurables", () => {
    expect(roundTime(23, 15, "superieur")).toBe(30);
    expect(roundTime(23, 15, "inferieur")).toBe(15);
    expect(roundTime(23, 15, "proche")).toBe(30);
  });
});

describe("source unique des prix", () => {
  it("utilise la grille de prix et non la fiche matériau", () => {
    expect(resolveMaterialPrice(makeConfig())).toBe(15);
  });
  it("échoue clairement si aucun prix n'est configuré dans la grille", () => {
    expect(() => resolveMaterialPrice(makeConfig({ prices: [] } as any))).toThrow(/grille de prix/);
  });
});

describe("moteur unique Transport JSC", () => {
  it("produit une soumission complète et cohérente", async () => {
    const r = await runCarrierQuote(input, makeConfig(), distance as any);
    expect(r.engine_version).toMatch(/^jsc-/);
    expect(r.public.trips).toBe(1);
    expect(r.public.truck.capacity_tonnes).toBe(15);
    expect(r.public.material_amount).toBe(225); // 15 t x 15 $ (grille de prix)
    expect(r.public.billable_minutes).toBeGreaterThanOrEqual(90);
    expect(r.public.total).toBeCloseTo(
      r.public.subtotal + r.public.tax_total, 2,
    );
  });

  it("applique le temps minimum facturable", async () => {
    const r = await runCarrierQuote(input, makeConfig(), distance as any);
    // Cycle : 20 + 20 (chargement) + 20 + 15 (déchargement) + 20 + 10 = 105 min
    // arrondi au palier de 5 min supérieur suivant = 110 min (> minimum de 90).
    expect(r.public.billable_minutes).toBe(110);
    expect(r.public.transport_amount).toBeCloseTo(274.95, 2); // 1,833 h x 150 $
  });

  it("calcule plusieurs voyages avec le cycle carrière -> client -> carrière", async () => {
    const r = await runCarrierQuote({ ...input, quantity: 45 }, makeConfig(), distance as any);
    expect(r.public.trips).toBe(3);
    const t = (r.technical.selected as any).time;
    expect(t.billable_next_trip_minutes).toBeLessThanOrEqual(t.billable_first_trip_minutes);
    expect(r.public.billable_minutes).toBe(
      t.billable_first_trip_minutes + t.billable_next_trip_minutes * 2,
    );
  });

  it("applique TPS et TVQ dans l'ordre configuré", async () => {
    const r = await runCarrierQuote(input, makeConfig(), distance as any);
    expect(r.public.taxes.map((t) => t.code)).toEqual(["TPS", "TVQ"]);
    expect(r.public.tax_total).toBeCloseTo(
      r.public.subtotal * 0.05 + r.public.subtotal * 0.09975, 1,
    );
  });

  it("n'applique aucune taxe sur un matériau non taxable", async () => {
    const config = makeConfig();
    (config.material as any).is_taxable = false;
    const r = await runCarrierQuote(input, config, distance as any);
    expect(r.public.tax_total).toBe(0);
    expect(r.public.total).toBe(r.public.subtotal);
  });

  it("refuse un profil transporteur non configuré", () => {
    expect(() => runCarrierQuote(input, makeConfig(), distance as any, "autre")).toThrow(/non configuré/);
  });
});
