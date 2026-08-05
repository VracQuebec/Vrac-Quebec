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
  readNumberSetting, roundMoney,
} from "./core.ts";
import { prepareQuoteContext } from "./supply.ts";

// La sélection du camion vit désormais dans le module d'approvisionnement.
export { pickTruck } from "./supply.ts";

export const JSC_ENGINE_VERSION = "jsc-1.4.0";

/**
 * Paramètres financiers optionnels : s'ils ne sont pas configurés,
 * la charge vaut zéro (aucun impact sur le calcul existant).
 */
function optionalNumber(settings: Record<string, string>, key: string): number {
  const raw = settings[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

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

export type RoundingMethod = "superieur" | "inferieur" | "proche" | "superieur_strict";

export interface JscSettings {
  min_trip_minutes: number;
  loading_time_minutes: number;
  unloading_time_minutes: number;
  buffer_time_minutes: number;
  time_rounding_minutes: number;
  price_rounding_decimals: number;
  rounding_method: RoundingMethod;
  /** Charges financières administrables (0 si non configurées). */
  margin_percent: number;
  administration_fee_amount: number;
  environmental_fee_per_tonne: number;
  fuel_surcharge_percent: number;
  distance_surcharge_per_km: number;
  trip_fee_amount: number;
}

export function resolveJscSettings(settings: Record<string, string>): JscSettings {
  const method = (settings["rounding_method"] ?? "").trim();
  if (!method) {
    throw new Error(
      "Paramètre administrateur manquant : « rounding_method ». Configurez-le dans Configuration des soumissions.",
    );
  }
  if (!["superieur", "inferieur", "proche", "superieur_strict"].includes(method)) {
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
    margin_percent: optionalNumber(settings, "margin_percent"),
    administration_fee_amount: optionalNumber(settings, "administration_fee_amount"),
    environmental_fee_per_tonne: optionalNumber(settings, "environmental_fee_per_tonne"),
    fuel_surcharge_percent: optionalNumber(settings, "fuel_surcharge_percent"),
    distance_surcharge_per_km: optionalNumber(settings, "distance_surcharge_per_km"),
    trip_fee_amount: optionalNumber(settings, "trip_fee_amount"),
  };
}

/** Arrondi du temps selon la méthode configurée par l'administration. */
export function roundTime(minutes: number, step: number, method: RoundingMethod): number {
  if (!(step > 0)) return minutes;
  const ratio = minutes / step;
  // Méthode officielle Transport JSC : toujours au palier supérieur suivant
  // (15 -> 20, 23 -> 25, 28 -> 30, ... 58 -> 60).
  if (method === "superieur_strict") {
    return (Math.floor(minutes / step) + 1) * step;
  }
  const units =
    method === "superieur" ? Math.ceil(ratio)
      : method === "inferieur" ? Math.floor(ratio)
        : Math.round(ratio);
  return Math.max(units, 0) * step;
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
    charges: Array<{ code: string; label: string; amount: number }>;
    charges_total: number;
    margin_amount: number;
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

  // 1-2-3. Module d'approvisionnement : matériau, carrière assignée,
  // garage de départ, tonnage, camion et voyages (aucun montant ici).
  const context = prepareQuoteContext(input, config);
  const material = config.material;
  const unitPrice = context.material.price_per_tonne;
  const tonnage = context.quantity.tonnage;
  const pickup = context.supply;
  const base = context.base;
  const truck = context.truck;
  const capacity = truck.capacity_tonnes;
  const trips = context.trips;

  // 3. Distances et durées routières (Google Maps), cycles Transport JSC :
  //    1er voyage : garage -> carrière -> client -> garage.
  //    voyages suivants : carrière -> client -> carrière.
  const [toPickupMatrix, toClientMatrix, backToBaseMatrix, backToPickupMatrix] = await Promise.all([
    distance([{ id: base.id, lat: base.latitude, lng: base.longitude }], { lat: pickup.latitude, lng: pickup.longitude }),
    distance([{ id: pickup.id, lat: pickup.latitude, lng: pickup.longitude }], { lat: input.delivery.lat, lng: input.delivery.lng }),
    distance([{ id: "client", lat: input.delivery.lat, lng: input.delivery.lng }], { lat: base.latitude, lng: base.longitude }),
    distance([{ id: "client", lat: input.delivery.lat, lng: input.delivery.lng }], { lat: pickup.latitude, lng: pickup.longitude }),
  ]);
  const legBaseToPickup = toPickupMatrix[base.id];
  const leg = toClientMatrix[pickup.id];
  const legClientToBase = backToBaseMatrix["client"];
  const legClientToPickup = backToPickupMatrix["client"];
  if (!legBaseToPickup) {
    throw new Error(`Aucun trajet routier trouvé entre « ${base.name} » et la carrière « ${pickup.name} ».`);
  }
  if (!leg) {
    throw new Error(`Aucun trajet routier trouvé entre la carrière « ${pickup.name} » et l'adresse de livraison.`);
  }
  if (!legClientToBase) {
    throw new Error(`Aucun trajet routier trouvé entre l'adresse de livraison et « ${base.name} ».`);
  }
  if (!legClientToPickup) {
    throw new Error(`Aucun trajet routier trouvé entre l'adresse de livraison et la carrière « ${pickup.name} ».`);
  }

  // 4-5. Temps de déplacement du cycle : garage->carrière, carrière->client, client->garage.
  const travelBaseToPickup = legBaseToPickup.duration_minutes;
  const travelTo = leg.duration_minutes;
  const travelBack = legClientToBase.duration_minutes;
  const travelBackToPickup = legClientToPickup.duration_minutes;

  // 6. Temps fixes ajoutés automatiquement à chaque voyage.
  const loading = pickup.loading_time_minutes ?? s.loading_time_minutes;
  const unloading = s.unloading_time_minutes;
  const buffer = s.buffer_time_minutes;

  // 7-8. Temps par voyage (méthode officielle JSC) :
  //  - 1er voyage  : garage -> carrière -> client -> garage
  //  - voyages 2+  : carrière -> client -> carrière (jamais de retour au garage)
  //  Chaque voyage est arrondi selon la méthode configurée, puis le total
  //  est soumis au temps minimum facturable.
  const rawFirstTripMinutes = travelBaseToPickup + loading + travelTo + unloading + travelBack + buffer;
  const rawNextTripMinutes = loading + travelTo + unloading + travelBackToPickup + buffer;
  const billableFirstTripMinutes = roundTime(rawFirstTripMinutes, s.time_rounding_minutes, s.rounding_method);
  const billableNextTripMinutes = roundTime(rawNextTripMinutes, s.time_rounding_minutes, s.rounding_method);

  const rawTripMinutes = rawFirstTripMinutes;
  const billableTripMinutes = billableFirstTripMinutes;
  const rawTotalMinutes = billableFirstTripMinutes + billableNextTripMinutes * (trips - 1);
  const flooredTripMinutes = Math.max(rawTotalMinutes, s.min_trip_minutes);
  const billableMinutes = flooredTripMinutes;
  const billableHours = Number((billableMinutes / 60).toFixed(3));

  // 11. Coût du matériau.
  const materialAmount = roundMoney(tonnage * unitPrice, decimals);

  // 12. Coût du transport (tarif horaire du camion retenu par la préparation).
  const hourlyRate = truck.hourly_rate;
  const transportAmount = roundMoney(billableHours * hourlyRate, decimals);

  // 12b. Charges et marge administrables (0 si non configurées).
  const roundTripKm = Number(
    (
      legBaseToPickup.distance_km + leg.distance_km + legClientToBase.distance_km +
      (leg.distance_km + legClientToPickup.distance_km) * (trips - 1)
    ).toFixed(2),
  );
  const charges: Array<{ code: string; label: string; amount: number }> = [];
  const addCharge = (code: string, label: string, amount: number) => {
    const value = roundMoney(amount, decimals);
    if (value !== 0) charges.push({ code, label, amount: value });
  };
  addCharge("fuel_surcharge", "Supplément carburant", transportAmount * (s.fuel_surcharge_percent / 100));
  addCharge("distance_surcharge", "Supplément kilométrique", roundTripKm * s.distance_surcharge_per_km);
  addCharge("trip_fee", "Frais par voyage", trips * s.trip_fee_amount);
  addCharge("environmental_fee", "Frais environnementaux", tonnage * s.environmental_fee_per_tonne);
  addCharge("administration_fee", "Frais administratifs", s.administration_fee_amount);
  const chargesTotal = roundMoney(charges.reduce((sum, c) => sum + c.amount, 0), decimals);
  const marginAmount = roundMoney(
    (materialAmount + transportAmount + chargesTotal) * (s.margin_percent / 100),
    decimals,
  );

  // 13-15. Sous-total, taxes, total livré estimé.
  const subtotal = roundMoney(materialAmount + transportAmount + chargesTotal + marginAmount, decimals);
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
        type: truck.type ?? null,
        capacity_tonnes: capacity,
      },
      distance_km: leg.distance_km,
      round_trip_km: roundTripKm,
      material_amount: materialAmount,
      transport_amount: transportAmount,
      charges,
      charges_total: chargesTotal,
      margin_amount: marginAmount,
      subtotal,
      taxes: lines,
      tax_total: taxTotal,
      total,
    },
    technical: {
      selected: {
        carrier_profile: "transport_jsc",
        material: { id: material.id, name: material.name, unit_price: unitPrice, is_taxable: material.is_taxable },
        pickup: {
          id: pickup.id, name: pickup.name, type: pickup.type,
          supplier_id: pickup.supplier_id, supplier_name: pickup.supplier_name,
          address: pickup.address,
        },
        base: { id: base.id, name: base.name, type: base.type, address: base.address },
        truck: { id: truck.id, name: truck.name, capacity_tonnes: capacity, hourly_rate: hourlyRate },
        distance: {
          base_to_pickup_km: legBaseToPickup.distance_km,
          pickup_to_client_km: leg.distance_km,
          client_to_base_km: legClientToBase.distance_km,
          client_to_pickup_km: legClientToPickup.distance_km,
        },
        time: {
          travel_base_to_pickup_minutes: travelBaseToPickup,
          travel_to_minutes: travelTo,
          travel_back_minutes: travelBack,
          travel_back_to_pickup_minutes: travelBackToPickup,
          loading_minutes: loading,
          unloading_minutes: unloading,
          buffer_minutes: buffer,
          raw_first_trip_minutes: rawFirstTripMinutes,
          raw_next_trip_minutes: rawNextTripMinutes,
          billable_first_trip_minutes: billableFirstTripMinutes,
          billable_next_trip_minutes: billableNextTripMinutes,
          raw_trip_minutes: rawTripMinutes,
          raw_total_minutes: rawTotalMinutes,
          floored_trip_minutes: flooredTripMinutes,
          billable_trip_minutes: billableTripMinutes,
          trips,
          billable_minutes: billableMinutes,
          billable_hours: billableHours,
        },
        cost: {
          material_amount: materialAmount, transport_amount: transportAmount,
          charges, charges_total: chargesTotal, margin_amount: marginAmount,
          subtotal, tax_total: taxTotal, total,
        },
      },
      options: config.trucks.map((t) => ({
        id: t.id, name: t.name, capacity_tonnes: t.capacity_tonnes,
        hourly_rate: (t as { hourly_rate?: number }).hourly_rate ?? null,
        trips: Number(t.capacity_tonnes) > 0 ? Math.ceil(tonnage / Number(t.capacity_tonnes)) : null,
        selected: t.id === truck.id,
      })),
      decision_trace: {
        rule_set: "transport_jsc",
        cycle: "1er voyage: garage -> carriere -> client -> garage | voyages suivants: carriere -> client -> carriere",
        minimum_rule: "temps minimum facturable applique au total",
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
