// ============================================================
// GABARITS ET DIMENSIONS DES VÉHICULES — CALCULS PURS
// ------------------------------------------------------------
// Règles absolues :
//  - Aucune dimension n'est déduite du nombre d'essieux/roues.
//  - Une dimension « typique » n'est JAMAIS une limite légale.
//  - La largeur réglementaire (rétroviseurs exclus) n'est JAMAIS
//    utilisée comme largeur de passage physique.
//  - Unité normalisée : le mètre.
// Non branché au matching public, à la tarification ni à /remblai.
// ============================================================

export const DIMENSION_SOURCES = [
  "ACTUAL_MEASURED",
  "MANUFACTURER_SPEC",
  "REGULATORY_LIMIT",
  "OPERATIONAL_ESTIMATE",
  "DEFAULT_ESTIMATE",
] as const;
export type DimensionSource = (typeof DIMENSION_SOURCES)[number];

/** Priorité pour déterminer le gabarit PHYSIQUE d'un véhicule inscrit. */
const PHYSICAL_PRIORITY: DimensionSource[] = [
  "ACTUAL_MEASURED",
  "MANUFACTURER_SPEC",
  "OPERATIONAL_ESTIMATE",
  "DEFAULT_ESTIMATE",
];

export const sourceRank = (s: DimensionSource): number => {
  const i = PHYSICAL_PRIORITY.indexOf(s);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
};

/** REGULATORY_LIMIT sert à la conformité, jamais à décrire un véhicule réel. */
export const isPhysicalSource = (s: DimensionSource) => s !== "REGULATORY_LIMIT";

export interface SourcedValue {
  value: number | null;
  source: DimensionSource;
}

/** Retient la valeur physique la plus fiable; ignore les limites réglementaires. */
export function resolvePhysicalDimension(candidates: SourcedValue[]): SourcedValue | null {
  const usable = candidates.filter(
    (c) => c.value != null && Number.isFinite(c.value) && isPhysicalSource(c.source),
  );
  if (usable.length === 0) return null;
  return usable.slice().sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0];
}

// ---------- Conversions (mètres = unité normalisée) ----------
export const M_PER_FOOT = 0.3048;
export const M_PER_INCH = 0.0254;

export const feetInchesToM = (feet: number, inches = 0) =>
  feet * M_PER_FOOT + inches * M_PER_INCH;

export const mToFeet = (m: number) => m / M_PER_FOOT;

export function mToFeetInches(m: number): { feet: number; inches: number } {
  const totalInches = m / M_PER_INCH;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round((totalInches - feet * 12) * 100) / 100;
  if (inches >= 12) { feet += 1; inches -= 12; }
  return { feet, inches };
}

// ---------- Largeurs ----------

/**
 * Largeur miroir à miroir = largeur de carrosserie + débord des deux rétroviseurs.
 * Une valeur mesurée directement est toujours prioritaire.
 */
export function mirrorToMirrorWidthM(input: {
  measuredMirrorWidthM?: number | null;
  bodyWidthM?: number | null;
  mirrorLeftOffsetM?: number | null;
  mirrorRightOffsetM?: number | null;
}): number | null {
  if (input.measuredMirrorWidthM != null) return input.measuredMirrorWidthM;
  const { bodyWidthM, mirrorLeftOffsetM, mirrorRightOffsetM } = input;
  if (bodyWidthM == null || mirrorLeftOffsetM == null || mirrorRightOffsetM == null) return null;
  return bodyWidthM + mirrorLeftOffsetM + mirrorRightOffsetM;
}

// ---------- Longueur d'un ensemble tracteur + semi-remorque ----------

export interface ComboLengthResult {
  lengthM: number | null;
  method: "measured" | "geometric" | "unknown";
  note: string | null;
}

/**
 * La longueur d'un ensemble N'EST PAS tracteur + semi-remorque :
 * les deux se chevauchent au pivot d'attelage (sellette).
 */
