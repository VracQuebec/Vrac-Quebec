// ============================================================
// VALIDATION DE PRODUCTION — MOTEUR DE SOUMISSION VRAC
// Scénarios réels exécutés avec les paramètres actuellement
// configurés dans Vrac Québec (snapshot jsc_settings).
// ============================================================
import { describe, expect, it } from "vitest";
import { runCarrierQuote } from "../../supabase/functions/_shared/vqos/jsc-engine.ts";
import { computeTrips, pickTruck } from "../../supabase/functions/_shared/vqos/supply.ts";
import type { EngineConfig } from "../../supabase/functions/_shared/vqos/core.ts";

// Paramètres réels (jsc_settings, août 2026)
const SETTINGS: Record<string, string> = {
  min_trip_minutes: "90",
  loading_time_minutes: "10",
  unloading_time_minutes: "10",
  buffer_time_minutes: "0",
  time_rounding_minutes: "5",
  price_rounding_decimals: "2",
  rounding_method: "superieur_strict",
  base_location_id: "logipark",
  margin_percent: "15",
  fuel_surcharge_percent: "0",
  administration_fee_amount: "0",
  environmental_fee_per_tonne: "0",
  distance_surcharge_per_km: "0",
  trip_fee_amount: "0",
  transport_is_taxable: "true",
};

// Flotte réelle active : 10 roues (15 t / 150 $) et 12 roues (18 t / 150 $)
const TRUCKS = [
  { id: "t10", name: "10 roues", truck_type: "10_roues", capacity_tonnes: 15, hourly_rate: 150 },
  { id: "t12", name: "12 roues", truck_type: "12_roues", capacity_tonnes: 18, hourly_rate: 150 },
];

const TAXES = [
  { id: "tps", name: "TPS", code: "TPS", rate_percent: 5, apply_order: 1, compound: false },
  { id: "tvq", name: "TVQ", code: "TVQ", rate_percent: 9.975, apply_order: 2, compound: false },
];

function config(over: Record<string, unknown> = {}): EngineConfig {
  return {
    material: {
      id: "m-pierre", name: "Pierre concassée 0-3/4", unit: "tonne",
      density_kg_per_m3: 1600, is_taxable: true, pickup_location_id: "lagueux",
    },
    prices: [{ id: "px", material_id: "m-pierre", unit: "tonne", selling_price: 15, is_preferred: true, is_active: true }],
    pickups: [
      { id: "logipark", name: "Logipark (garage)", location_type: "garage", is_base: true, latitude: 46.7385, longitude: -71.1935, loading_time_minutes: 0, supplier_id: null },
      { id: "lagueux", name: "1270 route Lagueux", location_type: "carriere", latitude: 46.69, longitude: -71.345, loading_time_minutes: 10, supplier_id: "s1" },
    ],
    suppliers: [{ id: "s1", name: "Carrière Lagueux" }],
    carriers: [], trucks: TRUCKS, rates: [], zones: [], taxes: TAXES, settings: SETTINGS,
    ...over,
  } as unknown as EngineConfig;
}

/** Distances paramétrables par scénario (km / minutes par segment). */
const dist = (km: number, min: number) =>
  (async (origins: Array<{ id: string }>) => {
    const out: Record<string, { distance_km: number; duration_minutes: number }> = {};
    origins.forEach((o) => { out[o.id] = { distance_km: km, duration_minutes: min }; });
    return out;
  }) as any;

const at = (quantity: number, unit: "tonne" | "verge" | "m3" = "tonne") => ({
  material_id: "m-pierre", quantity, unit,
  delivery: { lat: 46.8, lng: -71.25, address: "Québec" },
});

