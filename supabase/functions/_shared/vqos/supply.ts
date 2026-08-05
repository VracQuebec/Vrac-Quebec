// ============================================================
// MODULE 2 — ÉTAPE 1 À 3 : APPROVISIONNEMENT & PRÉPARATION
// ------------------------------------------------------------
// Couche unique qui relie un matériau à son point d'approvisionnement
// assigné, puis prépare toutes les données nécessaires au moteur de
// calcul (distances, temps, coûts — développés au module suivant).
//
// RÈGLES D'AFFAIRES TRANSPORT JSC :
//  - chaque matériau utilise TOUJOURS la carrière qui lui est assignée ;
//  - aucune recherche automatique du fournisseur le moins cher ;
//  - aucune valeur codée : tout provient des tables jsc_* (administration) ;
//  - AUCUN calcul financier dans ce module.
// ============================================================
import type { EngineConfig, PickupRow, QuoteInput, TruckRow } from "./core.ts";
import { toTonnes } from "./core.ts";

export const SUPPLY_MODULE_VERSION = "supply-1.0.0";

/**
 * Tolérance de calcul (1 kg). Les conversions volume -> tonnes produisent des
 * flottants du type 15.000000000000002 : sans tolérance, une quantité qui tient
 * exactement dans un camion déclencherait un second voyage.
 */
export const TONNAGE_EPSILON = 0.001;

/** Nombre de voyages : capacité du camion, avec tolérance de 1 kg. */
export function computeTrips(tonnage: number, capacity: number): number {
  if (!(capacity > 0)) throw new Error("Capacité du camion invalide.");
  return Math.max(1, Math.ceil((tonnage - TONNAGE_EPSILON) / capacity));
}

/** Point d'approvisionnement (carrière, sablière, dépôt) ou garage de départ. */
export interface SupplyPoint {
  id: string;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  loading_time_minutes: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  is_base: boolean;
}

/** Données prêtes pour le moteur de calcul (module suivant). */
export interface PreparedQuoteContext {
  material: {
    id: string;
    name: string;
    unit: string;
    density_kg_per_m3: number | null;
    is_taxable: boolean;
    price_per_tonne: number;
  };
  supply: SupplyPoint;
  base: SupplyPoint;
  delivery: { lat: number; lng: number; address: string | null };
  quantity: { requested: number; unit: string; tonnage: number };
  truck: {
    id: string;
    name: string | null;
    type: string | null;
    capacity_tonnes: number;
    hourly_rate: number;
  };
  trips: number;
  prepared_at: string;
  module_version: string;
}

function toSupplyPoint(row: PickupRow, suppliers: Array<{ id: string; name: string }>): SupplyPoint {
  const r = row as PickupRow & {
    location_type?: string | null; address?: string | null; city?: string | null;
    postal_code?: string | null; is_base?: boolean | null;
  };
  return {
    id: row.id,
    name: row.name,
    type: r.location_type ?? "carriere",
    address: r.address ?? null,
    city: r.city ?? null,
    postal_code: r.postal_code ?? null,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    loading_time_minutes: row.loading_time_minutes ?? null,
    supplier_id: row.supplier_id ?? null,
    supplier_name: suppliers.find((s) => s.id === row.supplier_id)?.name ?? null,
    is_base: r.is_base === true,
  };
}

/**
 * ÉTAPE 2 — Sélection automatique : la carrière assignée au matériau.
 * Jamais de choix « le moins cher », jamais d'intervention manuelle.
 */
export function resolveAssignedSupply(config: EngineConfig): SupplyPoint {
  const material = config.material;
  const pickupId = (material as { pickup_location_id?: string | null }).pickup_location_id ?? null;
  if (!pickupId) {
    throw new Error(
      `Aucune carrière associée à « ${material.name} ». Associez-la dans Configuration des soumissions.`,
    );
  }
  const pickup = config.pickups.find((p) => p.id === pickupId);
  if (!pickup) {
    throw new Error(
      `La carrière associée à « ${material.name} » est introuvable ou inactive. Vérifiez la configuration des soumissions.`,
    );
  }
  if (pickup.latitude == null || pickup.longitude == null) {
    throw new Error(`Coordonnées GPS manquantes pour la carrière « ${pickup.name} ».`);
  }
  return toSupplyPoint(pickup, config.suppliers);
}

/** Point de départ des camions (Logipark / garage) — paramètre administrateur. */
export function resolveBaseLocation(config: EngineConfig): SupplyPoint {
  const baseId = (config.settings["base_location_id"] ?? "").trim();
  if (!baseId) {
    throw new Error(
      "Aucun point de départ configuré (garage). Sélectionnez-le dans Configuration des soumissions › Paramètres généraux.",
    );
  }
  const base = config.pickups.find((p) => p.id === baseId);
  if (!base) {
    throw new Error("Le point de départ configuré est introuvable ou inactif. Vérifiez la configuration des soumissions.");
  }
  if (base.latitude == null || base.longitude == null) {
    throw new Error(`Coordonnées GPS manquantes pour le point de départ « ${base.name} ».`);
  }
  return toSupplyPoint(base, config.suppliers);
}

