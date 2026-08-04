// ============================================================
// MOTEUR DE SOUMISSION — TRANSPORT JSC
// ------------------------------------------------------------
// Reproduit exactement la méthode de soumission utilisée
// quotidiennement par Transport JSC (voir docs/moteur-jsc.md).
//
// RÈGLE ABSOLUE : aucune valeur métier codée ici. Matériaux, prix,
// carrières, camions, tarifs horaires, taxes, temps et arrondis
// proviennent du module « Configuration des soumissions ».
//
// Évolutivité : le moteur est isolé derrière `runCarrierQuote`, ce
// qui permettra plus tard de brancher d'autres transporteurs. Pour
// l'instant, un seul profil existe : Transport JSC.
// ============================================================
import {
  type DistanceProvider, type EngineConfig, type QuoteInput, type TaxRow,
  type TruckRow, readNumberSetting, roundMoney, toTonnes,
} from "./core.ts";

export const JSC_ENGINE_VERSION = "jsc-1.1.0";

/** Paramètres administrateur exigés par le moteur JSC. */
export const JSC_REQUIRED_SETTINGS = [
  "min_trip_minutes",
  "loading_time_minutes",
  "unloading_time_minutes",
  "buffer_time_minutes",
  "time_rounding_minutes",
  "rounding_method",
  "price_rounding_decimals",
  "base_location_id",
] as const;

export type RoundingMethod = "superieur" | "inferieur" | "proche";

export interface JscSettings {
  min_trip_minutes: number;
  loading_time_minutes: number;
  unloading_time_minutes: number;
  buffer_time_minutes: number;
  time_rounding_minutes: number;
  price_rounding_decimals: number;
  rounding_method: RoundingMethod;
}

export function resolveJscSettings(settings: Record<string, string>): JscSettings {
  const method = (settings["rounding_method"] ?? "").trim();
  if (!method) {
    throw new Error(
      "Paramètre administrateur manquant : « rounding_method ». Configurez-le dans Configuration des soumissions.",
    );
  }
  if (!["superieur", "inferieur", "proche"].includes(method)) {
    throw new Error(`Méthode d'arrondissement inconnue : ${method}`);
  }
  return {
    min_trip_minutes: readNumberSetting(settings, "min_trip_minutes"),
    loading_time_minutes: readNumberSetting(settings, "loading_time_minutes"),
    unloading_time_minutes: readNumberSetting(settings, "unloading_time_minutes"),
    buffer_time_minutes: readNumberSetting(settings, "buffer_time_minutes"),
    time_rounding_minutes: readNumberSetting(settings, "time_rounding_minutes"),
    price_rounding_decimals: readNumberSetting(settings, "price_rounding_decimals"),
    rounding_method: method as RoundingMethod,
  };
}

/** Arrondi du temps selon la méthode configurée par l'administration. */
export function roundTime(minutes: number, step: number, method: RoundingMethod): number {
  if (!(step > 0)) return minutes;
  const ratio = minutes / step;
  const units =
    method === "superieur" ? Math.ceil(ratio)
      : method === "inferieur" ? Math.floor(ratio)
        : Math.round(ratio);
  return Math.max(units, 0) * step;
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
  return usable.find((t) => Number(t.capacity_tonnes) >= tonnage) ?? usable[usable.length - 1];
}

/** Taxes configurées, dans l'ordre, avec support des taxes composées. */
function applyTaxes(base: number, taxes: TaxRow[], decimals: number) {
  const ordered = [...taxes].sort((a, b) => (a.apply_order ?? 0) - (b.apply_order ?? 0));
  const lines: Array<{ name: string; code: string | null; rate_percent: number; amount: number }> = [];
  let running = base;
  let total = 0;
  for (const t of ordered) {
    const amount = roundMoney(running * (Number(t.rate_percent) / 100), decimals);
    lines.push({ name: t.name, code: t.code, rate_percent: Number(t.rate_percent), amount });
    total += amount;
    if (t.compound) running += amount;
  }
  return { lines, total: roundMoney(total, decimals) };
}

export interface JscQuoteResult {
  public: {
    material: { id: string; name: string };
    quantity: number;
    unit: string;
    tonnage: number;
    trips: number;
    estimated_duration_minutes: number;
    billable_minutes: number;
    billable_hours: number;
    delivery_address: string | null;
    pickup: { name: string | null };
    base: { name: string | null };
    truck: { name: string | null; type: string | null; capacity_tonnes: number | null };
    distance_km: number;
    round_trip_km: number;
    material_amount: number;
    transport_amount: number;
    subtotal: number;
    taxes: Array<{ name: string; code: string | null; rate_percent: number; amount: number }>;
    tax_total: number;
    total: number;
  };
  technical: {
    selected: Record<string, unknown>;
    options: Record<string, unknown>[];
    decision_trace: Record<string, unknown>;
    settings_used: Record<string, number | string>;
  };
  computed_at: string;
  engine_version: string;
}

