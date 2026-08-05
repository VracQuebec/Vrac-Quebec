// ============================================================
// MODULE 3 — COMPOSITION DES CYCLES DE VOYAGE
// ------------------------------------------------------------
// Décrit quels segments routiers composent chaque voyage.
// La composition est déclarative et paramétrable : changer le
// cycle d'un transporteur ne demande aucune modification du moteur.
//
// Aucune règle financière ici (pas d'arrondi, pas de minimum, pas
// de tarif) : uniquement la structure du déplacement.
// ============================================================
import type { SegmentRole } from "./segments.ts";

export const CYCLE_MODULE_VERSION = "cycle-1.0.0";

export interface CycleTemplate {
  id: string;
  label: string;
  /** Segments parcourus lors du premier voyage. */
  first_trip: SegmentRole[];
  /** Segments parcourus lors des voyages suivants. */
  next_trips: SegmentRole[];
}

/**
 * Cycle par défaut de Transport JSC :
 *  - 1er voyage  : garage -> carrière -> client -> garage
 *  - voyages 2+  : carrière -> client -> carrière
 * Modifiable par paramètre administrateur (`trip_cycle_first`,
 * `trip_cycle_next`), sans toucher au code du moteur.
 */
export const DEFAULT_CYCLE: CycleTemplate = {
  id: "base_pickup_client_base",
  label: "Garage → carrière → client → garage, puis carrière → client → carrière",
  first_trip: ["base_to_pickup", "pickup_to_client", "client_to_base"],
  next_trips: ["pickup_to_client", "client_to_pickup"],
};

const ROLES: SegmentRole[] = [
  "base_to_pickup",
  "pickup_to_client",
  "client_to_base",
  "client_to_pickup",
];

function parseRoles(raw: string | undefined, fallback: SegmentRole[]): SegmentRole[] {
  if (!raw || !raw.trim()) return fallback;
  const parsed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const role of parsed) {
    if (!ROLES.includes(role as SegmentRole)) {
      throw new Error(`Segment de cycle inconnu : « ${role} ». Valeurs permises : ${ROLES.join(", ")}.`);
    }
  }
  return parsed as SegmentRole[];
}

/** Cycle effectif : paramètres administrateur si présents, sinon cycle par défaut. */
export function resolveCycle(settings: Record<string, string>): CycleTemplate {
  const first = parseRoles(settings["trip_cycle_first"], DEFAULT_CYCLE.first_trip);
  const next = parseRoles(settings["trip_cycle_next"], DEFAULT_CYCLE.next_trips);
  const custom = settings["trip_cycle_first"] || settings["trip_cycle_next"];
  return custom
    ? { id: "custom", label: "Cycle personnalisé (paramètres administrateur)", first_trip: first, next_trips: next }
    : DEFAULT_CYCLE;
}

/** Ensemble des rôles de segments à calculer pour un cycle donné. */
export function requiredRoles(cycle: CycleTemplate, trips: number): SegmentRole[] {
  const roles = new Set<SegmentRole>(cycle.first_trip);
  if (trips > 1) cycle.next_trips.forEach((r) => roles.add(r));
  return [...roles];
}