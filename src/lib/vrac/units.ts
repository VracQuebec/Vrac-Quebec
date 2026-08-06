// ============================================================
// UNITÉS DE COMMANDE — 100 % administrable
// Les unités permises et les densités vivent dans l'administration
// (jsc_materials). Aucune valeur métier n'est codée ici.
// ============================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OrderUnit = "tonne" | "m3" | "verge";

export const UNIT_OPTIONS: { value: OrderUnit; label: string; short: string }[] = [
  { value: "tonne", label: "Tonnes", short: "t" },
  { value: "m3", label: "Mètres cubes (m³)", short: "m³" },
  { value: "verge", label: "Verges cubes (vg³)", short: "vg³" },
];

export type MaterialUnits = { allowed: OrderUnit[]; hasDensity: boolean };

/** Unités disponibles par matériau (slug), telles que configurées en administration. */
export function useMaterialUnits() {
  const [map, setMap] = useState<Record<string, MaterialUnits>>({});

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("jsc_public_material_units");
      const next: Record<string, MaterialUnits> = {};
      for (const row of (data ?? []) as Array<{ slug: string; allowed_units: string[]; has_density: boolean }>) {
        const allowed = (row.allowed_units ?? []).filter((u): u is OrderUnit =>
          u === "tonne" || u === "m3" || u === "verge"
        );
        const base: OrderUnit[] = allowed.length ? allowed : ["tonne"];
        next[row.slug] = {
          // Une unité de volume n'est offerte que si la densité est configurée.
          allowed: base.filter((u) => u === "tonne" || row.has_density),
          hasDensity: row.has_density === true,
        };
      }
      setMap(next);
    })();
  }, []);

  return map;
}

export function unitsForSlug(map: Record<string, MaterialUnits>, slug: string | null): OrderUnit[] {
  if (!slug) return ["tonne"];
  return map[slug]?.allowed ?? ["tonne"];
}

/**
 * Capacité du camion de référence (administrable). Permet de convertir une
 * demande exprimée « en voyages » vers un tonnage calculable par le moteur.
 */
export function useTruckCapacity() {
  const [capacity, setCapacity] = useState<number | null>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("jsc_public_truck_capacity");
      const value = Number(data);
      setCapacity(Number.isFinite(value) && value > 0 ? value : null);
    })();
  }, []);
  return capacity;
}

/** Camions offerts au client (administrables : jsc_trucks actifs et tarifés). */
export type PublicTruck = { id: string; name: string; truck_type: string | null; capacity_tonnes: number };

export function usePublicTrucks() {
  const [trucks, setTrucks] = useState<PublicTruck[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("jsc_public_trucks");
      const rows = (data ?? []) as Array<{ id: string; name: string; truck_type: string | null; capacity_tonnes: number | string }>;
      setTrucks(
        rows
          .map((r) => ({ ...r, capacity_tonnes: Number(r.capacity_tonnes) }))
          .filter((r) => r.capacity_tonnes > 0)
          .sort((a, b) => a.capacity_tonnes - b.capacity_tonnes),
      );
    })();
  }, []);
  return trucks;
}

/**
 * Camion suggéré (jamais imposé) : le plus petit camion couvrant la quantité,
 * sinon le plus gros disponible (moins de voyages).
 */
export function recommendedTruckId(trucks: PublicTruck[], tonnage: number | null): string | null {
  if (!trucks.length) return null;
  if (!tonnage || !(tonnage > 0)) return trucks[trucks.length - 1].id;
  return (trucks.find((t) => t.capacity_tonnes >= tonnage - 0.001) ?? trucks[trucks.length - 1]).id;
}

export const unitLabel = (unit: OrderUnit) =>
  UNIT_OPTIONS.find((o) => o.value === unit)?.short ?? unit;