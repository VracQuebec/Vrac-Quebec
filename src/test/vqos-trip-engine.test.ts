// Tests du MODULE 3 — moteur de calcul des trajets.
// Aucun calcul financier n'est testé ici : distances, temps
// opérationnels, voyages et structure de sortie uniquement.
import { describe, expect, it } from "vitest";
import type { EngineConfig } from "../../supabase/functions/_shared/vqos/core.ts";
import {
  computeSegments, computeRequiredSegments, RoutingError,
  type RouteProvider, type SegmentRequest,
} from "../../supabase/functions/_shared/vqos/routing/segments.ts";
import {
  resolveOperationalTimes, assertOperationalTimes,
} from "../../supabase/functions/_shared/vqos/routing/operations.ts";
import { planTrips } from "../../supabase/functions/_shared/vqos/routing/trips.ts";
import { resolveCycle, requiredRoles, DEFAULT_CYCLE } from "../../supabase/functions/_shared/vqos/routing/cycle.ts";
import { computeTrips } from "../../supabase/functions/_shared/vqos/routing/index.ts";

const BASE = {
  id: "base-1", name: "Logipark", supplier_id: null, zone_id: null,
  latitude: 46.81, longitude: -71.21, loading_time_minutes: null, company_id: null,
  location_type: "garage", is_base: true, address: "Logipark", city: "Québec", postal_code: null,
};
const PICKUP = {
  id: "pickup-1", name: "Carrière Test", supplier_id: "sup-1", zone_id: null,
  latitude: 46.9, longitude: -71.4, loading_time_minutes: 20, company_id: null,
  location_type: "carriere", is_base: false, address: "Carrière", city: "Québec", postal_code: null,
};

