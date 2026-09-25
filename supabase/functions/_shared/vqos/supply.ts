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

/** Libellés lisibles des unités de commande. */
export const UNIT_LABELS: Record<string, string> = {
  tonne: "tonnes",
  m3: "mètres cubes (m³)",
  verge: "verges cubes (vg³)",
  voyage: "voyages",
};

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
    unit_price: number;
    price_unit: string;
    billed_quantity: number;
    material_subtotal: number;
    price_id: string | null;
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
    selected_by_client?: boolean;
    recommended_id?: string;
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
export function pickTruck(trucks: TruckRow[], tonnage: number, preferredTruckId?: string | null): TruckRow {
  const usable = trucks
    .filter((t) => Number(t.capacity_tonnes) > 0 && Number((t as { hourly_rate?: number }).hourly_rate ?? 0) > 0)
    .sort((a, b) => Number(a.capacity_tonnes) - Number(b.capacity_tonnes));
  if (usable.length === 0) {
    throw new Error(
      "Aucun camion configuré avec une capacité et un tarif horaire. Complétez la section Camions de la configuration des soumissions.",
    );
  }
  // Choix explicite du client : il prime toujours sur la recommandation.
  if (preferredTruckId) {
    const chosen = usable.find((t) => t.id === preferredTruckId);
    if (chosen) return chosen;
  }
  return usable.find((t) => Number(t.capacity_tonnes) >= tonnage - TONNAGE_EPSILON)
    ?? usable[usable.length - 1];
}

/** Unités de tarif gérées par le moteur. */
export type PriceUnit = "tonne" | "m3" | "verge" | "voyage" | "forfait";
const M3_PER_YD3 = 0.764554857984;
const VOLUME = new Set(["m3", "verge"]);

/**
 * Convertit une quantité vers l'unité du tarif.
 *  - même unité : aucune conversion ;
 *  - m³ ↔ verge³ : conversion de volume pure (aucune densité) ;
 *  - tonne ↔ volume : exige une densité documentée ;
 *  - voyage / forfait : jamais convertis (null).
 */
export function convertQuantity(q: number, from: string, to: string, density: number | null | undefined): number | null {
  if (from === to) return q;
  if (VOLUME.has(from) && VOLUME.has(to)) return from === "m3" ? q / M3_PER_YD3 : q * M3_PER_YD3;
  const d = Number(density ?? 0);
  if (from === "tonne" && VOLUME.has(to)) {
    if (!(d > 0)) return null;
    const m3 = (q * 1000) / d;
    return to === "m3" ? m3 : m3 / M3_PER_YD3;
  }
  if (VOLUME.has(from) && to === "tonne") {
    if (!(d > 0)) return null;
    const m3 = from === "m3" ? q : q * M3_PER_YD3;
    return (m3 * d) / 1000;
  }
  return null;
}

export interface ResolvedTariff {
  unit_price: number;
  price_unit: PriceUnit;
  /** Quantité facturée dans l'unité du tarif (1 pour un forfait). */
  billed_quantity: number;
  price_id: string | null;
}

/**
 * SOURCE UNIQUE DES PRIX — `jsc_material_prices` (price_kind = vente).
 * Tarif admissible : actif, calcul automatique activé, dans sa période,
 * prix saisi (> 0 ou 0 $ confirmé), quantité convertible sans supposition
 * dans l'unité du tarif et couverte par ses paliers.
 * Priorité : préféré, puis carrière assignée, puis `priority`.
 * Égalité non départagée avec des montants différents => traitement manuel.
 */
