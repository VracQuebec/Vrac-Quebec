// ============================================================
// VRAC QUÉBEC — MOTEUR DE CALCUL V1 (source officielle unique)
// ------------------------------------------------------------
// Entrées : matériau, quantité, adresse client.
// Sorties : fournisseur, lieu de chargement, transporteur, camion,
// voyages, temps Google Maps, temps arrondis, coûts, total avant taxes.
//
// RÈGLE ABSOLUE : aucune valeur métier n'est codée ici. Chaque
// constante provient des tables jsc_* (paramètres administrateur).
// Un paramètre manquant produit une erreur explicite, jamais une
// valeur par défaut silencieuse.
// ============================================================

export type Unit = "tonne" | "verge" | "m3" | "voyage";

export interface QuoteInput {
  material_id: string;
  quantity: number;
  unit: Unit;
  /** Adresse de livraison déjà géocodée */
  delivery: { lat: number; lng: number; address?: string };
  /** Restreindre à un transporteur précis (optionnel) */
  carrier_id?: string | null;
}

export interface TripTiming {
  travel_to_delivery_minutes: number;
  travel_return_minutes: number;
  loading_minutes: number;
  unloading_minutes: number;
  fixed_minutes: number;
  raw_minutes: number;
  rounded_minutes: number;
}

export interface QuoteCandidate {
  supplier_id: string | null;
  supplier_name: string | null;
  pickup_location_id: string;
  pickup_location_name: string;
  carrier_id: string | null;
  carrier_name: string | null;
  truck_id: string;
  truck_name: string;
  truck_type: string | null;
  capacity_tonnes: number;
  trips: number;
  last_trip_tonnes: number;
  distance_km: number;
  drive_minutes: number;
  first_trip: TripTiming;
  next_trip: TripTiming | null;
  total_minutes_raw: number;
  total_minutes_rounded: number;
  total_hours_billed: number;
  rate_id: string;
  rate_name: string;
  rate_mode: string;
  transport_cost: number;
  material_unit_price: number;
  material_cost: number;
  zone_surcharge: number;
  fuel_surcharge: number;
  margin_amount: number;
  subtotal_before_tax: number;
  rejected_reason?: string;
}

export interface QuoteResult {
  input: QuoteInput & { tonnage: number };
  material: { id: string; name: string; unit: string; density_kg_per_m3: number | null; is_taxable: boolean };
  selected: QuoteCandidate;
  candidates_evaluated: QuoteCandidate[];
  totals: {
    transport_cost: number;
    material_cost: number;
    surcharges: number;
    margin: number;
    total_before_tax: number;
  };
  settings_used: Record<string, number | string | boolean>;
  computed_at: string;
}

// ---------- Paramètres administrateur ----------

export const REQUIRED_SETTINGS = [
  "time_rounding_minutes",     // arrondi de chaque voyage (ex. 15)
  "price_rounding_decimals",   // décimales du prix final
  "margin_percent",            // marge appliquée au sous-total
  "fuel_surcharge_percent",    // surcharge carburant sur le transport
  "min_trip_minutes",          // durée minimale facturable d'un voyage
] as const;

export type SettingsMap = Record<string, string>;

