// Comparateur : choix des dompes pour lesquelles on demande un itinéraire routier.
// La proximité géographique sert UNIQUEMENT à choisir les candidates les plus
// proches du chantier (jamais affichée, jamais utilisée pour le classement).
// Le classement final repose sur la distance routière réelle retournée par le serveur.

export interface GeoPoint { lat: number; lng: number }
export interface GeoCandidate { id: string; latitude: number | null; longitude: number | null }

export const ROUTING_BATCH_SIZE = 100;
export const ROUTING_MAX_CANDIDATES = 200;

function straightLineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Lots de candidates (les plus proches du chantier d'abord), indépendants de l'ordre de la liste. */
export function routingBatches<T extends GeoCandidate>(
  items: T[],
  origin: GeoPoint,
  maxCandidates = ROUTING_MAX_CANDIDATES,
  batchSize = ROUTING_BATCH_SIZE,
): T[][] {
  const nearest = items
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => ({ d, k: straightLineKm(origin, { lat: d.latitude as number, lng: d.longitude as number }) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, maxCandidates)
    .map((x) => x.d);
  const out: T[][] = [];
  for (let i = 0; i < nearest.length; i += batchSize) out.push(nearest.slice(i, i + batchSize));
  return out;
}

/**
 * Ordre du comparateur : 1) trajet routier connu avant inconnu,
 * 2) compatibilité (score plus bas = plus compatible), 3) distance routière réelle.
 * Une distance inconnue (null) n'est jamais remplacée par une distance à vol d'oiseau.
 */
export function compareRankedDumps(
  a: { distance_km: number | null; fit: number },
  b: { distance_km: number | null; fit: number },
): number {
  const ka = a.distance_km != null ? 0 : 1;
  const kb = b.distance_km != null ? 0 : 1;
  if (ka !== kb) return ka - kb;
  if (a.fit !== b.fit) return a.fit - b.fit;
  if (a.distance_km != null && b.distance_km != null) return a.distance_km - b.distance_km;
  return 0;
}
