// ============================================================
// VRAC QUÉBEC OS — DECISION ENGINE
// ------------------------------------------------------------
// Rôle : DÉCIDER. Ne calcule aucun prix.
// Identifie le matériau, le fournisseur, le lieu de chargement,
// le transporteur, le camion, le nombre de voyages et le tarif
// applicable, puis prépare les données pour le Calculation Engine.
//
// Multi-transporteur / multi-fournisseur par construction : aucune
// logique ne dépend d'un transporteur en particulier.
// ============================================================
import {
  type DistanceProvider, type EngineConfig, type MaterialPriceRow, type PickupRow,
  type QuoteInput, type RateRow, type TruckRow, toTonnes,
} from "./core.ts";

/** Une combinaison retenue par le Decision Engine, prête à être chiffrée. */
export interface TransportPlan {
  plan_id: string;
  tonnage: number;
  material: { id: string; name: string; unit: string; density_kg_per_m3: number | null; is_taxable: boolean };
  supplier: { id: string | null; name: string | null };
  pickup: { id: string; name: string; zone_id: string | null; latitude: number; longitude: number };
  carrier: { id: string | null; name: string | null };
  truck: TruckRow;
  rate: RateRow;
  price: MaterialPriceRow;
  zone: { id: string | null; name: string | null; distance_surcharge: number };
  trips: number;
  last_trip_tonnes: number;
  distance_km: number;
  drive_minutes: number;
  loading_minutes: number;
  unloading_minutes: number;
  fixed_minutes: number;
}

export interface DecisionTrace {
  pickups_considered: number;
  pickups_without_route: string[];
  trucks_considered: number;
  plans_built: number;
  rejections: Array<{ reason: string; pickup_id?: string; truck_id?: string }>;
}

export interface DecisionResult {
  plans: TransportPlan[];
  trace: DecisionTrace;
}

/** Meilleure ligne de prix pour une clé donnée : préférée d'abord, puis la moins chère. */
function betterPrice(current: MaterialPriceRow | undefined, next: MaterialPriceRow) {
  if (!current) return next;
  if (next.is_preferred !== current.is_preferred) return next.is_preferred ? next : current;
  return next.selling_price < current.selling_price ? next : current;
}

/** Tarif applicable : camion+zone > camion > zone > générique, filtré par plage de distance. */
export function pickRate(
  rates: RateRow[],
  truck: TruckRow,
  zoneId: string | null,
  distanceKm: number,
  carrierId: string | null,
): RateRow | null {
  const inDistance = (r: RateRow) =>
    (r.distance_from_km == null || distanceKm >= r.distance_from_km) &&
    (r.distance_to_km == null || distanceKm <= r.distance_to_km);

  const pool = rates.filter((r) => inDistance(r) && (!carrierId || !r.company_id || r.company_id === carrierId));
  return (
    pool.find((r) => r.truck_id === truck.id && r.zone_id === zoneId) ??
    pool.find((r) => r.truck_id === truck.id && !r.zone_id) ??
    pool.find((r) => !r.truck_id && r.zone_id === zoneId) ??
    pool.find((r) => !r.truck_id && !r.zone_id) ??
    null
  );
}