export function readNumberSetting(settings: SettingsMap, key: string): number {
  const raw = settings[key];
  if (raw === undefined || raw === null || raw === "") {
    throw new Error(`Paramètre administrateur manquant : « ${key} ». Ajoutez-le dans Paramètres de la plateforme.`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Paramètre « ${key} » invalide : ${raw}`);
  return n;
}

export function assertSettings(settings: SettingsMap) {
  const missing = REQUIRED_SETTINGS.filter((k) => settings[k] === undefined || settings[k] === "");
  if (missing.length) {
    throw new Error(`Paramètres administrateur manquants : ${missing.join(", ")}`);
  }
}

// ---------- Conversions ----------

export function toTonnes(quantity: number, unit: Unit, densityKgPerM3: number | null): number {
  if (unit === "tonne") return quantity;
  if (!densityKgPerM3 || densityKgPerM3 <= 0) {
    throw new Error("Densité du matériau requise pour convertir un volume en tonnes.");
  }
  const m3 = unit === "m3" ? quantity : quantity * 0.764554857984; // 1 verge cube = 0.7645549 m³
  return (m3 * densityKgPerM3) / 1000;
}

export function fromTonnes(tonnes: number, unit: Unit, densityKgPerM3: number | null): number {
  if (unit === "tonne") return tonnes;
  if (!densityKgPerM3 || densityKgPerM3 <= 0) throw new Error("Densité du matériau requise.");
  const m3 = (tonnes * 1000) / densityKgPerM3;
  return unit === "m3" ? m3 : m3 / 0.764554857984;
}

export const roundUpTo = (value: number, step: number) =>
  step > 0 ? Math.ceil(value / step) * step : value;

export const roundMoney = (value: number, decimals: number) => {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
};

// ---------- Données de configuration ----------

export interface EngineConfig {
  material: {
    id: string; name: string; unit: string; density_kg_per_m3: number | null; is_taxable: boolean;
    selling_price: number | null; purchase_price: number | null;
  };
  prices: Array<{
    id: string; material_id: string; supplier_id: string | null; pickup_location_id: string | null;
    unit: string; selling_price: number; purchase_price: number; minimum_quantity: number | null; is_preferred: boolean;
  }>;
  pickups: Array<{
    id: string; name: string; supplier_id: string | null; zone_id: string | null;
    latitude: number | null; longitude: number | null; loading_time_minutes: number | null; company_id: string | null;
  }>;
  suppliers: Array<{ id: string; name: string }>;
  carriers: Array<{ id: string; name: string }>;
  trucks: Array<{
    id: string; name: string; truck_type: string | null; capacity_tonnes: number; capacity_m3: number | null;
    loading_time_minutes: number | null; unloading_time_minutes: number | null; fixed_time_minutes: number | null;
    company_id: string | null;
  }>;
  rates: Array<{
    id: string; name: string; rate_mode: string; truck_id: string | null; zone_id: string | null;
    hourly_rate: number; rate_per_km: number; rate_per_trip: number; flat_rate: number;
    minimum_charge: number; minimum_hours: number; distance_from_km: number | null; distance_to_km: number | null;
    company_id: string | null;
  }>;
  zones: Array<{ id: string; name: string; distance_surcharge: number }>;
  settings: SettingsMap;
}

/** Distance/durée routière lieu de chargement -> livraison, par lieu. */
export type DistanceProvider = (
  origins: Array<{ id: string; lat: number; lng: number }>,
  destination: { lat: number; lng: number },
) => Promise<Record<string, { distance_km: number; duration_minutes: number } | null>>;

// ---------- Moteur ----------

export async function computeQuote(
  input: QuoteInput,
  config: EngineConfig,
  distance: DistanceProvider,
): Promise<QuoteResult> {
  assertSettings(config.settings);

  const timeRounding = readNumberSetting(config.settings, "time_rounding_minutes");
  const moneyDecimals = readNumberSetting(config.settings, "price_rounding_decimals");
  const marginPercent = readNumberSetting(config.settings, "margin_percent");
  const fuelPercent = readNumberSetting(config.settings, "fuel_surcharge_percent");
  const minTripMinutes = readNumberSetting(config.settings, "min_trip_minutes");

  const material = config.material;
  const tonnage = toTonnes(input.quantity, input.unit, material.density_kg_per_m3);
  if (tonnage <= 0) throw new Error("Quantité invalide.");

  // 1. Lieux de chargement candidats : ceux qui offrent le matériau, géolocalisés.
  const priceByPickup = new Map<string, EngineConfig["prices"][number]>();
  const priceBySupplier = new Map<string, EngineConfig["prices"][number]>();
  for (const p of config.prices) {
    if (p.material_id !== material.id) continue;
    if (p.pickup_location_id) {
      const cur = priceByPickup.get(p.pickup_location_id);
      if (!cur || (p.is_preferred && !cur.is_preferred) || p.selling_price < cur.selling_price) {
        priceByPickup.set(p.pickup_location_id, p);
      }
    } else if (p.supplier_id) {
      const cur = priceBySupplier.get(p.supplier_id);
      if (!cur || (p.is_preferred && !cur.is_preferred) || p.selling_price < cur.selling_price) {
        priceBySupplier.set(p.supplier_id, p);
      }
    }
  }

  const pickupCandidates = config.pickups.filter((l) => {
    if (l.latitude == null || l.longitude == null) return false;
    const priced = priceByPickup.has(l.id) || (l.supplier_id ? priceBySupplier.has(l.supplier_id) : false);
    return priced;
  });
  if (pickupCandidates.length === 0) {
    throw new Error("Aucun lieu de chargement actif ne fournit ce matériau (prix ou coordonnées manquants).");
  }

  // 2. Distances Google Maps (une seule requête matricielle).
  const matrix = await distance(
    pickupCandidates.map((l) => ({ id: l.id, lat: l.latitude as number, lng: l.longitude as number })),
    input.delivery,
  );

  const trucks = config.trucks.filter(
    (t) => t.capacity_tonnes > 0 && (!input.carrier_id || t.company_id === input.carrier_id),
  );
  if (trucks.length === 0) throw new Error("Aucun camion configuré avec une capacité valide.");

  const supplierName = (id: string | null) => config.suppliers.find((s) => s.id === id)?.name ?? null;
  const carrierName = (id: string | null) => config.carriers.find((c) => c.id === id)?.name ?? null;

  const candidates: QuoteCandidate[] = [];

  for (const pickup of pickupCandidates) {
    const leg = matrix[pickup.id];
    if (!leg) continue;
    const priceRow = priceByPickup.get(pickup.id) ??
      (pickup.supplier_id ? priceBySupplier.get(pickup.supplier_id) : undefined);
    if (!priceRow) continue;

    const zone = config.zones.find((z) => z.id === pickup.zone_id);
    const zoneSurcharge = zone?.distance_surcharge ?? 0;

    for (const truck of trucks) {
      if (input.carrier_id && truck.company_id !== input.carrier_id) continue;

      const trips = Math.ceil(tonnage / truck.capacity_tonnes);
      const lastTripTonnes = Number((tonnage - truck.capacity_tonnes * (trips - 1)).toFixed(3));

      const loading = pickup.loading_time_minutes ?? truck.loading_time_minutes ?? 0;
      const unloading = truck.unloading_time_minutes ?? 0;
      const fixed = truck.fixed_time_minutes ?? 0;
      const drive = leg.duration_minutes;

      const firstRaw = Math.max(fixed + loading + drive + unloading, minTripMinutes);
      const first: TripTiming = {
        travel_to_delivery_minutes: drive,
        travel_return_minutes: 0,
        loading_minutes: loading,
        unloading_minutes: unloading,
        fixed_minutes: fixed,
        raw_minutes: firstRaw,
        rounded_minutes: roundUpTo(firstRaw, timeRounding),
      };

      let next: TripTiming | null = null;
      if (trips > 1) {
        const nextRaw = Math.max(drive + loading + drive + unloading, minTripMinutes);
        next = {
          travel_to_delivery_minutes: drive,
          travel_return_minutes: drive,
          loading_minutes: loading,
          unloading_minutes: unloading,
          fixed_minutes: 0,
          raw_minutes: nextRaw,
          rounded_minutes: roundUpTo(nextRaw, timeRounding),
        };
      }

      const totalRaw = first.raw_minutes + (next ? next.raw_minutes * (trips - 1) : 0);
      const totalRounded = first.rounded_minutes + (next ? next.rounded_minutes * (trips - 1) : 0);
      const totalKm = leg.distance_km * (trips * 2 - 1);

      // 3. Tarif applicable : camion puis zone puis générique, filtré par distance.
      const rate = pickRate(config.rates, truck, pickup.zone_id, leg.distance_km, truck.company_id);
      if (!rate) continue;

      let hoursBilled = totalRounded / 60;
      if (rate.minimum_hours > 0) hoursBilled = Math.max(hoursBilled, rate.minimum_hours);

      let transport = 0;
      switch (rate.rate_mode) {
        case "hourly": transport = hoursBilled * rate.hourly_rate; break;
        case "per_km": transport = totalKm * rate.rate_per_km; break;
        case "per_trip": transport = trips * rate.rate_per_trip; break;
        case "flat": transport = rate.flat_rate; break;
        default: continue;
      }
      if (rate.minimum_charge > 0) transport = Math.max(transport, rate.minimum_charge);

      const fuel = transport * (fuelPercent / 100);

      // 4. Matériau : le prix suit l'unité configurée sur la ligne de prix.
      const priceUnit = (priceRow.unit as Unit) ?? "tonne";
      const billedQty = fromTonnes(tonnage, priceUnit === "voyage" ? "tonne" : priceUnit, material.density_kg_per_m3);
      const materialCost = priceUnit === "voyage"
        ? trips * priceRow.selling_price
        : billedQty * priceRow.selling_price;

      const base = transport + fuel + zoneSurcharge + materialCost;
      const margin = base * (marginPercent / 100);
      const subtotal = base + margin;

      candidates.push({
        supplier_id: pickup.supplier_id,
        supplier_name: supplierName(pickup.supplier_id),
        pickup_location_id: pickup.id,
        pickup_location_name: pickup.name,
        carrier_id: truck.company_id,
        carrier_name: carrierName(truck.company_id),
        truck_id: truck.id,
        truck_name: truck.name,
        truck_type: truck.truck_type,
        capacity_tonnes: truck.capacity_tonnes,
        trips,
        last_trip_tonnes: lastTripTonnes,
        distance_km: leg.distance_km,
        drive_minutes: drive,
        first_trip: first,
        next_trip: next,
        total_minutes_raw: totalRaw,
        total_minutes_rounded: totalRounded,
        total_hours_billed: Number(hoursBilled.toFixed(3)),
        rate_id: rate.id,
        rate_name: rate.name,
        rate_mode: rate.rate_mode,
        transport_cost: roundMoney(transport, moneyDecimals),
        material_unit_price: priceRow.selling_price,
        material_cost: roundMoney(materialCost, moneyDecimals),
        zone_surcharge: roundMoney(zoneSurcharge, moneyDecimals),
        fuel_surcharge: roundMoney(fuel, moneyDecimals),
        margin_amount: roundMoney(margin, moneyDecimals),
        subtotal_before_tax: roundMoney(subtotal, moneyDecimals),
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error("Aucune combinaison fournisseur / transporteur / tarif applicable pour cette demande.");
  }

  // 5. Décision : coût total livré minimal (jamais la distance seule).
  candidates.sort((a, b) => a.subtotal_before_tax - b.subtotal_before_tax);
  const selected = candidates[0];

  return {
    input: { ...input, tonnage: Number(tonnage.toFixed(3)) },
    material: {
      id: material.id, name: material.name, unit: material.unit,
      density_kg_per_m3: material.density_kg_per_m3, is_taxable: material.is_taxable,
    },
    selected,
    candidates_evaluated: candidates,
    totals: {
      transport_cost: selected.transport_cost,
      material_cost: selected.material_cost,
      surcharges: roundMoney(selected.fuel_surcharge + selected.zone_surcharge, moneyDecimals),
      margin: selected.margin_amount,
      total_before_tax: selected.subtotal_before_tax,
    },
    settings_used: {
      time_rounding_minutes: timeRounding,
      price_rounding_decimals: moneyDecimals,
      margin_percent: marginPercent,
      fuel_surcharge_percent: fuelPercent,
      min_trip_minutes: minTripMinutes,
    },
    computed_at: new Date().toISOString(),
  };
}

export function pickRate(
  rates: EngineConfig["rates"],
  truck: EngineConfig["trucks"][number],
  zoneId: string | null,
  distanceKm: number,
  carrierId: string | null,
) {
  const inDistance = (r: EngineConfig["rates"][number]) =>
    (r.distance_from_km == null || distanceKm >= r.distance_from_km) &&
    (r.distance_to_km == null || distanceKm <= r.distance_to_km);

  const pool = rates.filter((r) => inDistance(r) && (!carrierId || !r.company_id || r.company_id === carrierId));
  return (
    pool.find((r) => r.truck_id === truck.id && r.zone_id === zoneId) ??
    pool.find((r) => r.truck_id === truck.id && !r.zone_id) ??
    pool.find((r) => !r.truck_id && r.zone_id === zoneId) ??
    pool.find((r) => !r.truck_id && !r.zone_id) ??
    null
  );
}
