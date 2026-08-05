// ============================================================
// MODULE 3 — MOTEUR DE CALCUL DES TRAJETS (Transport JSC)
// ------------------------------------------------------------
// Orchestrateur des étapes 1 à 4 :
//   1. segments routiers réels (Google Routes API)
//   2. temps opérationnels paramétrables
//   3. nombre de voyages
//   4. structure d'accueil du module financier
//
// CE MODULE NE CALCULE AUCUN MONTANT et n'applique aucune règle
// d'affaires financière (pas d'arrondi facturable, pas de minimum,
// pas de tarif, pas de taxe). Il fournit uniquement des faits :
// distances, durées, voyages, temps opérationnels configurés.
// ============================================================
import type { EngineConfig, QuoteInput } from "../core.ts";
import { prepareQuoteContext, type PreparedQuoteContext } from "../supply.ts";
import {
  computeRequiredSegments, type GeoPoint, type RouteProvider, type RouteSegment,
  type SegmentRequest, type SegmentRole, ROUTING_MODULE_VERSION,
} from "./segments.ts";
import {
  resolveOperationalTimes, type OperationalTimeProfile, type TimeComponentDefinition,
} from "./operations.ts";
import { planTrips, type TripPlan } from "./trips.ts";
import { resolveCycle, requiredRoles, type CycleTemplate } from "./cycle.ts";

export * from "./segments.ts";
export * from "./operations.ts";
export * from "./trips.ts";
export * from "./cycle.ts";

export const TRIP_ENGINE_VERSION = "trip-engine-1.0.0";

/** Déroulé d'un voyage : segments parcourus et durées brutes. */
export interface TripLegs {
  index: number;
  is_first: boolean;
  is_last: boolean;
  tonnes: number;
  segments: RouteSegment[];
  travel_minutes: number;
  travel_distance_km: number;
  /** Temps opérationnels applicables à ce voyage (chargement, tampon…). */
  operational_minutes: number;
  /** Durée brute du voyage : route + opérations. Aucun arrondi appliqué. */
  raw_minutes: number;
}

/**
 * Sortie du moteur de trajets. C'est exactement cette structure que
 * consommera le module financier (coûts, temps facturable, minimum,
 * suppléments, taxes, soumission).
 */
export interface TripComputation {
  context: PreparedQuoteContext;
  cycle: CycleTemplate;
  /** Segments calculés, indexés par rôle. */
  segments: Record<string, RouteSegment>;
  trips: TripPlan;
  operations: OperationalTimeProfile;
  legs: TripLegs[];
  totals: {
    trips: number;
    tonnage: number;
    travel_distance_km: number;
    travel_minutes: number;
    operational_minutes: number;
    /** Temps total brut, sans arrondi ni minimum facturable. */
    raw_minutes: number;
  };
  /** Emplacements réservés au module financier — jamais remplis ici. */
  financial: null;
  computed_at: string;
  engine_version: string;
  modules: { routing: string; operations: string; trips: string; cycle: string };
}

function point(ref: string, label: string, lat: number, lng: number): GeoPoint {
  return { ref, label, lat, lng };
}

/** Construit les requêtes de segments à partir du contexte préparé. */
export function buildSegmentRequests(
  context: PreparedQuoteContext,
  roles: SegmentRole[],
): SegmentRequest[] {
  const base = point(context.base.id, context.base.name, context.base.latitude, context.base.longitude);
  const pickup = point(context.supply.id, context.supply.name, context.supply.latitude, context.supply.longitude);
  const client = point("client", context.delivery.address ?? "Adresse de livraison", context.delivery.lat, context.delivery.lng);

  const map: Record<SegmentRole, SegmentRequest | null> = {
    base_to_pickup: { id: "base_to_pickup", role: "base_to_pickup", origin: base, destination: pickup },
    pickup_to_client: { id: "pickup_to_client", role: "pickup_to_client", origin: pickup, destination: client },
    client_to_base: { id: "client_to_base", role: "client_to_base", origin: client, destination: base },
    client_to_pickup: { id: "client_to_pickup", role: "client_to_pickup", origin: client, destination: pickup },
    custom: null,
  };

  return roles.map((role) => map[role]).filter((r): r is SegmentRequest => r !== null);
}