function makeConfig(over: Partial<EngineConfig> = {}): EngineConfig {
  return {
    material: {
      id: "mat-1", name: "Pierre 0-3/4", unit: "tonne", density_kg_per_m3: 1600,
      is_taxable: true, selling_price: 22, purchase_price: 14,
      pickup_location_id: "pickup-1",
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
    rates: [], zones: [], taxes: [],
    settings: {
      base_location_id: "base-1",
      loading_time_minutes: "20",
      unloading_time_minutes: "20",
      buffer_time_minutes: "10",
    },
    ...over,
  };
}

const DISTANCES: Record<string, { distance_km: number; duration_minutes: number }> = {
  base_to_pickup: { distance_km: 18.4, duration_minutes: 22 },
  pickup_to_client: { distance_km: 26.2, duration_minutes: 31 },
  client_to_base: { distance_km: 12.7, duration_minutes: 17 },
  client_to_pickup: { distance_km: 25.9, duration_minutes: 30 },
};

const provider: RouteProvider = async (reqs) =>
  Object.fromEntries(reqs.map((r) => [r.id, DISTANCES[r.id] ?? null]));

const input = {
  material_id: "mat-1", quantity: 30, unit: "tonne" as const,
  delivery: { lat: 46.75, lng: -71.3, address: "100 rue Test, Québec" },
};

describe("étape 1 — segments routiers", () => {
  const reqs: SegmentRequest[] = [{
    id: "base_to_pickup", role: "base_to_pickup",
    origin: { ref: "base", label: "Logipark", lat: 46.81, lng: -71.21 },
    destination: { ref: "pickup", label: "Carrière", lat: 46.9, lng: -71.4 },
  }];

  it("retourne distance, durée et validité", async () => {
    const { segments, failures } = await computeSegments(reqs, provider);
    expect(failures).toHaveLength(0);
    expect(segments[0]).toMatchObject({ distance_km: 18.4, duration_minutes: 22, valid: true });
    expect(segments[0].origin.label).toBe("Logipark");
  });

  it("signale un itinéraire introuvable", async () => {
    const empty: RouteProvider = async () => ({ base_to_pickup: null });
    const { failures } = await computeSegments(reqs, empty);
    expect(failures[0].reason).toContain("Aucun itinéraire");
    await expect(computeRequiredSegments(reqs, empty)).rejects.toBeInstanceOf(RoutingError);
  });

  it("refuse des coordonnées invalides", async () => {
    const bad = [{ ...reqs[0], origin: { ...reqs[0].origin, lat: NaN } }];
    await expect(computeSegments(bad, provider)).rejects.toThrow(/Coordonnées GPS/);
  });
});

describe("étape 2 — temps opérationnels", () => {
  it("lit les paramètres administrateur, sans valeur codée", () => {
    const profile = resolveOperationalTimes({ loading_time_minutes: "20", unloading_time_minutes: "20", buffer_time_minutes: "10" });
    expect(profile.by_key.loading.minutes).toBe(20);
    expect(profile.by_key.waiting.minutes).toBeNull();
    expect(profile.totals.per_trip).toBe(50);
    expect(profile.missing).toHaveLength(0);
  });

  it("privilégie la valeur spécifique de la carrière", () => {
    const profile = resolveOperationalTimes(
      { loading_time_minutes: "20", unloading_time_minutes: "20", buffer_time_minutes: "10" },
      { pickup_loading_time_minutes: 35 },
    );
    expect(profile.by_key.loading).toMatchObject({ minutes: 35, source: "override" });
  });

  it("signale un temps obligatoire manquant", () => {
    const profile = resolveOperationalTimes({ loading_time_minutes: "20" });
    expect(profile.missing).toContain("unloading_time_minutes");
    expect(() => assertOperationalTimes(profile)).toThrow(/Temps opérationnels manquants/);
  });

  it("accepte une composante additionnelle sans modifier le moteur", () => {
    const profile = resolveOperationalTimes(
      { loading_time_minutes: "20", unloading_time_minutes: "20", buffer_time_minutes: "10", waiting_time_minutes: "5", additional_time_minutes: "3" },
    );
    expect(profile.totals.per_trip).toBe(58);
  });
});

describe("étape 3 — nombre de voyages", () => {
  it("arrondit au voyage supérieur", () => {
    expect(planTrips({ tonnage: 30, capacity_tonnes: 18 }).trips).toBe(2);
    expect(planTrips({ tonnage: 18, capacity_tonnes: 18 }).trips).toBe(1);
    expect(planTrips({ tonnage: 54, capacity_tonnes: 18 }).trips).toBe(3);
  });

  it("répartit la quantité, reliquat sur le dernier voyage", () => {
    const plan = planTrips({ tonnage: 30, capacity_tonnes: 18 });
    expect(plan.breakdown.map((b) => b.tonnes)).toEqual([18, 12]);
    expect(plan.last_trip_tonnes).toBe(12);
    expect(plan.breakdown[0].is_first).toBe(true);
  });

  it("refuse une capacité ou quantité invalide", () => {
    expect(() => planTrips({ tonnage: 0, capacity_tonnes: 18 })).toThrow();
    expect(() => planTrips({ tonnage: 10, capacity_tonnes: 0 })).toThrow();
  });
});

describe("cycles de voyage", () => {
  it("utilise le cycle par défaut", () => {
    expect(resolveCycle({})).toEqual(DEFAULT_CYCLE);
    expect(requiredRoles(DEFAULT_CYCLE, 2)).toHaveLength(4);
    expect(requiredRoles(DEFAULT_CYCLE, 1)).toHaveLength(3);
  });

  it("accepte un cycle personnalisé par paramètre", () => {
    const cycle = resolveCycle({ trip_cycle_next: "pickup_to_client,client_to_base" });
    expect(cycle.next_trips).toEqual(["pickup_to_client", "client_to_base"]);
  });

  it("rejette un segment inconnu", () => {
    expect(() => resolveCycle({ trip_cycle_first: "vers_la_lune" })).toThrow(/inconnu/);
  });
});

describe("étape 4 — moteur complet", () => {
  it("assemble segments, voyages et temps sans aucun montant", async () => {
    const result = await computeTrips(input, makeConfig(), provider);

    expect(result.trips.trips).toBe(2);
    expect(Object.keys(result.segments).sort()).toEqual([
      "base_to_pickup", "client_to_base", "client_to_pickup", "pickup_to_client",
    ]);

    // Voyage 1 : garage -> carrière -> client -> garage
    expect(result.legs[0].travel_minutes).toBe(22 + 31 + 17);
    expect(result.legs[0].travel_distance_km).toBeCloseTo(57.3, 2);
    // Temps opérationnels : chargement carrière (20) + déchargement (20) + tampon (10)
    expect(result.legs[0].operational_minutes).toBe(50);
    expect(result.legs[0].raw_minutes).toBe(120);

    // Voyage 2 : carrière -> client -> carrière
    expect(result.legs[1].travel_minutes).toBe(31 + 30);
    expect(result.legs[1].raw_minutes).toBe(111);

    expect(result.totals.raw_minutes).toBe(231);
    expect(result.totals.travel_distance_km).toBeCloseTo(109.2, 2);
    expect(result.financial).toBeNull();
  });

  it("remonte une erreur claire quand un itinéraire est introuvable", async () => {
    const broken: RouteProvider = async (reqs) =>
      Object.fromEntries(reqs.map((r) => [r.id, r.id === "pickup_to_client" ? null : DISTANCES[r.id]]));
    await expect(computeTrips(input, makeConfig(), broken)).rejects.toThrow(/Aucun itinéraire/);
  });

  it("ne calcule qu'un seul voyage sous la capacité", async () => {
    const result = await computeTrips({ ...input, quantity: 12 }, makeConfig(), provider);
    expect(result.trips.trips).toBe(1);
    expect(result.legs).toHaveLength(1);
    expect(result.segments.client_to_pickup).toBeUndefined();
  });
});