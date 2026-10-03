// Lot 5 — arrêts détectés à partir des positions d'une mission.
// Un arrêt est un INDICE à confirmer : il ne prouve jamais un déchargement.
export type Point = { lat: number; lng: number; recorded_at: string };
export type Stop = { lat: number; lng: number; arrived_at: string; left_at: string; minutes: number; points: number };

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function detectStops(points: Point[], radiusM = 100, minMinutes = 5): Stop[] {
  const pts = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const stops: Stop[] = [];
  let i = 0;
  while (i < pts.length) {
    let j = i + 1;
    while (j < pts.length && distanceM(pts[i], pts[j]) <= radiusM) j++;
    const first = pts[i], last = pts[j - 1];
    const minutes = (Date.parse(last.recorded_at) - Date.parse(first.recorded_at)) / 60000;
    if (minutes >= minMinutes) {
      const cluster = pts.slice(i, j);
      stops.push({
        lat: cluster.reduce((s, p) => s + p.lat, 0) / cluster.length,
        lng: cluster.reduce((s, p) => s + p.lng, 0) / cluster.length,
        arrived_at: first.recorded_at, left_at: last.recorded_at, minutes: Math.round(minutes), points: cluster.length,
      });
      i = j;
    } else i++;
  }
  return stops;
}
