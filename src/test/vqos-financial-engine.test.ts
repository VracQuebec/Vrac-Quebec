// Tests du MODULE 4 — moteur financier Transport JSC.
// Vérifie : temps facturable, coût matériau, coût transport,
// suppléments/frais paramétrables, marge, taxes, total et
// transparence des explications. Aucune valeur codée en dur
// dans le moteur : tous les paramètres viennent des settings.
import { describe, expect, it } from "vitest";
import type { EngineConfig, TaxRow } from "../../supabase/functions/_shared/vqos/core.ts";
import type { RouteProvider } from "../../supabase/functions/_shared/vqos/routing/segments.ts";
import { computeTrips } from "../../supabase/functions/_shared/vqos/routing/index.ts";
import {
  computeFinancials, computeBillableTime, computeTaxes, resolveFinancialSettings,
  computeCharges,
} from "../../supabase/functions/_shared/vqos/financial/index.ts";

const TAXES: TaxRow[] = [
  { id: "tps", name: "TPS", code: "TPS", rate_percent: 5, apply_order: 1, compound: false },
  { id: "tvq", name: "TVQ", code: "TVQ", rate_percent: 9.975, apply_order: 2, compound: false },
];

const BASE = {
  id: "base-1", name: "Logipark", supplier_id: null, zone_id: null,
  latitude: 46.81, longitude: -71.21, loading_time_minutes: null, company_id: null,
  location_type: "garage", is_base: true, address: null, city: null, postal_code: null,
};
const PICKUP = {
  id: "pickup-1", name: "Carrière Test", supplier_id: "sup-1", zone_id: null,
  latitude: 46.9, longitude: -71.4, loading_time_minutes: 20, company_id: null,
  location_type: "carriere", is_base: false, address: null, city: null, postal_code: null,
};

const SETTINGS: Record<string, string> = {
  base_location_id: "base-1",
  loading_time_minutes: "20",
  unloading_time_minutes: "20",
  buffer_time_minutes: "0",
  time_rounding_minutes: "5",
  min_billable_minutes: "90",
  price_rounding_decimals: "2",
  margin_percent: "0",
  fuel_surcharge_percent: "0",
  currency: "CAD",
};

function makeConfig(over: Partial<EngineConfig> = {}, settings: Record<string, string> = {}): EngineConfig {
  return {
    material: {
      id: "mat-1", name: "Pierre 0-3/4", unit: "tonne", density_kg_per_m3: 1600,
      is_taxable: true, selling_price: 18, purchase_price: 12, pickup_location_id: "pickup-1",
    } as EngineConfig["material"],
    prices: [],
    pickups: [BASE, PICKUP] as unknown as EngineConfig["pickups"],
    suppliers: [{ id: "sup-1", name: "Fournisseur Test" }],
    carriers: [],
    trucks: [{
      id: "truck-12", name: "12 roues", truck_type: "12_roues", capacity_tonnes: 18,
      capacity_m3: null, loading_time_minutes: null, unloading_time_minutes: null,
      fixed_time_minutes: null, company_id: null, hourly_rate: 150,
    }] as unknown as EngineConfig["trucks"],
    rates: [], zones: [], taxes: TAXES,
    settings: { ...SETTINGS, ...settings },
    ...over,
  };
}

const DISTANCES: Record<string, { distance_km: number; duration_minutes: number }> = {
  base_to_pickup: { distance_km: 18.4, duration_minutes: 20 },
  pickup_to_client: { distance_km: 26.2, duration_minutes: 30 },
  client_to_base: { distance_km: 12.7, duration_minutes: 15 },
  client_to_pickup: { distance_km: 25.9, duration_minutes: 30 },
};
const provider: RouteProvider = async (reqs) =>
  Object.fromEntries(reqs.map((r) => [r.id, DISTANCES[r.id] ?? null]));

const input = (quantity: number) => ({
  material_id: "mat-1", quantity, unit: "tonne" as const,
  delivery: { lat: 46.75, lng: -71.3, address: "100 rue Test, Québec" },
});

async function run(quantity: number, settings: Record<string, string> = {}, config?: EngineConfig) {
  const cfg = config ?? makeConfig({}, settings);
  const trips = await computeTrips(input(quantity), cfg, provider);
  return { trips, financial: computeFinancials(trips, cfg.taxes, cfg.settings) };
}

describe("paramètres financiers", () => {
  it("échoue explicitement si un paramètre requis est absent", () => {
    expect(() => resolveFinancialSettings({ time_rounding_minutes: "5" })).toThrow(/manquants/);
  });

  it("lit les paramètres et garde la trace de leur provenance", () => {
    const s = resolveFinancialSettings(SETTINGS);
    expect(s.min_billable_minutes).toBe(90);
    expect(s.resolved.find((r) => r.key === "margin_percent")?.source).toBe("settings");
    expect(s.resolved.find((r) => r.key === "min_order_amount")?.source).toBe("missing");
  });
});

