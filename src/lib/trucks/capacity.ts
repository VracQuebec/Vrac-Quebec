// ============================================================
// CAPACITÉS DE CAMION — LECTURE SEULE, 100 % PARAMÉTRABLE
// ------------------------------------------------------------
// Aucune capacité n'est codée en dur. Les valeurs de référence
// proviennent exclusivement de l'administration (`jsc_trucks`,
// colonnes capacity_tonnes / capacity_m3). Une capacité absente
// reste `null` : rien n'est inventé.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { TruckTypeKey } from "./catalog";

export interface TruckCapacity {
  truckType: TruckTypeKey | string;
  /** Capacité de référence en tonnes (null si non paramétrée). */
  tonnes: number | null;
  /** Capacité de référence en m³ (null si non paramétrée). */
  m3: number | null;
  /** Nombre de véhicules actifs ayant servi au calcul. */
  sample: number;
}

/**
 * Capacités de référence par type de camion, moyennées sur les
 * véhicules actifs configurés par l'administration.
 */
export async function loadTruckCapacities(): Promise<Record<string, TruckCapacity>> {
  const { data, error } = await supabase
    .from("jsc_trucks")
    .select("truck_type, capacity_tonnes, capacity_m3")
    .eq("is_active", true)
    .is("archived_at", null);
  if (error || !data) return {};

  const acc: Record<string, { t: number[]; m: number[] }> = {};
  data.forEach((row) => {
    const key = row.truck_type as string | null;
    if (!key) return;
    acc[key] ??= { t: [], m: [] };
    if (row.capacity_tonnes != null) acc[key].t.push(Number(row.capacity_tonnes));
    if (row.capacity_m3 != null) acc[key].m.push(Number(row.capacity_m3));
  });

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

  return Object.fromEntries(
    Object.entries(acc).map(([key, v]) => [
      key,
      { truckType: key, tonnes: avg(v.t), m3: avg(v.m), sample: Math.max(v.t.length, v.m.length) },
    ]),
  );
}
