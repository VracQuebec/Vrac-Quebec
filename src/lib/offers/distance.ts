// ============================================================
// LOT 20 — DISTANCE GÉOGRAPHIQUE (déterministe, configurable)
// ------------------------------------------------------------
// `geographicDistance` (vol d'oiseau) est strictement distincte de
// `routeDistance` (distance routière, non disponible dans ce lot).
// Règle du LOT 18 conservée : la distance n'est JAMAIS un critère de
// compatibilité matière; elle ne bloque que si un rayon maximal a été
// réellement exprimé.
// ============================================================

export interface GeoPoint { latitude: number | null; longitude: number | null }

export type DistanceBand =
  | "excellent_distance" | "good_distance" | "acceptable_distance" | "far" | "very_far";

export const DISTANCE_BAND_LABELS: Record<DistanceBand, string> = {
  excellent_distance: "Distance excellente",
  good_distance: "Bonne distance",
  acceptable_distance: "Distance acceptable",
  far: "Éloigné",
  very_far: "Très éloigné",
};

/** Seuils configurables — aucune constante dispersée ailleurs dans le code. */
export interface DistanceThresholds {
  excellentKm: number;
  goodKm: number;
  acceptableKm: number;
  farKm: number;
}

export const DEFAULT_DISTANCE_THRESHOLDS: DistanceThresholds = {
  excellentKm: 15,
  goodKm: 35,
  acceptableKm: 60,
  farKm: 120,
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau (Haversine). `null` si une coordonnée manque. */
export function geographicDistance(a: GeoPoint, b: GeoPoint): number | null {
  if (a?.latitude == null || a?.longitude == null || b?.latitude == null || b?.longitude == null) return null;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(km * 10) / 10;
}

/** Distance routière : non disponible dans ce lot (jamais estimée en secret). */
export function routeDistance(): null {
  return null;
}

export function classifyDistance(
  km: number | null,
  thresholds: DistanceThresholds = DEFAULT_DISTANCE_THRESHOLDS,
): DistanceBand | null {
  if (km == null) return null;
  if (km <= thresholds.excellentKm) return "excellent_distance";
  if (km <= thresholds.goodKm) return "good_distance";
  if (km <= thresholds.acceptableKm) return "acceptable_distance";
  if (km <= thresholds.farKm) return "far";
  return "very_far";
}

/**
 * Rayon maximal : contrainte dure UNIQUEMENT si un rayon a été réellement
 * exprimé. Aucun rayon n'est jamais inventé.
 */
export function exceedsExplicitRadius(km: number | null, maxRadiusKm: number | null | undefined): boolean {
  if (km == null || maxRadiusKm == null) return false;
  return km > maxRadiusKm;
}