export function comboOverallLengthM(input: {
  measuredComboLengthM?: number | null;
  tractorLengthM?: number | null;
  trailerLengthM?: number | null;
  kingpinSetbackM?: number | null;
  tractorWheelbaseM?: number | null;
}): ComboLengthResult {
  if (input.measuredComboLengthM != null) {
    return { lengthM: input.measuredComboLengthM, method: "measured", note: null };
  }
  const { tractorLengthM, trailerLengthM, kingpinSetbackM, tractorWheelbaseM } = input;
  if (
    tractorLengthM != null && trailerLengthM != null &&
    kingpinSetbackM != null && tractorWheelbaseM != null
  ) {
    // Avant du tracteur → sellette, puis sellette → arrière de la remorque.
    const frontToFifthWheel = tractorWheelbaseM;
    const value = frontToFifthWheel + (trailerLengthM - kingpinSetbackM);
    if (value > 0 && value < tractorLengthM + trailerLengthM) {
      return {
        lengthM: value,
        method: "geometric",
        note: "Longueur géométrique estimée (chevauchement au pivot d'attelage) — une mesure réelle reste prioritaire.",
      };
    }
  }
  return {
    lengthM: null,
    method: "unknown",
    note: "Données insuffisantes : ne jamais additionner simplement tracteur + semi-remorque.",
  };
}

// ---------- Gabarit logistique ----------

export interface LogisticProfile {
  configCode: string;
  lengthM: number | null;
  bodyWidthM: number | null;
  mirrorWidthM: number | null;
  heightM: number | null;
  tareKg: number | null;
  payloadKg: number | null;
  axleCount: number | null;
  turningRadiusM: number | null;
  groundClearanceM: number | null;
  volumeCapacityM3: number | null;
  source: DimensionSource;
}

export function buildLogisticProfile(input: Partial<LogisticProfile> & { configCode: string }): LogisticProfile {
  return {
    configCode: input.configCode,
    lengthM: input.lengthM ?? null,
    bodyWidthM: input.bodyWidthM ?? null,
    mirrorWidthM: input.mirrorWidthM ?? null,
    heightM: input.heightM ?? null,
    tareKg: input.tareKg ?? null,
    payloadKg: input.payloadKg ?? null,
    axleCount: input.axleCount ?? null,
    turningRadiusM: input.turningRadiusM ?? null,
    groundClearanceM: input.groundClearanceM ?? null,
    volumeCapacityM3: input.volumeCapacityM3 ?? null,
    source: input.source ?? "DEFAULT_ESTIMATE",
  };
}

// ---------- Marges opérationnelles (règle Vrac Québec, pas une norme) ----------

export interface SafetyMargins {
  widthMarginM: number;
  heightMarginM: number;
  lengthMarginM: number;
  isRegulatory: false;
}

export const DEFAULT_SAFETY_MARGINS: SafetyMargins = {
  widthMarginM: 0.3,
  heightMarginM: 0.3,
  lengthMarginM: 1,
  isRegulatory: false,
};

// ---------- Conformité réglementaire (séparée de l'accessibilité) ----------

export interface RegulatoryLimits {
  maxHeightM?: number | null;
  maxRegulatoryWidthM?: number | null;   // rétroviseurs EXCLUS
  maxVehicleLengthM?: number | null;
  maxCombinationLengthM?: number | null;
}

export interface ComplianceIssue { field: string; message: string }

export function checkRegulatoryCompliance(
  profile: Pick<LogisticProfile, "lengthM" | "bodyWidthM" | "heightM">,
  limits: RegulatoryLimits | null,
): { ok: boolean; issues: ComplianceIssue[]; evaluated: boolean } {
  if (!limits) return { ok: true, issues: [], evaluated: false };
  const issues: ComplianceIssue[] = [];
  if (limits.maxHeightM != null && profile.heightM != null && profile.heightM > limits.maxHeightM) {
    issues.push({ field: "height", message: "Hauteur supérieure à la limite réglementaire." });
  }
  if (
    limits.maxRegulatoryWidthM != null && profile.bodyWidthM != null &&
    profile.bodyWidthM > limits.maxRegulatoryWidthM
  ) {
    issues.push({ field: "width", message: "Largeur (rétroviseurs exclus) supérieure à la limite réglementaire." });
  }
  const maxLen = limits.maxCombinationLengthM ?? limits.maxVehicleLengthM;
  if (maxLen != null && profile.lengthM != null && profile.lengthM > maxLen) {
    issues.push({ field: "length", message: "Longueur supérieure à la limite réglementaire." });
  }
  return { ok: issues.length === 0, issues, evaluated: true };
}