describe("scénarios réels — configuration Vrac Québec", () => {
  it("S1 · petite quantité (5 t, trajet court) applique le minimum de 90 min", async () => {
    const r = await runCarrierQuote(at(5), config(), dist(8, 12));
    expect(r.public.trips).toBe(1);
    expect(r.public.truck.capacity_tonnes).toBe(15);
    // 12+10+12+10+12 = 56 -> palier suivant 60 -> minimum 90
    expect(r.public.billable_minutes).toBe(90);
    expect(r.public.transport_amount).toBeCloseTo(225, 2); // 1,5 h x 150 $
    expect(r.public.material_amount).toBe(75);
    expect(r.public.margin_amount).toBeCloseTo(45, 2);
    expect(r.public.total).toBeCloseTo(r.public.subtotal + r.public.tax_total, 2);
  });

  it("S2 · voyage plein (15 t) reste sur un seul voyage", async () => {
    const r = await runCarrierQuote(at(15), config(), dist(25, 30));
    expect(r.public.trips).toBe(1);
    // 30+10+30+10+30 = 110 -> 115
    expect(r.public.billable_minutes).toBe(115);
  });

  it("S3 · 40 t = 3 voyages, cycle carrière->client->carrière pour 2 et 3", async () => {
    const r = await runCarrierQuote(at(40), config(), dist(25, 30));
    expect(r.public.trips).toBe(3);
    const t = (r.technical.selected as any).time;
    expect(t.billable_first_trip_minutes).toBe(115); // 30+10+30+10+30
    expect(t.billable_next_trip_minutes).toBe(85);   // 10+30+10+30
    expect(r.public.billable_minutes).toBe(115 + 85 * 2);
  });

  it("S4 · adresse éloignée (120 km / 95 min) reste cohérente", async () => {
    const r = await runCarrierQuote(at(30), config(), dist(120, 95));
    expect(r.public.trips).toBe(2);
    expect(r.public.billable_minutes).toBeGreaterThan(400);
    expect(r.public.transport_amount).toBeCloseTo(
      Number((r.public.billable_minutes / 60).toFixed(3)) * 150, 1,
    );
  });

  it("S5 · grande quantité (500 t) : plus gros camion, 28 voyages", async () => {
    const r = await runCarrierQuote(at(500), config(), dist(25, 30));
    // Au-delà de la flotte : le plus gros camion disponible (18 t) est retenu.
    expect(r.public.truck.capacity_tonnes).toBe(18);
    expect(r.public.trips).toBe(28); // ceil(500/18)
    expect(r.public.material_amount).toBe(7500);
  });

  it("S6 · conversion volume exacte ne crée pas de voyage fantôme", async () => {
    // 9,375 m3 x 1600 kg = 15,000000000000002 t (piège du flottant)
    const r = await runCarrierQuote(at(9.375, "m3"), config(), dist(25, 30));
    expect(r.public.tonnage).toBe(15);
    expect(r.public.trips).toBe(1);
  });

  it("S7 · taxes TPS puis TVQ non composées sur le sous-total", async () => {
    const r = await runCarrierQuote(at(15), config(), dist(25, 30));
    const [tps, tvq] = r.public.taxes;
    expect(tps.amount).toBeCloseTo(Number((r.public.subtotal * 0.05).toFixed(2)), 2);
    expect(tvq.amount).toBeCloseTo(Number((r.public.subtotal * 0.09975).toFixed(2)), 2);
    expect(r.public.total).toBeCloseTo(r.public.subtotal + tps.amount + tvq.amount, 2);
  });

  it("S8 · tous les montants sont arrondis à 2 décimales", async () => {
    const r = await runCarrierQuote(at(23.7), config(), dist(37, 41));
    for (const v of [r.public.material_amount, r.public.transport_amount, r.public.margin_amount,
      r.public.subtotal, r.public.tax_total, r.public.total]) {
      expect(Number(v.toFixed(2))).toBe(v);
    }
  });
});

describe("règles de flotte et de voyages", () => {
  it("choisit le plus petit camion couvrant la quantité", () => {
    expect(pickTruck(TRUCKS as any, 12).id).toBe("t10");
    expect(pickTruck(TRUCKS as any, 16).id).toBe("t12");
    expect(pickTruck(TRUCKS as any, 15.0000001).id).toBe("t10");
    expect(pickTruck(TRUCKS as any, 100).id).toBe("t12"); // plus gros disponible
  });
  it("calcule les voyages avec tolérance de 1 kg", () => {
    expect(computeTrips(15, 15)).toBe(1);
    expect(computeTrips(15.0000002, 15)).toBe(1);
    expect(computeTrips(15.5, 15)).toBe(2);
    expect(computeTrips(0.2, 15)).toBe(1);
  });
});

