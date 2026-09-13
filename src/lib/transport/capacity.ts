// ============================================================
// CAPACITÉS RÉELLES DE TRANSPORT — CALCULS PURS
// ------------------------------------------------------------
// Aucune limite légale n'est codée ici. Les masses admissibles
// proviennent exclusivement de l'administration
// (`transport_weight_rules` / `transport_vehicle_capacities`).
// Une donnée absente reste `null` : rien n'est inventé.
// ============================================================

export type VehicleClass = "porteur" | "semi_remorque" | "autre";

/** Codes de configuration officiels (table `transport_vehicle_configs`). */
export const VEHICLE_CONFIG_CODES = [
  "porteur_6_roues",
  "porteur_10_roues",
  "porteur_12_roues",
  "semi_2_essieux",
  "semi_3_essieux",
  "semi_4_essieux",
] as const;

export type VehicleConfigCode = (typeof VEHICLE_CONFIG_CODES)[number];

export interface VehicleConfig {
  code: string;
  label: string;
  vehicle_class: VehicleClass;
  truck_type: string | null;
  axle_count: number | null;
  trailer_axle_count: number | null;
}

/** Conversions purement métrologiques (aucune donnée métier). */
export const KG_PER_TONNE = 1000;
export const M3_PER_CUBIC_YARD = 0.764554857984;

export const kgToTonnes = (kg: number | null): number | null =>
  kg == null || !Number.isFinite(kg) ? null : kg / KG_PER_TONNE;

export const tonnesToKg = (t: number | null): number | null =>
  t == null || !Number.isFinite(t) ? null : t * KG_PER_TONNE;

export const cubicYardsToM3 = (yd3: number) => yd3 * M3_PER_CUBIC_YARD;
export const m3ToCubicYards = (m3: number) => m3 / M3_PER_CUBIC_YARD;

export interface CapacityInput {
  /** Poids à vide du tracteur (kg), lorsque pertinent. */
  tractorTareKg?: number | null;
  /** Poids à vide de la remorque (kg), lorsque pertinent. */
  trailerTareKg?: number | null;
  /** Poids à vide de l'ensemble (kg) — prioritaire s'il est connu. */
  comboTareKg?: number | null;
  /** Masse totale en charge admissible (kg) — valeur administrée. */
  grossAdmissibleKg?: number | null;
}

/** Poids à vide retenu : l'ensemble mesuré prime sur la somme des éléments. */
export function resolveTareKg(input: CapacityInput): number | null {
  if (input.comboTareKg != null) return input.comboTareKg;
  const t = input.tractorTareKg;
  const r = input.trailerTareKg;
  if (t != null && r != null) return t + r;
  if (t != null) return t;
  if (r != null) return r;
  return null;
}

/**
 * CHARGE UTILE = MASSE TOTALE ADMISSIBLE − POIDS À VIDE RÉEL.
 * Renvoie `null` si une des deux données est absente.
 */
export function computePayloadKg(input: CapacityInput): number | null {
  const tare = resolveTareKg(input);
  const gross = input.grossAdmissibleKg;
  if (tare == null || gross == null) return null;
  const payload = gross - tare;
  return payload > 0 ? payload : null;
}

export interface OperationalCheck {
  ok: boolean;
  /** Valeur retenue (jamais supérieure à la charge utile calculée). */
  value: number | null;
  reason?: string;
}

/**
 * La capacité opérationnelle ne peut JAMAIS dépasser la charge utile
 * calculée à partir des limites réglementaires administrées.
 */
export function validateOperationalCapacityKg(
  operationalKg: number | null | undefined,
  payloadKg: number | null,
): OperationalCheck {
  if (operationalKg == null) return { ok: true, value: null };
  if (!Number.isFinite(operationalKg) || operationalKg <= 0) {
    return { ok: false, value: null, reason: "Capacité opérationnelle invalide." };
  }
  if (payloadKg == null) {
    return {
      ok: false,
      value: null,
      reason: "Charge utile inconnue : la masse admissible ou le poids à vide n'est pas renseigné.",
    };
  }
  if (operationalKg > payloadKg) {
    return {
      ok: false,
      value: null,
      reason: "La capacité opérationnelle ne peut pas dépasser la charge utile calculée.",
    };
  }
  return { ok: true, value: operationalKg };
}

// ---------- Densités (toujours des estimations) ----------

export interface MaterialDensity {
  avgKgPerM3: number | null;
  minKgPerM3?: number | null;
  maxKgPerM3?: number | null;
  /** Une densité est une estimation tant qu'un pesage réel n'est pas fourni. */
  isEstimate: boolean;
}

export interface VolumeToMassResult {
  tonnes: number | null;
  minTonnes: number | null;
  maxTonnes: number | null;
  isEstimate: boolean;
  note: string | null;
}

/** Volume (m³) → masse (tonnes) via densité administrée. Jamais présenté comme exact. */
export function volumeToTonnes(m3: number, density: MaterialDensity | null): VolumeToMassResult {
  if (!density || !density.avgKgPerM3 || density.avgKgPerM3 <= 0 || !(m3 > 0)) {
    return {
      tonnes: null, minTonnes: null, maxTonnes: null, isEstimate: true,
      note: "Densité du matériau non configurée : conversion volume → poids impossible.",
    };
  }
  const t = (v: number) => (m3 * v) / KG_PER_TONNE;
  return {
    tonnes: t(density.avgKgPerM3),
    minTonnes: density.minKgPerM3 ? t(density.minKgPerM3) : null,
    maxTonnes: density.maxKgPerM3 ? t(density.maxKgPerM3) : null,
    isEstimate: density.isEstimate !== false,
    note: density.isEstimate === false
      ? null
      : "Estimation : la densité varie selon l'humidité, la granulométrie, la composition et la compaction.",
  };
}

// ---------- Voyages ----------

/**
 * NOMBRE DE VOYAGES = quantité ÷ capacité retenue, arrondi vers le haut.
 * La capacité retenue est la capacité opérationnelle si elle est valide,
 * sinon la charge utile calculée. Non branché à la tarification publique.
 */
export function tripsForTonnes(
  quantityTonnes: number,
  capacityTonnes: number | null,
): number | null {
  if (!Number.isFinite(quantityTonnes) || quantityTonnes <= 0) return null;
  if (capacityTonnes == null || !Number.isFinite(capacityTonnes) || capacityTonnes <= 0) return null;
  return Math.max(1, Math.ceil(quantityTonnes / capacityTonnes - 1e-9));
}

export interface EffectiveCapacity {
  payloadKg: number | null;
  operationalKg: number | null;
  /** Capacité à utiliser pour un calcul de voyages (kg). */
  usableKg: number | null;
  usableTonnes: number | null;
}

export function effectiveCapacity(
  input: CapacityInput & { operationalCapacityKg?: number | null },
): EffectiveCapacity {
  const payloadKg = computePayloadKg(input);
  const check = validateOperationalCapacityKg(input.operationalCapacityKg, payloadKg);
  const operationalKg = check.ok ? check.value : null;
  const usableKg = operationalKg ?? payloadKg;
  return { payloadKg, operationalKg, usableKg, usableTonnes: kgToTonnes(usableKg) };
}
