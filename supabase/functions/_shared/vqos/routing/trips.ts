// ============================================================
// MODULE 3 — ÉTAPE 3 : NOMBRE DE VOYAGES
// ------------------------------------------------------------
// Détermine combien de voyages sont nécessaires et comment la
// quantité se répartit entre eux. Aucun coût, aucun tarif.
// ============================================================

export const TRIPS_MODULE_VERSION = "trips-1.0.0";

export interface TripPlanInput {
  /** Quantité totale à livrer, en tonnes. */
  tonnage: number;
  /** Capacité utile du camion retenu, en tonnes. */
  capacity_tonnes: number;
}

export interface TripBreakdown {
  index: number;
  /** true pour le premier voyage : certains temps ne s'appliquent qu'à lui. */
  is_first: boolean;
  is_last: boolean;
  tonnes: number;
  /** Taux de remplissage du camion (0 à 1). */
  load_ratio: number;
}

export interface TripPlan {
  tonnage: number;
  capacity_tonnes: number;
  /** Nombre de voyages requis (toujours ≥ 1). */
  trips: number;
  full_trips: number;
  last_trip_tonnes: number;
  breakdown: TripBreakdown[];
  module_version: string;
}

/**
 * Nombre de voyages = quantité / capacité, arrondi au voyage supérieur.
 * Le dernier voyage porte le reliquat.
 */
export function planTrips({ tonnage, capacity_tonnes }: TripPlanInput): TripPlan {
  if (!Number.isFinite(tonnage) || tonnage <= 0) {
    throw new Error("Quantité invalide : impossible de déterminer le nombre de voyages.");
  }
  if (!Number.isFinite(capacity_tonnes) || capacity_tonnes <= 0) {
    throw new Error("Capacité du camion invalide : impossible de déterminer le nombre de voyages.");
  }

  const trips = Math.max(1, Math.ceil(Number((tonnage / capacity_tonnes).toFixed(6))));
  const fullTrips = Math.max(0, trips - 1);
  const lastTripTonnes = Number((tonnage - fullTrips * capacity_tonnes).toFixed(3));

  const breakdown: TripBreakdown[] = Array.from({ length: trips }, (_, i) => {
    const isLast = i === trips - 1;
    const tonnes = isLast ? lastTripTonnes : capacity_tonnes;
    return {
      index: i + 1,
      is_first: i === 0,
      is_last: isLast,
      tonnes,
      load_ratio: Number((tonnes / capacity_tonnes).toFixed(4)),
    };
  });

  return {
    tonnage: Number(tonnage.toFixed(3)),
    capacity_tonnes,
    trips,
    full_trips: fullTrips,
    last_trip_tonnes: lastTripTonnes,
    breakdown,
    module_version: TRIPS_MODULE_VERSION,
  };
}