/**
 * Soumission Transport JSC — ordre de calcul officiel :
 * matériau -> carrière -> distance -> temps aller/retour -> chargement,
 * déchargement, tampon -> temps total -> minimum facturable -> camion ->
 * voyages -> matériau -> transport -> sous-total -> taxes -> total.
 */
export async function runJscQuote(
  input: QuoteInput,
  config: EngineConfig,
  distance: DistanceProvider,
): Promise<JscQuoteResult> {
  const s = resolveJscSettings(config.settings);
  const decimals = s.price_rounding_decimals;

  // 1. Matériau choisi.
  const material = config.material;
  const unitPrice = Number(material.selling_price ?? 0);
  if (!(unitPrice > 0)) {
    throw new Error(
      `Aucun prix à la tonne configuré pour « ${material.name} ». Ajoutez-le dans Configuration des soumissions.`,
    );
  }
  const tonnage = toTonnes(input.quantity, input.unit, material.density_kg_per_m3);
  if (!(tonnage > 0)) throw new Error("Quantité invalide.");

  // 2. Carrière associée au matériau.
  const pickupId = (material as { pickup_location_id?: string | null }).pickup_location_id ?? null;
  const pickup = config.pickups.find((p) => p.id === pickupId);
  if (!pickup) {
    throw new Error(
      `Aucune carrière associée à « ${material.name} ». Associez-la dans Configuration des soumissions.`,
    );
  }
  if (pickup.latitude == null || pickup.longitude == null) {
    throw new Error(`Coordonnées GPS manquantes pour la carrière « ${pickup.name} ».`);
  }

  // 2b. Point de départ des camions (garage / Logipark) — configuré en administration.
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

  // 3. Distances et durées routières (Google Maps), cycle Transport JSC :
  //    garage -> carrière -> client -> garage.
  const [toPickupMatrix, toClientMatrix, backToBaseMatrix] = await Promise.all([
    distance([{ id: base.id, lat: base.latitude, lng: base.longitude }], { lat: pickup.latitude, lng: pickup.longitude }),
    distance([{ id: pickup.id, lat: pickup.latitude, lng: pickup.longitude }], { lat: input.delivery.lat, lng: input.delivery.lng }),
    distance([{ id: "client", lat: input.delivery.lat, lng: input.delivery.lng }], { lat: base.latitude, lng: base.longitude }),
  ]);
  const legBaseToPickup = toPickupMatrix[base.id];
  const leg = toClientMatrix[pickup.id];
  const legClientToBase = backToBaseMatrix["client"];
  if (!legBaseToPickup) {
    throw new Error(`Aucun trajet routier trouvé entre « ${base.name} » et la carrière « ${pickup.name} ».`);
  }
  if (!leg) {
    throw new Error(`Aucun trajet routier trouvé entre la carrière « ${pickup.name} » et l'adresse de livraison.`);
  }
  if (!legClientToBase) {
    throw new Error(`Aucun trajet routier trouvé entre l'adresse de livraison et « ${base.name} ».`);
  }

  // 4-5. Temps de déplacement du cycle : garage->carrière, carrière->client, client->garage.
  const travelBaseToPickup = legBaseToPickup.duration_minutes;
  const travelTo = leg.duration_minutes;
  const travelBack = legClientToBase.duration_minutes;

  // 6. Temps fixes ajoutés automatiquement à chaque voyage.
  const loading = pickup.loading_time_minutes ?? s.loading_time_minutes;
  const unloading = s.unloading_time_minutes;
  const buffer = s.buffer_time_minutes;

  // 7-8. Temps par voyage, plancher facturable, puis arrondi administrable.
  const rawTripMinutes = travelBaseToPickup + loading + travelTo + unloading + travelBack + buffer;
  const flooredTripMinutes = Math.max(rawTripMinutes, s.min_trip_minutes);
  const billableTripMinutes = roundTime(flooredTripMinutes, s.time_rounding_minutes, s.rounding_method);

  // 9-10. Camion recommandé et nombre de voyages (toujours au supérieur).
  const truck = pickTruck(config.trucks, tonnage);
  const capacity = Number(truck.capacity_tonnes);
  const trips = Math.max(1, Math.ceil(tonnage / capacity));

  const billableMinutes = billableTripMinutes * trips;
  const billableHours = Number((billableMinutes / 60).toFixed(3));

  // 11. Coût du matériau.
  const materialAmount = roundMoney(tonnage * unitPrice, decimals);

  // 12. Coût du transport (tarif horaire du camion retenu).
  const hourlyRate = Number((truck as { hourly_rate?: number }).hourly_rate ?? 0);
  if (!(hourlyRate > 0)) {
    throw new Error(
      `Tarif horaire manquant pour le camion « ${truck.name} ». Ajoutez-le dans Configuration des soumissions › Camions.`,
    );
  }
  const transportAmount = roundMoney(billableHours * hourlyRate, decimals);

  // 13-15. Sous-total, taxes, total livré estimé.
  const subtotal = roundMoney(materialAmount + transportAmount, decimals);
  const applicable = material.is_taxable ? config.taxes : [];
  const { lines, total: taxTotal } = applyTaxes(subtotal, applicable, decimals);
  const total = roundMoney(subtotal + taxTotal, decimals);

  return {
    public: {
      material: { id: material.id, name: material.name },
      quantity: input.quantity,
      unit: input.unit,
      tonnage: Number(tonnage.toFixed(3)),
      trips,
      estimated_duration_minutes: billableMinutes,
      billable_minutes: billableMinutes,
      billable_hours: billableHours,
      delivery_address: input.delivery.address ?? null,
      pickup: { name: pickup.name },
      base: { name: base.name },
      truck: {
        name: truck.name ?? null,
        type: truck.truck_type ?? null,
        capacity_tonnes: capacity,
      },
      distance_km: leg.distance_km,
      round_trip_km: Number(
        ((legBaseToPickup.distance_km + leg.distance_km + legClientToBase.distance_km) * trips).toFixed(2),
      ),
      material_amount: materialAmount,
      transport_amount: transportAmount,
      subtotal,
      taxes: lines,
      tax_total: taxTotal,
      total,
    },
    technical: {
      selected: {
        carrier_profile: "transport_jsc",
        material: { id: material.id, name: material.name, unit_price: unitPrice, is_taxable: material.is_taxable },
        pickup: { id: pickup.id, name: pickup.name },
        base: { id: base.id, name: base.name },
        truck: { id: truck.id, name: truck.name, capacity_tonnes: capacity, hourly_rate: hourlyRate },
        time: {
          travel_base_to_pickup_minutes: travelBaseToPickup,
          travel_to_minutes: travelTo,
          travel_back_minutes: travelBack,
          loading_minutes: loading,
          unloading_minutes: unloading,
          buffer_minutes: buffer,
          raw_trip_minutes: rawTripMinutes,
          floored_trip_minutes: flooredTripMinutes,
          billable_trip_minutes: billableTripMinutes,
          trips,
          billable_minutes: billableMinutes,
          billable_hours: billableHours,
        },
        cost: { material_amount: materialAmount, transport_amount: transportAmount, subtotal, tax_total: taxTotal, total },
      },
      options: config.trucks.map((t) => ({
        id: t.id, name: t.name, capacity_tonnes: t.capacity_tonnes,
        hourly_rate: (t as { hourly_rate?: number }).hourly_rate ?? null,
        trips: Number(t.capacity_tonnes) > 0 ? Math.ceil(tonnage / Number(t.capacity_tonnes)) : null,
        selected: t.id === truck.id,
      })),
      decision_trace: {
        rule_set: "transport_jsc",
        cycle: "garage -> carriere -> client -> garage",
        pickup_source: "materiau.carriere_associee",
        base_source: "parametres.base_location_id",
        truck_rule: "plus_petit_camion_couvrant_la_quantite",
        distance_source: "google_maps_routes",
      },
      settings_used: { ...s },
    },
    computed_at: new Date().toISOString(),
    engine_version: JSC_ENGINE_VERSION,
  };
}

/**
 * Point d'entrée multi-transporteur (évolutivité).
 * Un seul profil est actif aujourd'hui : Transport JSC.
 */
export function runCarrierQuote(
  input: QuoteInput,
  config: EngineConfig,
  distance: DistanceProvider,
  carrierProfile: string = "transport_jsc",
): Promise<JscQuoteResult> {
  if (carrierProfile !== "transport_jsc") {
    throw new Error(`Profil transporteur non configuré : ${carrierProfile}`);
  }
  return runJscQuote(input, config, distance);
}