describe("données absentes ou invalides", () => {
  const D = dist(25, 30);
  it("refuse un matériau sans carrière associée", async () => {
    const c = config(); (c.material as any).pickup_location_id = null;
    await expect(runCarrierQuote(at(10), c, D)).rejects.toThrow(/carrière associée/);
  });
  it("refuse une carrière sans coordonnées GPS", async () => {
    const c = config(); (c.pickups[1] as any).latitude = null;
    await expect(runCarrierQuote(at(10), c, D)).rejects.toThrow(/GPS/);
  });
  it("refuse une configuration sans garage de départ", async () => {
    const c = config({ settings: { ...SETTINGS, base_location_id: "" } });
    await expect(runCarrierQuote(at(10), c, D)).rejects.toThrow(/point de départ/);
  });
  it("refuse un prix matériau manquant", async () => {
    const c = config({ prices: [] });
    await expect(runCarrierQuote(at(10), c, D)).rejects.toThrow(/aucun prix saisi/);
  });
  it("refuse une flotte sans tarif horaire", async () => {
    const c = config({ trucks: [{ id: "x", name: "X", capacity_tonnes: 15, hourly_rate: 0 }] });
    await expect(runCarrierQuote(at(10), c, D)).rejects.toThrow(/camion/i);
  });
  it("refuse une quantité invalide", async () => {
    await expect(runCarrierQuote(at(0), config(), D)).rejects.toThrow(/Quantité/);
    await expect(runCarrierQuote(at(Number.NaN), config(), D)).rejects.toThrow(/Quantité/);
  });
  it("refuse une adresse sans coordonnées", async () => {
    const bad = { ...at(10), delivery: { lat: Number.NaN, lng: -71 } } as any;
    await expect(runCarrierQuote(bad, config(), D)).rejects.toThrow(/livraison/);
  });
  it("refuse un volume sans densité configurée", async () => {
    const c = config(); (c.material as any).density_kg_per_m3 = null;
    await expect(runCarrierQuote(at(10, "m3"), c, D)).rejects.toThrow(/[Dd]ensité/);
  });
  it("signale une route introuvable", async () => {
    const none = (async (o: Array<{ id: string }>) => Object.fromEntries(o.map((x) => [x.id, null]))) as any;
    await expect(runCarrierQuote(at(10), config(), none)).rejects.toThrow(/trajet routier/);
  });
});

// ============================================================
// CONVERSIONS D'UNITÉS — tonnes ↔ m³ ↔ verges³
// La densité est administrable par matériau : même quantité réelle
// exprimée dans trois unités => soumission strictement identique.
// ============================================================
const M3_PER_YD3 = 0.764554857984;
const D2 = dist(20, 25);

describe("conversions d'unités (densité administrable)", () => {
  it("20 t = son équivalent en m³ = son équivalent en verges³", async () => {
    const density = 1600; // kg/m³ configuré pour ce matériau
    const m3 = (20 * 1000) / density;
    const yd3 = m3 / M3_PER_YD3;
    const [a, b, c] = await Promise.all([
      runCarrierQuote(at(20), config(), D2),
      runCarrierQuote(at(m3, "m3"), config(), D2),
      runCarrierQuote(at(yd3, "verge"), config(), D2),
    ]);
    expect(b.public.tonnage).toBeCloseTo(a.public.tonnage, 3);
    expect(c.public.tonnage).toBeCloseTo(a.public.tonnage, 3);
    expect(b.public.trips).toBe(a.public.trips);
    expect(c.public.trips).toBe(a.public.trips);
    expect(b.public.total).toBeCloseTo(a.public.total, 2);
    expect(c.public.total).toBeCloseTo(a.public.total, 2);
  });

  it("respecte la densité propre au matériau", async () => {
    const light = config(); (light.material as any).density_kg_per_m3 = 1300;
    const r = await runCarrierQuote(at(10, "m3"), light, D2);
    expect(r.public.tonnage).toBeCloseTo(13, 3);
  });

  it("refuse une unité non permise pour le matériau", async () => {
    const c = config(); (c.material as any).allowed_units = ["tonne"];
    await expect(runCarrierQuote(at(10, "m3"), c, D2)).rejects.toThrow(/ne peut pas être commandé/);
  });
});

describe("balayage des tonnages (aucun voyage fantôme, aucun prix négatif)", () => {
  const SCENARIOS = [5, 10, 12, 15, 16, 18, 20, 25, 40, 60];
  for (const t of SCENARIOS) {
    it(`${t} t — camion, voyages, taxes et total cohérents`, async () => {
      const r = await runCarrierQuote(at(t), config(), D2);
      const capacity = r.public.truck.capacity_tonnes as number;
      expect(r.public.tonnage).toBeCloseTo(t, 3);
      expect(r.public.trips).toBe(Math.max(1, Math.ceil((t - 0.001) / capacity)));
      expect(r.public.trips * capacity).toBeGreaterThanOrEqual(t - 0.001);
      expect((r.public.trips - 1) * capacity).toBeLessThan(t);
      expect(r.public.billable_minutes).toBeGreaterThanOrEqual(90);
      expect(r.public.billable_minutes % 5).toBe(0);
      expect(r.public.material_amount).toBeCloseTo(t * 15, 2);
      expect(r.public.transport_amount).toBeGreaterThan(0);
      expect(r.public.tax_total).toBeCloseTo(
        Number((r.public.subtotal * 0.14975).toFixed(2)), 1,
      );
      expect(r.public.total).toBeCloseTo(r.public.subtotal + r.public.tax_total, 2);
      expect(r.public.total).toBeGreaterThan(0);
    });
  }
});