/**
 * Camion recommandé selon la quantité demandée (règle JSC) :
 * le plus petit camion capable de tout livrer en un voyage ;
 * si la quantité dépasse la flotte, le plus gros camion disponible.
 */
export function pickTruck(trucks: TruckRow[], tonnage: number): TruckRow {
  const usable = trucks
    .filter((t) => Number(t.capacity_tonnes) > 0 && Number((t as { hourly_rate?: number }).hourly_rate ?? 0) > 0)
    .sort((a, b) => Number(a.capacity_tonnes) - Number(b.capacity_tonnes));
  if (usable.length === 0) {
    throw new Error(
      "Aucun camion configuré avec une capacité et un tarif horaire. Complétez la section Camions de la configuration des soumissions.",
    );
  }
  return usable.find((t) => Number(t.capacity_tonnes) >= tonnage - TONNAGE_EPSILON)
    ?? usable[usable.length - 1];
}

/**
 * SOURCE UNIQUE DES PRIX — `jsc_material_prices`.
 * Aucun autre endroit du projet ne fournit un tarif matériau au moteur.
 * Priorité : tarif marqué préféré, puis tarif rattaché à la carrière
 * assignée, puis le premier tarif actif configuré.
 */
export function resolveMaterialPrice(config: EngineConfig): number {
  const material = config.material;
  const assignedPickup = (material as { pickup_location_id?: string | null }).pickup_location_id ?? null;
  const rows = (config.prices ?? []).filter((p: any) =>
    p.material_id === material.id && Number(p.selling_price) > 0
  );
  const chosen =
    rows.find((p: any) => p.is_preferred) ??
    rows.find((p: any) => assignedPickup && p.pickup_location_id === assignedPickup) ??
    rows[0];
  const price = Number(chosen?.selling_price ?? 0);
  if (!(price > 0)) {
    throw new Error(
      `Aucun prix à la tonne configuré pour « ${material.name} » dans la grille de prix. Ajoutez-le dans Configuration des soumissions › Matériaux.`,
    );
  }
  return price;
}

/**
 * ÉTAPE 3 — Préparation du calcul.
 * Rassemble : départ (Logipark), carrière assignée, adresse client,
 * quantité convertie en tonnes, camion et capacité. Aucun montant.
 */
export function prepareQuoteContext(input: QuoteInput, config: EngineConfig): PreparedQuoteContext {
  const material = config.material;
  const unitPrice = resolveMaterialPrice(config);
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantité invalide.");
  }
  const tonnage = toTonnes(input.quantity, input.unit, material.density_kg_per_m3);
  if (!Number.isFinite(tonnage) || tonnage <= 0) throw new Error("Quantité invalide.");

  if (!Number.isFinite(input.delivery?.lat) || !Number.isFinite(input.delivery?.lng)) {
    throw new Error("Adresse de livraison invalide : coordonnées manquantes.");
  }

  const supply = resolveAssignedSupply(config);
  const base = resolveBaseLocation(config);

  const truck = pickTruck(config.trucks, tonnage);
  const capacity = Number(truck.capacity_tonnes);
  const hourlyRate = Number((truck as { hourly_rate?: number }).hourly_rate ?? 0);
  if (!(hourlyRate > 0)) {
    throw new Error(
      `Tarif horaire manquant pour le camion « ${truck.name} ». Ajoutez-le dans Configuration des soumissions › Camions.`,
    );
  }

  return {
    material: {
      id: material.id,
      name: material.name,
      unit: material.unit,
      density_kg_per_m3: material.density_kg_per_m3,
      is_taxable: material.is_taxable,
      price_per_tonne: unitPrice,
    },
    supply,
    base,
    delivery: {
      lat: input.delivery.lat,
      lng: input.delivery.lng,
      address: input.delivery.address ?? null,
    },
    quantity: {
      requested: input.quantity,
      unit: input.unit,
      tonnage: Number(tonnage.toFixed(3)),
    },
    truck: {
      id: truck.id,
      name: truck.name ?? null,
      type: truck.truck_type ?? null,
      capacity_tonnes: capacity,
      hourly_rate: hourlyRate,
    },
    trips: computeTrips(Number(tonnage.toFixed(3)), capacity),
    prepared_at: new Date().toISOString(),
    module_version: SUPPLY_MODULE_VERSION,
  };
}