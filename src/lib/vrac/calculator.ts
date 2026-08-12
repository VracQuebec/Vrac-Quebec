// ============================================================
// Calculateur de matériaux — conversions génériques uniquement.
// Les densités et les capacités de camion proviennent de
// l'administration (jsc_materials / jsc_trucks) : rien en dur ici.
// ============================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Facteurs de conversion purement géométriques (aucune donnée métier). */
export const FT_TO_M = 0.3048;
export const IN_TO_M = 0.0254;
export const CM_TO_M = 0.01;
export const M3_TO_FT3 = 35.3146667;
export const M3_TO_YD3 = 1.30795062;

export type LengthUnit = "pi" | "m";
export type DepthUnit = "po" | "pi" | "cm" | "m";

export const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
  { value: "pi", label: "pieds" },
  { value: "m", label: "mètres" },
];

export const DEPTH_UNITS: { value: DepthUnit; label: string }[] = [
  { value: "po", label: "pouces" },
  { value: "pi", label: "pieds" },
  { value: "cm", label: "cm" },
  { value: "m", label: "mètres" },
];

export const toMeters = (value: number, unit: LengthUnit | DepthUnit) =>
  unit === "m" ? value : unit === "pi" ? value * FT_TO_M : unit === "po" ? value * IN_TO_M : value * CM_TO_M;

/** Garde-fou : dimension plausible d'un chantier (mètres). Aucune règle métier. */
export const MAX_DIMENSION_M = 10_000;

/** Valeur numérique saisie valide : finie, strictement positive, non absurde. */
export const isValidDimension = (value: number, unit: LengthUnit | DepthUnit) =>
  Number.isFinite(value) && value > 0 && toMeters(value, unit) <= MAX_DIMENSION_M;

/**
 * Nombre de voyages : toujours l'entier supérieur.
 * `capacityTonnes` provient exclusivement de l'administration (jsc_trucks).
 * Epsilon pour éviter qu'une quantité exactement égale à la capacité
 * (18.0000000001 en virgule flottante) ne crée un voyage de trop.
 */
export const TONNAGE_EPSILON = 1e-6;

export const tripsFor = (tonnes: number, capacityTonnes: number): number | null => {
  if (!Number.isFinite(tonnes) || tonnes <= 0) return null;
  if (!Number.isFinite(capacityTonnes) || capacityTonnes <= 0) return null;
  return Math.max(1, Math.ceil((tonnes - TONNAGE_EPSILON) / capacityTonnes));
};

export type CalcMaterial = {
  slug: string;
  name: string;
  density_kg_per_m3: number;
  allowed_units: string[];
};

/** Matériaux publics disposant d'une densité configurée en administration. */
export function useCalcMaterials() {
  const [materials, setMaterials] = useState<CalcMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("jsc_public_materials_calc" as never);
      const rows = (data ?? []) as Array<{
        slug: string; name: string; density_kg_per_m3: number | string; allowed_units: string[] | null;
      }>;
      setMaterials(
        rows
          .map((r) => ({
            slug: r.slug,
            name: r.name,
            density_kg_per_m3: Number(r.density_kg_per_m3),
            allowed_units: r.allowed_units ?? ["tonne"],
          }))
          .filter((r) => Number.isFinite(r.density_kg_per_m3) && r.density_kg_per_m3 > 0),
      );
      setLoading(false);
    })();
  }, []);

  return { materials, loading };
}

export type VolumeResult = {
  m3: number;
  ft3: number;
  yd3: number;
  tonnes: number | null;
};

/** Volume d'une surface rectangulaire × épaisseur, puis tonnage selon la densité admin. */
export function computeVolume(
  length: number, lengthUnit: LengthUnit,
  width: number, widthUnit: LengthUnit,
  depth: number, depthUnit: DepthUnit,
  densityKgPerM3: number | null,
): VolumeResult | null {
  if (!isValidDimension(length, lengthUnit)) return null;
  if (!isValidDimension(width, widthUnit)) return null;
  if (!isValidDimension(depth, depthUnit)) return null;
  const m3 = toMeters(length, lengthUnit) * toMeters(width, widthUnit) * toMeters(depth, depthUnit);
  if (!Number.isFinite(m3) || m3 <= 0) return null;
  return {
    m3,
    ft3: m3 * M3_TO_FT3,
    yd3: m3 * M3_TO_YD3,
    tonnes: densityKgPerM3 && densityKgPerM3 > 0 ? (m3 * densityKgPerM3) / 1000 : null,
  };
}

export const roundTo = (value: number, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export const fmt = (value: number, decimals = 1) =>
  new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(
    roundTo(value, decimals),
  );