// ---------- Accessibilité d'un chantier (PRÉPARÉ, non activé) ----------

export interface AccessConstraints {
  accessWidthM?: number | null;
  clearHeightM?: number | null;
  maxPracticalLengthM?: number | null;
  turningRadiusM?: number | null;
  weightRestrictionKg?: number | null;
  acceptsSemiTrailer?: boolean | null;
  accepts12Roues?: boolean | null;
  accepts10Roues?: boolean | null;
  accepts6Roues?: boolean | null;
}

export interface AccessibilityResult {
  /** `null` = indéterminé : on ne conclut jamais sans donnée. */
  fits: boolean | null;
  blockers: string[];
  unknowns: string[];
}

const EXPLICIT_ACCEPT: Record<string, keyof AccessConstraints> = {
  porteur_6_roues: "accepts6Roues",
  porteur_10_roues: "accepts10Roues",
  porteur_12_roues: "accepts12Roues",
  semi_2_essieux: "acceptsSemiTrailer",
  semi_3_essieux: "acceptsSemiTrailer",
  semi_4_essieux: "acceptsSemiTrailer",
};

/**
 * Comparaison gabarit ↔ contraintes d'accès, marges opérationnelles incluses.
 * Fonction pure préparatoire : AUCUN matching public ne l'utilise.
 */
export function canVehicleAccess(
  profile: LogisticProfile,
  access: AccessConstraints | null,
  margins: SafetyMargins = DEFAULT_SAFETY_MARGINS,
): AccessibilityResult {
  if (!access) return { fits: null, blockers: [], unknowns: ["Contraintes d'accès inconnues."] };
  const blockers: string[] = [];
  const unknowns: string[] = [];

  const flag = EXPLICIT_ACCEPT[profile.configCode];
  if (flag && access[flag] === false) blockers.push("Ce type de camion est refusé sur le site.");

  if (access.accessWidthM != null) {
    if (profile.mirrorWidthM == null) unknowns.push("Largeur miroir à miroir inconnue.");
    else if (profile.mirrorWidthM + margins.widthMarginM > access.accessWidthM) {
      blockers.push("Largeur d'accès insuffisante (marge de passage incluse).");
    }
  } else unknowns.push("Largeur d'accès inconnue.");

  if (access.clearHeightM != null) {
    if (profile.heightM == null) unknowns.push("Hauteur du véhicule inconnue.");
    else if (profile.heightM + margins.heightMarginM > access.clearHeightM) {
      blockers.push("Hauteur libre insuffisante (marge de hauteur incluse).");
    }
  }

  if (access.maxPracticalLengthM != null) {
    if (profile.lengthM == null) unknowns.push("Longueur du véhicule inconnue.");
    else if (profile.lengthM > access.maxPracticalLengthM) {
      blockers.push("Longueur pratique du site dépassée.");
    }
  }

  if (access.turningRadiusM != null && profile.turningRadiusM != null &&
      profile.turningRadiusM > access.turningRadiusM) {
    blockers.push("Rayon de virage insuffisant.");
  }

  if (access.weightRestrictionKg != null && profile.tareKg != null && profile.payloadKg != null &&
      profile.tareKg + profile.payloadKg > access.weightRestrictionKg) {
    blockers.push("Restriction de poids dépassée.");
  }

  if (blockers.length > 0) return { fits: false, blockers, unknowns };
  if (unknowns.length > 0) return { fits: null, blockers, unknowns };
  return { fits: true, blockers, unknowns };
}
