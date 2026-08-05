// ============================================================
// MODULE 3 — ÉTAPE 1 : CALCUL DES TRAJETS
// ------------------------------------------------------------
// Couche unique responsable des distances et des temps de route.
// Elle ne connaît ni les prix, ni les règles d'affaires : elle
// reçoit des points géographiques et retourne des segments
// routiers vérifiés (Google Routes API via le fournisseur injecté).
//
// Indépendance : aucun accès réseau direct ici. Le fournisseur de
// routes est injecté (`RouteProvider`), ce qui rend le module
// testable hors ligne et remplaçable (autre cartographe, cache…).
// ============================================================

export const ROUTING_MODULE_VERSION = "routing-1.0.0";

/** Un point géographique nommé utilisé comme origine ou destination. */
export interface GeoPoint {
  /** Identifiant stable (id de carrière, "client", "base"…). */
  ref: string;
  /** Libellé affichable, utile aux messages d'erreur et aux traces. */
  label: string;
  lat: number;
  lng: number;
}

/** Demande de calcul d'un segment entre deux points. */
export interface SegmentRequest {
  /** Identifiant du segment (ex. "base_to_pickup"). */
  id: string;
  /** Rôle logique du segment, utilisé par les modules suivants. */
  role: SegmentRole;
  origin: GeoPoint;
  destination: GeoPoint;
}

export type SegmentRole =
  | "base_to_pickup"
  | "pickup_to_client"
  | "client_to_base"
  | "client_to_pickup"
  | "custom";

/** Résultat routier d'un segment. */
export interface RouteSegment {
  id: string;
  role: SegmentRole;
  origin: GeoPoint;
  destination: GeoPoint;
  distance_km: number;
  duration_minutes: number;
  /** true uniquement si Google a retourné un itinéraire exploitable. */
  valid: true;
  source: string;
}

/** Segment non calculable : conservé pour la traçabilité et les erreurs. */
export interface FailedSegment {
  id: string;
  role: SegmentRole;
  origin: GeoPoint;
  destination: GeoPoint;
  valid: false;
  reason: string;
}

export type SegmentResult = RouteSegment | FailedSegment;

/**
 * Fournisseur de routes point à point.
 * Retourne, pour chaque identifiant de segment, la distance et la durée,
 * ou `null` si aucun itinéraire n'existe.
 */
export type RouteProvider = (
  requests: SegmentRequest[],
) => Promise<Record<string, { distance_km: number; duration_minutes: number } | null>>;

export class RoutingError extends Error {
  constructor(message: string, readonly failures: FailedSegment[]) {
    super(message);
    this.name = "RoutingError";
  }
}

function assertPoint(point: GeoPoint) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    throw new Error(`Coordonnées GPS manquantes ou invalides pour « ${point.label} ».`);
  }
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
    throw new Error(`Coordonnées GPS hors limites pour « ${point.label} ».`);
  }
}

/**
 * Calcule un ensemble de segments et sépare les réussites des échecs.
 * Ne lance pas d'exception : l'appelant décide de la tolérance.
 */
export async function computeSegments(
  requests: SegmentRequest[],
  provider: RouteProvider,
  source = "google_routes_api",
): Promise<{ segments: RouteSegment[]; failures: FailedSegment[] }> {
  for (const r of requests) {
    assertPoint(r.origin);
    assertPoint(r.destination);
  }

  const raw = requests.length ? await provider(requests) : {};
  const segments: RouteSegment[] = [];
  const failures: FailedSegment[] = [];

  for (const r of requests) {
    const leg = raw[r.id];
    if (!leg || !Number.isFinite(leg.distance_km) || !Number.isFinite(leg.duration_minutes)) {
      failures.push({
        id: r.id,
        role: r.role,
        origin: r.origin,
        destination: r.destination,
        valid: false,
        reason: `Aucun itinéraire routier trouvé entre « ${r.origin.label} » et « ${r.destination.label} ».`,
      });
      continue;
    }
    segments.push({
      id: r.id,
      role: r.role,
      origin: r.origin,
      destination: r.destination,
      distance_km: Number(leg.distance_km.toFixed(2)),
      duration_minutes: Math.round(leg.duration_minutes),
      valid: true,
      source,
    });
  }

  return { segments, failures };
}

/** Même calcul, mais toute route manquante devient une erreur explicite. */
export async function computeRequiredSegments(
  requests: SegmentRequest[],
  provider: RouteProvider,
  source?: string,
): Promise<Record<string, RouteSegment>> {
  const { segments, failures } = await computeSegments(requests, provider, source);
  if (failures.length) {
    throw new RoutingError(failures.map((f) => f.reason).join(" "), failures);
  }
  return Object.fromEntries(segments.map((s) => [s.id, s]));
}