export function resolveMaterialTariff(
  config: EngineConfig,
  qty: { value: number; unit: string },
  today = new Date().toISOString().slice(0, 10),
): ResolvedTariff {
  const material = config.material;
  const density = material.density_kg_per_m3;
  const assignedPickup = (material as { pickup_location_id?: string | null }).pickup_location_id ?? null;
  const all = (config.prices ?? []).filter((p: any) =>
    p.material_id === material.id && p.is_active !== false && !p.archived_at && (p.price_kind ?? "vente") === "vente");
  const hasPrice = (p: any) => p.selling_price != null && (Number(p.selling_price) > 0 || (Number(p.selling_price) === 0 && p.zero_price_confirmed === true));
  const inPeriod = (p: any) => (!p.valid_from || p.valid_from <= today) && (!p.valid_to || p.valid_to >= today);
  const billed = (p: any): number | null => {
    const u = p.unit ?? "tonne";
    return u === "forfait" ? 1 : convertQuantity(qty.value, qty.unit, u, density);
  };
  const candidates = all.filter((p: any) => hasPrice(p) && p.auto_quote_enabled !== false && inPeriod(p));
  const rows = candidates.filter((p: any) => {
    const b = billed(p);
    if (b == null) return false;
    if ((p.unit ?? "tonne") === "forfait") return true;
    return (p.minimum_quantity == null || b >= Number(p.minimum_quantity) - 1e-9) &&
      (p.max_quantity == null || b <= Number(p.max_quantity) + 1e-9);
  });
  if (rows.length === 0) {
    const expired = all.some((p: any) => hasPrice(p) && p.valid_to && p.valid_to < today);
    const unconvertible = candidates.length > 0 && candidates.every((p: any) => billed(p) == null);
    const massVolume = unconvertible && candidates.some((p: any) =>
      (qty.unit === "tonne" && VOLUME.has(p.unit)) || (VOLUME.has(qty.unit) && (p.unit ?? "tonne") === "tonne"));
    const reason = expired && candidates.length === 0 ? "tarif expiré"
      : massVolume ? "conversion masse-volume impossible sans densité documentée"
      : unconvertible ? `aucun tarif dans une unité compatible avec ${UNIT_LABELS[qty.unit] ?? qty.unit}`
      : candidates.length > 0 ? "quantité hors des paliers du tarif"
      : all.some((p: any) => hasPrice(p)) ? "aucun tarif admissible (calcul automatique désactivé ou période non commencée)"
      : "aucun prix saisi";
    throw new Error(`Soumission à confirmer : ${reason} pour « ${material.name} ».`);
  }
  const tier = (p: any) => (p.is_preferred ? 2 : 0) + (assignedPickup && p.pickup_location_id === assignedPickup ? 1 : 0);
  const best = Math.max(...rows.map(tier));
  let top = rows.filter((p: any) => tier(p) === best);
  const bestPrio = Math.max(...top.map((p: any) => Number(p.priority ?? 0)));
  top = top.filter((p: any) => Number(p.priority ?? 0) === bestPrio);
  const amounts = new Set(top.map((p: any) => Math.round(Number(p.selling_price) * (billed(p) as number) * 100)));
  if (amounts.size > 1) {
    throw new Error(`Soumission à confirmer : plusieurs tarifs admissibles non départagés pour « ${material.name} ».`);
  }
  const p = top[0];
  return {
    unit_price: Number(p.selling_price),
    price_unit: (p.unit ?? "tonne") as PriceUnit,
    billed_quantity: Number((billed(p) as number).toFixed(4)),
    price_id: p.id ?? null,
  };
}

/** Compatibilité : prix unitaire pour une quantité en tonnes. */
export function resolveMaterialPrice(config: EngineConfig, tonnage?: number, today = new Date().toISOString().slice(0, 10)): number {
  return resolveMaterialTariff(config, { value: tonnage ?? 1, unit: "tonne" }, today).unit_price;
}

/**
 * ÉTAPE 3 — Préparation du calcul.
 * Le prix du matériau est d'abord résolu dans l'unité du tarif ; la logistique
 * (tonnage, camion) est une vérification séparée qui exige une masse connue.
 */
export function prepareQuoteContext(input: QuoteInput, config: EngineConfig): PreparedQuoteContext {
  const material = config.material;
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantité invalide.");
  }
  const allowed = (material.allowed_units ?? []).filter(Boolean);
  const requested = input.unit;
  if (allowed.length > 0 && requested !== "voyage" && !allowed.includes(requested)) {
    throw new Error(
      `« ${material.name} » ne peut pas être commandé en ${UNIT_LABELS[requested] ?? requested}. Unités permises : ${
        allowed.map((u) => UNIT_LABELS[u] ?? u).join(", ")
      }.`,
    );
  }
  // 1. Prix du matériau, directement dans l'unité du tarif.
  const tariff = resolveMaterialTariff(config, { value: input.quantity, unit: requested });
  const materialSubtotal = Math.round(tariff.unit_price * tariff.billed_quantity * 100) / 100;

  // 2. Logistique : exige une masse. Un voyage ne devient jamais un tonnage supposé.
  const tonnage = requested === "voyage" ? null : convertQuantity(input.quantity, requested, "tonne", material.density_kg_per_m3);
  if (tonnage == null || !Number.isFinite(tonnage) || tonnage <= 0) {
    throw new Error(
      `Soumission à confirmer : livraison à confirmer — ${
        requested === "voyage" ? "le nombre de voyages ne détermine pas un tonnage" : "densité documentée manquante pour dimensionner le camion"
      }. Sous-total matériau calculable : ${materialSubtotal.toFixed(2)} $ (${tariff.billed_quantity} ${UNIT_LABELS[tariff.price_unit] ?? tariff.price_unit} × ${tariff.unit_price} $).`,
    );
  }

  if (!Number.isFinite(input.delivery?.lat) || !Number.isFinite(input.delivery?.lng)) {
    throw new Error("Adresse de livraison invalide : coordonnées manquantes.");
  }

  const supply = resolveAssignedSupply(config);
  const base = resolveBaseLocation(config);

  const truck = pickTruck(config.trucks, tonnage, input.truck_id ?? null);
  const recommended = pickTruck(config.trucks, tonnage);
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
      price_per_tonne: tariff.price_unit === "tonne" ? tariff.unit_price : Number((materialSubtotal / tonnage).toFixed(4)),
      unit_price: tariff.unit_price,
      price_unit: tariff.price_unit,
      billed_quantity: tariff.billed_quantity,
      material_subtotal: materialSubtotal,
      price_id: tariff.price_id,
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
      selected_by_client: !!input.truck_id && truck.id === input.truck_id,
      recommended_id: recommended.id,
    },
    trips: computeTrips(Number(tonnage.toFixed(3)), capacity),
    prepared_at: new Date().toISOString(),
    module_version: SUPPLY_MODULE_VERSION,
  };
}