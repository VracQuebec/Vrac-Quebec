// ============================================================
// BESOIN → VOYAGES (comparateur entrepreneur)
// ------------------------------------------------------------
// Aucune donnée métier n'est définie ici : la densité vient de
// l'administration (jsc_materials) et la capacité du camion de
// `jsc_trucks`. On réutilise `tripsFor()` du calculateur existant
// et les facteurs de conversion géométriques déjà en place.
// Une donnée absente n'est jamais remplacée par une valeur inventée.
// ============================================================
import { tripsFor, M3_TO_YD3 } from "@/lib/vrac/calculator";

export type BesoinBasis = "voyages" | "tonnes" | "volume";

export interface BesoinInput {
  quantityValue: string;
  /** Unité telle que saisie dans le parcours : voyages | tonnes | verges | m3. */
  quantityUnit: string;
  /** Densité administrée du matériau (kg/m³) — null si non configurée. */
  densityKgPerM3: number | null;
  /** Capacité administrée du camion choisi (tonnes) — null si inconnue. */
  capacityTonnes: number | null;
}

export interface BesoinResult {
  ok: boolean;
  basis: BesoinBasis | null;
  /** Tonnage total déduit (null si la demande est exprimée en voyages). */
  tonnes: number | null;
  /** Volume total en m³ lorsque la demande est exprimée en volume. */
  m3: number | null;
  trips: number | null;
  /** Ce qu'il manque, en langage utilisateur. */
  missing: string[];
}

const num = (v: string): number | null => {
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const basisForUnit = (unit: string): BesoinBasis | null => {
  const u = (unit || "").toLowerCase();
  if (u === "voyages") return "voyages";
  if (u === "tonnes" || u === "tonne" || u === "t") return "tonnes";
  if (u === "m3" || u === "verges" || u === "verge") return "volume";
  return null;
};

/** Volume saisi → m³ (conversion géométrique uniquement). */
export const volumeToM3 = (value: number, unit: string): number | null => {
  const u = (unit || "").toLowerCase();
  if (u === "m3") return value;
  if (u === "verges" || u === "verge") return value / M3_TO_YD3;
  return null;
};

export function computeBesoin(input: BesoinInput): BesoinResult {
  const missing: string[] = [];
  const value = num(input.quantityValue);
  const basis = basisForUnit(input.quantityUnit);

  if (value == null) missing.push("la quantité");
  if (basis == null) missing.push("l'unité de quantité");
  if (value == null || basis == null) {
    return { ok: false, basis, tonnes: null, m3: null, trips: null, missing };
  }

  if (basis === "voyages") {
    return { ok: true, basis, tonnes: null, m3: null, trips: Math.max(1, Math.ceil(value)), missing };
  }

  let tonnes: number | null = null;
  let m3: number | null = null;

  if (basis === "tonnes") {
    tonnes = value;
  } else {
    m3 = volumeToM3(value, input.quantityUnit);
    if (m3 == null) {
      missing.push("l'unité de quantité");
      return { ok: false, basis, tonnes: null, m3: null, trips: null, missing };
    }
    if (!input.densityKgPerM3 || input.densityKgPerM3 <= 0) {
      missing.push("la densité du matériau (non configurée)");
      return { ok: false, basis, tonnes: null, m3, trips: null, missing };
    }
    tonnes = (m3 * input.densityKgPerM3) / 1000;
  }

  if (!input.capacityTonnes || input.capacityTonnes <= 0) {
    missing.push("la capacité du camion choisi");
    return { ok: false, basis, tonnes, m3, trips: null, missing };
  }

  const trips = tripsFor(tonnes, input.capacityTonnes);
  return { ok: trips != null, basis, tonnes, m3, trips, missing: trips == null ? [...missing, "un calcul de voyages valide"] : missing };
}