describe("temps facturable", () => {
  it("arrondit au pas configuré puis applique le minimum facturable", async () => {
    const { trips, financial } = await run(15);
    // 1 voyage : 20 + 30 + 15 min de route + 40 min d'opérations = 105 min
    expect(trips.totals.raw_minutes).toBe(105);
    expect(financial.time.rounded_minutes).toBe(105);
    expect(financial.time.minimum_applied).toBe(false);
    expect(financial.time.billable_hours).toBe(1.75);
  });

  it("applique le minimum facturable sur une très courte livraison", () => {
    const time = computeBillableTime(
      { totals: { raw_minutes: 42, travel_minutes: 22, operational_minutes: 20, trips: 1 } } as never,
      resolveFinancialSettings(SETTINGS),
    );
    expect(time.billable_minutes).toBe(90);
    expect(time.minimum_applied).toBe(true);
  });
});

describe("coût du matériau et du transport", () => {
  it("matériau = quantité × prix/tonne, transport = heures × taux horaire", async () => {
    const { financial } = await run(15);
    expect(financial.material.amount).toBe(270); // 15 t × 18 $
    expect(financial.material.supplier_name).toBe("Fournisseur Test");
    expect(financial.transport.amount).toBe(262.5); // 1,75 h × 150 $
    expect(financial.transport.trips).toBe(1);
  });

  it("tient compte de la capacité du camion pour le nombre de voyages", async () => {
    const { trips, financial } = await run(30);
    expect(trips.totals.trips).toBe(2);
    expect(financial.transport.capacity_tonnes).toBe(18);
    expect(financial.material.amount).toBe(540);
  });
});

describe("suppléments et frais fixes paramétrables", () => {
  it("ne facture rien lorsqu'aucun supplément n'est configuré", async () => {
    const { financial } = await run(15);
    expect(financial.totals.surcharges_total).toBe(0);
    expect(financial.totals.fixed_fees_total).toBe(0);
  });

  it("applique carburant (%), frais par voyage et frais fixes", async () => {
    const { financial } = await run(15, {
      fuel_surcharge_percent: "10",
      trip_fee_amount: "25",
      administration_fee_amount: "50",
    });
    expect(financial.totals.surcharges_total).toBe(26.25); // 10 % de 262,50
    expect(financial.totals.fixed_fees_total).toBe(75); // 25 × 1 voyage + 50
  });

  it("supporte une nouvelle règle sans modifier le moteur", () => {
    const { charges, total } = computeCharges(
      { eco_fee_per_tonne: "2" },
      { transport_amount: 100, material_amount: 100, trips: 2, distance_km: 50, tonnage: 15 },
      [{ key: "eco", label: "Éco-frais", setting_key: "eco_fee_per_tonne", basis: "fixed_per_tonne", kind: "fixed_fee" }],
    );
    expect(charges[0].amount).toBe(30);
    expect(total).toBe(30);
  });
});

describe("marge, taxes et total", () => {
  it("applique la marge sur transport + matériau + suppléments", async () => {
    const { financial } = await run(15, { margin_percent: "15" });
    expect(financial.totals.base_amount).toBe(532.5);
    expect(financial.totals.margin_amount).toBe(79.88);
    expect(financial.totals.subtotal).toBe(612.38);
  });

  it("applique TPS et TVQ sur le sous-total", async () => {
    const { financial } = await run(15);
    expect(financial.totals.subtotal).toBe(532.5);
    expect(financial.totals.taxes.map((t) => t.amount)).toEqual([26.63, 53.12]);
    expect(financial.totals.total).toBe(612.25);
  });

  it("exclut un matériau non taxable de la base taxable", async () => {
    const config = makeConfig();
    config.material = { ...config.material, is_taxable: false };
    const { financial } = await run(15, {}, config);
    expect(financial.totals.taxable_base).toBe(262.5); // transport seulement
  });

  it("respecte le montant minimum de commande", async () => {
    const { financial } = await run(15, { min_order_amount: "800" });
    expect(financial.totals.minimum_order_adjustment).toBe(267.5);
    expect(financial.totals.subtotal).toBe(800);
  });

  it("gère l'absence totale de taxes configurées", () => {
    expect(computeTaxes(1000, [], 2)).toEqual({ lines: [], total: 0 });
  });
});

describe("transparence", () => {
  it("explique chaque ligne du calcul", async () => {
    const { financial } = await run(15, { margin_percent: "15", fuel_surcharge_percent: "10" });
    const keys = financial.explanation.map((l) => l.key);
    expect(keys).toEqual(["material", "transport", "fuel", "margin", "subtotal", "TPS", "TVQ", "total"]);
    expect(financial.explanation[0].detail).toContain("18,00 $/t");
    expect(financial.explanation[1].detail).toContain("150,00 $/h");
    expect(financial.explanation.at(-1)).toMatchObject({ type: "total", amount: financial.totals.total });
  });

  it("retourne un objet complet, sans PDF ni courriel", async () => {
    const { financial } = await run(15);
    expect(Object.keys(financial)).toEqual([
      "currency", "settings", "time", "material", "transport", "charges",
      "totals", "explanation", "engine_version", "modules", "computed_at",
    ]);
  });
});