export interface TripEngineOptions {
  /** Permet d'étendre les temps opérationnels sans modifier le moteur. */
  timeComponents?: TimeComponentDefinition[];
}

/**
 * Point d'entrée du module 3.
 * @param input   demande client (matériau, quantité, livraison)
 * @param config  configuration administrateur complète
 * @param routes  fournisseur de routes (Google Routes API en production)
 */
export async function computeTrips(
  input: QuoteInput,
  config: EngineConfig,
  routes: RouteProvider,
  options: TripEngineOptions = {},
): Promise<TripComputation> {
  // Étape 0 — contexte préparé (module 2) : matériau, carrière, garage, camion.
  const context = prepareQuoteContext(input, config);

  // Étape 3 — nombre de voyages (nécessaire pour savoir quels segments calculer).
  const trips = planTrips({
    tonnage: context.quantity.tonnage,
    capacity_tonnes: context.truck.capacity_tonnes,
  });

  // Étape 1 — segments routiers réels.
  const cycle = resolveCycle(config.settings);
  const requests = buildSegmentRequests(context, requiredRoles(cycle, trips.trips));
  const segments = await computeRequiredSegments(requests, routes);

  // Étape 2 — temps opérationnels paramétrables.
  const truckRow = config.trucks.find((t) => t.id === context.truck.id);
  const operations = resolveOperationalTimes(
    config.settings,
    {
      pickup_loading_time_minutes: context.supply.loading_time_minutes,
      truck_loading_time_minutes: truckRow?.loading_time_minutes ?? null,
      truck_unloading_time_minutes: truckRow?.unloading_time_minutes ?? null,
      truck_fixed_time_minutes: truckRow?.fixed_time_minutes ?? null,
    },
    options.timeComponents,
  );

  // Étape 4 — assemblage voyage par voyage (faits uniquement).
  const perTrip = operations.totals.per_trip;
  const firstTripExtra = operations.totals.first_trip_only;

  const legs: TripLegs[] = trips.breakdown.map((trip) => {
    const roles = trip.is_first ? cycle.first_trip : cycle.next_trips;
    const tripSegments = roles.map((r) => segments[r]).filter(Boolean);
    const travelMinutes = tripSegments.reduce((sum, s) => sum + s.duration_minutes, 0);
    const travelKm = Number(tripSegments.reduce((sum, s) => sum + s.distance_km, 0).toFixed(2));
    const operational = perTrip + (trip.is_first ? firstTripExtra : 0);
    return {
      index: trip.index,
      is_first: trip.is_first,
      is_last: trip.is_last,
      tonnes: trip.tonnes,
      segments: tripSegments,
      travel_minutes: travelMinutes,
      travel_distance_km: travelKm,
      operational_minutes: operational,
      raw_minutes: travelMinutes + operational,
    };
  });

  const travelMinutes = legs.reduce((s, l) => s + l.travel_minutes, 0);
  const travelKm = Number(legs.reduce((s, l) => s + l.travel_distance_km, 0).toFixed(2));
  const operationalMinutes = legs.reduce((s, l) => s + l.operational_minutes, 0) + operations.totals.per_quote;

  return {
    context,
    cycle,
    segments,
    trips,
    operations,
    legs,
    totals: {
      trips: trips.trips,
      tonnage: trips.tonnage,
      travel_distance_km: travelKm,
      travel_minutes: travelMinutes,
      operational_minutes: operationalMinutes,
      raw_minutes: travelMinutes + operationalMinutes,
    },
    financial: null,
    computed_at: new Date().toISOString(),
    engine_version: TRIP_ENGINE_VERSION,
    modules: {
      routing: ROUTING_MODULE_VERSION,
      operations: operations.module_version,
      trips: trips.module_version,
      cycle: cycle.id,
    },
  };
}