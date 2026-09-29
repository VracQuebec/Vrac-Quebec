// Classement des dompes admissibles (parcours « Demander l'accès »).
// Règles :
//  - Distance : uniquement la distance ROUTIÈRE retournée par le serveur. Aucun
//    plafond. Jamais de repli à vol d'oiseau : sans itinéraire, « Distance à confirmer ».
//  - La sélection manuelle (carte/comparateur) n'influence JAMAIS le classement.

export interface RankInput {
  id: string;
  availability_status: string | null;
  truck_types_allowed: string[] | null;
  accessibility: string[] | null;
}

export type RoadMatrix = Record<string, { distance_km?: number; duration_minutes?: number } | null | undefined>;

export interface Ranked<T> {
  item: T & { distance_km: number | null; duration_minutes: number | null; road_distance: boolean; score: number };
}

export function rankDumps<T extends RankInput>(items: T[], matrix: RoadMatrix) {
  return items
    .map((d) => {
      const mx = matrix[d.id];
      const road = typeof mx?.distance_km === "number" && typeof mx?.duration_minutes === "number";
      const distance_km = road ? (mx!.distance_km as number) : null;
      const duration_minutes = road ? (mx!.duration_minutes as number) : null;
      let score = 0;
      if (distance_km != null) score += Math.max(0, 100 - distance_km); // aucun plafond de distance
      if (d.availability_status === "limited") score += 5;
      else if (d.availability_status !== "unavailable" && d.availability_status !== "owner_closed") score += 10;
      if (d.truck_types_allowed && d.truck_types_allowed.length > 0) score += 3;
      if (d.accessibility && d.accessibility.length > 0) score += 2;
      return { ...d, distance_km, duration_minutes, road_distance: road, score };
    })
    // Distance routière connue d'abord (plus proche en premier), puis distance à confirmer.
    .sort((a, b) => {
      if (a.road_distance !== b.road_distance) return a.road_distance ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return (a.distance_km ?? 0) - (b.distance_km ?? 0);
    });
}

export type DumpRole = "chosen" | "recommended" | "other";

/** Libellé indépendant de la sélection : recommandée = 1er résultat réel du moteur. */
export function dumpRoleLabel(id: string, recommendedId: string | null): string {
  return id === recommendedId ? "Dompe recommandée" : "Autres options";
}
