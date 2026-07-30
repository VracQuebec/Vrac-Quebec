// ============================================================
// VRAC QUÉBEC OS — NOYAU PARTAGÉ
// Types, conversions, arrondis et lecture des paramètres admin.
// RÈGLE ABSOLUE : aucune valeur métier codée en dur. Tout provient
// des tables jsc_* (paramètres administrateur). Paramètre manquant
// => erreur explicite, jamais de valeur par défaut silencieuse.
// ============================================================

export type Unit = "tonne" | "verge" | "m3" | "voyage";

export const M3_PER_CUBIC_YARD = 0.764554857984;

export interface DeliveryPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface QuoteInput {
  material_id: string;
  quantity: number;
  unit: Unit;
  delivery: DeliveryPoint;
  /** Restreindre à un transporteur précis (optionnel, usage interne) */
  carrier_id?: string | null;
  /** Restreindre à un fournisseur précis (optionnel, usage interne) */
  supplier_id?: string | null;
}

export type SettingsMap = Record<string, string>;

/** Paramètres administrateur exigés par les moteurs. */
export const REQUIRED_SETTINGS = [
  "time_rounding_minutes",
  "price_rounding_decimals",
  "margin_percent",
  "fuel_surcharge_percent",
  "min_trip_minutes",
] as const;

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
  if (missing.length) throw new Error(`Paramètres administrateur manquants : ${missing.join(", ")}`);
}

export interface EngineSettings {
  time_rounding_minutes: number;
  price_rounding_decimals: number;
  margin_percent: number;
  fuel_surcharge_percent: number;
  min_trip_minutes: number;
}

export function resolveSettings(settings: SettingsMap): EngineSettings {
  assertSettings(settings);
  return {
    time_rounding_minutes: readNumberSetting(settings, "time_rounding_minutes"),
    price_rounding_decimals: readNumberSetting(settings, "price_rounding_decimals"),
    margin_percent: readNumberSetting(settings, "margin_percent"),
    fuel_surcharge_percent: readNumberSetting(settings, "fuel_surcharge_percent"),
    min_trip_minutes: readNumberSetting(settings, "min_trip_minutes"),
  };
}

// ---------- Conversions ----------

export function toTonnes(quantity: number, unit: Unit, densityKgPerM3: number | null): number {
  if (unit === "tonne" || unit === "voyage") return quantity;
  if (!densityKgPerM3 || densityKgPerM3 <= 0) {
    throw new Error("Densité du matériau requise pour convertir un volume en tonnes.");
  }
  const m3 = unit === "m3" ? quantity : quantity * M3_PER_CUBIC_YARD;
  return (m3 * densityKgPerM3) / 1000;
}

export function fromTonnes(tonnes: number, unit: Unit, densityKgPerM3: number | null): number {
  if (unit === "tonne" || unit === "voyage") return tonnes;
  if (!densityKgPerM3 || densityKgPerM3 <= 0) throw new Error("Densité du matériau requise.");
  const m3 = (tonnes * 1000) / densityKgPerM3;
  return unit === "m3" ? m3 : m3 / M3_PER_CUBIC_YARD;
}

export const roundUpTo = (value: number, step: number) =>
  step > 0 ? Math.ceil(value / step) * step : value;

export const roundMoney = (value: number, decimals: number) => {
  const f = Math.pow(10, Math.max(0, decimals));
  return Math.round((value + Number.EPSILON) * f) / f;
};

// ---------- Configuration (100 % paramètres administrateur) ----------

export interface MaterialRow {
  id: string; name: string; unit: string; density_kg_per_m3: number | null; is_taxable: boolean;
  selling_price: number | null; purchase_price: number | null; category?: string | null;
  public_description?: string | null;
}

export interface MaterialPriceRow {
  id: string; material_id: string; supplier_id: string | null; pickup_location_id: string | null;
  unit: string; selling_price: number; purchase_price: number;
  minimum_quantity: number | null; is_preferred: boolean;
}

export interface PickupRow {
  id: string; name: string; supplier_id: string | null; zone_id: string | null;
  latitude: number | null; longitude: number | null;
  loading_time_minutes: number | null; company_id: string | null;
}

export interface TruckRow {
  id: string; name: string; truck_type: string | null; capacity_tonnes: number; capacity_m3: number | null;
  loading_time_minutes: number | null; unloading_time_minutes: number | null;
  fixed_time_minutes: number | null; company_id: string | null;
}

export interface RateRow {
  id: string; name: string; rate_mode: string; truck_id: string | null; zone_id: string | null;
  hourly_rate: number; rate_per_km: number; rate_per_trip: number; flat_rate: number;
  minimum_charge: number; minimum_hours: number;
  distance_from_km: number | null; distance_to_km: number | null; company_id: string | null;
}

export interface ZoneRow { id: string; name: string; distance_surcharge: number }
export interface TaxRow {
  id: string; name: string; code: string | null; rate_percent: number;
  apply_order: number | null; compound: boolean | null; registration_number?: string | null;
}

export interface EngineConfig {
  material: MaterialRow;
  prices: MaterialPriceRow[];
  pickups: PickupRow[];
  suppliers: Array<{ id: string; name: string }>;
  carriers: Array<{ id: string; name: string }>;
  trucks: TruckRow[];
  rates: RateRow[];
  zones: ZoneRow[];
  taxes: TaxRow[];
  settings: SettingsMap;
}

/** Distance/durée routière depuis chaque lieu de chargement vers la livraison. */
export type DistanceProvider = (
  origins: Array<{ id: string; lat: number; lng: number }>,
  destination: { lat: number; lng: number },
) => Promise<Record<string, { distance_km: number; duration_minutes: number } | null>>;