export async function decide(
  input: QuoteInput,
  config: EngineConfig,
  distance: DistanceProvider,
): Promise<DecisionResult> {
  const material = config.material;
  const tonnage = toTonnes(input.quantity, input.unit, material.density_kg_per_m3);
  if (!(tonnage > 0)) throw new Error("Quantité invalide.");

  const trace: DecisionTrace = {
    pickups_considered: 0, pickups_without_route: [], trucks_considered: 0,
    plans_built: 0, rejections: [],
  };

  // 1. Prix disponibles pour ce matériau (par lieu de chargement, sinon par fournisseur).
  const priceByPickup = new Map<string, MaterialPriceRow>();
  const priceBySupplier = new Map<string, MaterialPriceRow>();
  for (const p of config.prices) {
    if (p.material_id !== material.id) continue;
    if (p.minimum_quantity != null && tonnage < p.minimum_quantity) continue;
    if (input.supplier_id && p.supplier_id && p.supplier_id !== input.supplier_id) continue;
    if (p.pickup_location_id) priceByPickup.set(p.pickup_location_id, betterPrice(priceByPickup.get(p.pickup_location_id), p));
    else if (p.supplier_id) priceBySupplier.set(p.supplier_id, betterPrice(priceBySupplier.get(p.supplier_id), p));
  }

  const priceFor = (l: PickupRow) =>
    priceByPickup.get(l.id) ?? (l.supplier_id ? priceBySupplier.get(l.supplier_id) : undefined);

  // 2. Lieux de chargement candidats : géolocalisés et offrant le matériau.
  const pickupCandidates = config.pickups.filter((l) => {
    if (input.supplier_id && l.supplier_id !== input.supplier_id) return false;
    if (l.latitude == null || l.longitude == null) return false;
    return Boolean(priceFor(l));
  });
  trace.pickups_considered = pickupCandidates.length;
  if (pickupCandidates.length === 0) {
    throw new Error("Aucun lieu de chargement actif ne fournit ce matériau (prix ou coordonnées manquants).");
  }

  // 3. Camions candidats — tous transporteurs confondus.
  const trucks = config.trucks.filter(
    (t) => t.capacity_tonnes > 0 && (!input.carrier_id || t.company_id === input.carrier_id),
  );
  trace.trucks_considered = trucks.length;
  if (trucks.length === 0) throw new Error("Aucun camion configuré avec une capacité valide.");

  // 4. Distances routières (un seul appel matriciel).
  const matrix = await distance(
    pickupCandidates.map((l) => ({ id: l.id, lat: l.latitude as number, lng: l.longitude as number })),
    input.delivery,
  );

  const supplierName = (id: string | null) => config.suppliers.find((s) => s.id === id)?.name ?? null;
  const carrierName = (id: string | null) => config.carriers.find((c) => c.id === id)?.name ?? null;

  const plans: TransportPlan[] = [];

  for (const pickup of pickupCandidates) {
    const leg = matrix[pickup.id];
    if (!leg) { trace.pickups_without_route.push(pickup.id); continue; }
    const price = priceFor(pickup);
    if (!price) continue;

    const zone = config.zones.find((z) => z.id === pickup.zone_id) ?? null;

    for (const truck of trucks) {
      const rate = pickRate(config.rates, truck, pickup.zone_id, leg.distance_km, truck.company_id);
      if (!rate) {
        trace.rejections.push({ reason: "aucun_tarif_applicable", pickup_id: pickup.id, truck_id: truck.id });
        continue;
      }

      const trips = Math.ceil(tonnage / truck.capacity_tonnes);
      const lastTripTonnes = Number((tonnage - truck.capacity_tonnes * (trips - 1)).toFixed(3));

      plans.push({
        plan_id: `${pickup.id}:${truck.id}:${rate.id}`,
        tonnage: Number(tonnage.toFixed(3)),
        material: {
          id: material.id, name: material.name, unit: material.unit,
          density_kg_per_m3: material.density_kg_per_m3, is_taxable: material.is_taxable,
        },
        supplier: { id: pickup.supplier_id, name: supplierName(pickup.supplier_id) },
        pickup: {
          id: pickup.id, name: pickup.name, zone_id: pickup.zone_id,
          latitude: pickup.latitude as number, longitude: pickup.longitude as number,
        },
        carrier: { id: truck.company_id, name: carrierName(truck.company_id) },
        truck,
        rate,
        price,
        zone: { id: zone?.id ?? null, name: zone?.name ?? null, distance_surcharge: zone?.distance_surcharge ?? 0 },
        trips,
        last_trip_tonnes: lastTripTonnes,
        distance_km: leg.distance_km,
        drive_minutes: leg.duration_minutes,
        loading_minutes: pickup.loading_time_minutes ?? truck.loading_time_minutes ?? 0,
        unloading_minutes: truck.unloading_time_minutes ?? 0,
        fixed_minutes: truck.fixed_time_minutes ?? 0,
      });
    }
  }

  trace.plans_built = plans.length;
  if (plans.length === 0) {
    throw new Error("Aucune combinaison fournisseur / transporteur / tarif applicable pour cette demande.");
  }

  return { plans, trace };
}

/**
 * Décision finale : la combinaison au coût total livré le plus bas.
 * Jamais la distance seule. `score` est fourni par le Calculation Engine,
 * ce qui garde les deux moteurs indépendants.
 */
export function selectBest<T>(scored: T[], score: (item: T) => number): { best: T; ranked: T[] } {
  if (scored.length === 0) throw new Error("Aucune option chiffrable pour cette demande.");
  const ranked = [...scored].sort((a, b) => score(a) - score(b));
  return { best: ranked[0], ranked };
}