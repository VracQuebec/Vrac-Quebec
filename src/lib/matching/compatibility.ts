// ============================================================
// LOT 10 — COUCHE STRUCTURÉE « CE QU'UNE DEMANDE DE REMBLAI PEUT RECEVOIR »
// ------------------------------------------------------------
// Fonctions PURES, sans effet de bord, sans accès réseau.
// Rien ici n'est branché au matching public (drapeau material_matching_v2,
// FALSE par défaut). Aucune acceptation n'est inventée :
//  - UNKNOWN ≠ ACCEPTED ≠ REFUSED;
//  - un refus explicite bat toujours une acceptation large (« broad »);
//  - « pas mal n'importe quoi » ne confirme AUCUN matériau individuellement;
//  - matériau, granulométrie, condition, restriction, environnement,
//    capacité et camions restent des dimensions séparées.
// ============================================================

import type { MaterialKey } from "@/lib/matching/interpreter";
import { MATERIAL_LABELS } from "@/lib/matching/interpreter";
import type { ChantierInterpretation, CompositionRole, Restriction } from "@/lib/nlu/chantier";

export const MATERIAL_MODEL_VERSION = "fill-materials-v1";

export type AcceptanceStatus = "ACCEPTED" | "REFUSED" | "UNKNOWN";
export type AcceptanceScope = "explicit" | "broad" | "unknown";
export type MaterialSource =
  | "historical" | "user_manual" | "user_assistant" | "admin_manual" | "inferred_pending_review";
export type CapacityKind = "known" | "approximate" | "unlimited" | "unknown";
export type CapacityUnit = "voyages" | "tonnes" | "verges3" | "m3";
export type EnvironmentStatus = "UNKNOWN" | "NOT_CHARACTERIZED" | "CHARACTERIZED" | "OTHER";

/** Une ligne demande ↔ matériau : le matériau reste distinct du calibre. */
export interface FillMaterialRule {
  materialKey: MaterialKey;
  label: string;
  status: AcceptanceStatus;
  /** Calibre canonique lorsqu'il est connu (« 0-3/4 », « 3/4 net »...). */
  granulometryCode?: string | null;
  /** Dimension maximale acceptée, en pouces (séparée du matériau). */
  maxInches?: number | null;
  role?: CompositionRole | null;
  source: MaterialSource;
  confidence: "high" | "medium" | "low";
  confirmedAt: string | null;
  confirmedBy: string | null;
  originalExpression?: string | null;
}

export interface FillCapacity {
  kind: CapacityKind;
  value: number | null;
  unit: CapacityUnit | null;
}

export interface FillRequestProfile {
  id: string;
  /** explicit = matériaux nommés · broad = « pas mal n'importe quoi » · unknown = « je sais pas ». */
  scope: AcceptanceScope;
  materials: FillMaterialRule[];
  restrictions: Restriction[];
  /** Conditions déclarées (propre, sec, mouillé…) — jamais une classification environnementale. */
  conditions: string[];
  environmentStatus: EnvironmentStatus;
  capacity: FillCapacity;
  acceptedTruckCodes: string[];
  heavyTruckAccess: "oui" | "non" | "inconnu";
  originalText: string;
}

export interface LoadComponent {
  materialKey: MaterialKey;
  label: string;
  role: CompositionRole;
  sharePct: number | null;
  maxInches: number | null;
}

export interface LoadComposition {
  id: string;
  materials: LoadComponent[];
  conditions: string[];
  originalText: string;
}

export type CompatibilityResult = "COMPATIBLE" | "INCOMPATIBLE" | "NEEDS_REVIEW";

export interface CompatibilityReason {
  level: "OK" | "BLOCKER" | "REVIEW";
  code:
    | "MATERIAL_ACCEPTED" | "MATERIAL_REFUSED" | "MATERIAL_UNKNOWN"
    | "MATERIAL_BROAD" | "SIZE_OK" | "SIZE_TOO_BIG" | "SIZE_UNKNOWN"
    | "NO_LOAD_MATERIAL";
  label: string;
  materialKey?: MaterialKey;
}

export interface CompatibilityEvaluation {
  version: string;
  result: CompatibilityResult;
  reasons: CompatibilityReason[];
  refusedMaterials: MaterialKey[];
  unknownMaterials: MaterialKey[];
  acceptedMaterials: MaterialKey[];
  /** Vrai si la compatibilité repose sur une acceptation large non confirmée. */
  reliesOnBroadAcceptance: boolean;
}

const inches = (n: number | null | undefined) => (typeof n === "number" ? n : null);

/**
 * LOT 12 — matériaux pour lesquels une limite de calibre est PERTINENTE.
 * Une limite « roche maximum 18 po » ne concerne pas un chargement de terre :
 * elle ne doit donc jamais provoquer de « à confirmer ».
 */
export const SIZE_RELEVANT_KEYS: MaterialKey[] = ["pierre", "roche", "beton", "asphalte", "materiel_inconnu"];

export const isSizeRelevant = (key: MaterialKey) => SIZE_RELEVANT_KEYS.includes(key);

/** Dimension maximale imposée par la demande (restrictions + règles matériau). */
export function maxAcceptedInches(profile: FillRequestProfile, key?: MaterialKey): number | null {
  if (key && !isSizeRelevant(key)) return null;
  const values = [
    ...profile.restrictions
      .filter((r) => r.kind === "DIMENSION" && !r.ambiguous)
      .filter((r) => !key || !r.materialKey || r.materialKey === key)
      .map((r) => inches(r.maxInches)),
    ...profile.materials
      .filter((m) => (key ? m.materialKey === key : true) && m.status === "ACCEPTED")
      .map((m) => inches(m.maxInches)),
  ].filter((n): n is number => n != null);
  return values.length ? Math.min(...values) : null;
}

/**
 * Compare la COMPOSITION d'un chargement avec les ACCEPTATIONS + RESTRICTIONS
 * d'une demande de remblai. Fonction pure, explicable, jamais optimiste.
 */
export function evaluateMaterialCompatibility(
  load: LoadComposition,
  request: FillRequestProfile,
): CompatibilityEvaluation {
  const reasons: CompatibilityReason[] = [];
  const refused: MaterialKey[] = [];
  const unknown: MaterialKey[] = [];
  const accepted: MaterialKey[] = [];
  let broadUsed = false;

  if (load.materials.length === 0) {
    return {
      version: MATERIAL_MODEL_VERSION,
      result: "NEEDS_REVIEW",
      reasons: [{ level: "REVIEW", code: "NO_LOAD_MATERIAL", label: "Aucun matériau identifié dans le chargement" }],
      refusedMaterials: [], unknownMaterials: [], acceptedMaterials: [], reliesOnBroadAcceptance: false,
    };
  }

  for (const c of load.materials) {
    const label = c.label || MATERIAL_LABELS[c.materialKey];

    // 1) Un refus explicite (restriction ou règle REFUSED) bat tout le reste.
    const restricted = request.restrictions.some(
      (r) => r.kind === "MATERIAU" && r.materialKey === c.materialKey && !r.ambiguous,
    );
    const restrictedMaybe = request.restrictions.some(
      (r) => r.kind === "MATERIAU" && r.materialKey === c.materialKey && r.ambiguous,
    );
    const rule = request.materials.find((m) => m.materialKey === c.materialKey);
    if (restricted || rule?.status === "REFUSED") {
      refused.push(c.materialKey);
      reasons.push({ level: "BLOCKER", code: "MATERIAL_REFUSED", label: `${label} explicitement refusé`, materialKey: c.materialKey });
      continue;
    }
    if (restrictedMaybe && rule?.status !== "ACCEPTED") {
      unknown.push(c.materialKey);
      reasons.push({
        level: "REVIEW", code: "MATERIAL_UNKNOWN",
        label: `${label} : limite évoquée sans refus clair — à confirmer`,
        materialKey: c.materialKey,
      });
      continue;
    }

    // 2) Acceptation explicite, sinon acceptation large, sinon inconnu.
    if (rule?.status === "ACCEPTED") {
      accepted.push(c.materialKey);
      reasons.push({ level: "OK", code: "MATERIAL_ACCEPTED", label: `${label} accepté`, materialKey: c.materialKey });
    } else if (c.materialKey === "materiel_inconnu") {
      unknown.push(c.materialKey);
      reasons.push({ level: "REVIEW", code: "MATERIAL_UNKNOWN", label: "Matériau du chargement non identifié", materialKey: c.materialKey });
    } else if (request.scope === "broad") {
      broadUsed = true;
      unknown.push(c.materialKey);
      reasons.push({
        level: "REVIEW", code: "MATERIAL_BROAD",
        label: `${label} probablement compatible (acceptation large déclarée, non confirmée)`,
        materialKey: c.materialKey,
      });
    } else {
      unknown.push(c.materialKey);
      reasons.push({ level: "REVIEW", code: "MATERIAL_UNKNOWN", label: `${label} : acceptation inconnue`, materialKey: c.materialKey });
    }

    // 3) Dimension / granulométrie — dimension séparée du matériau.
    const limit = maxAcceptedInches(request, c.materialKey);
    if (limit != null) {
      if (c.maxInches == null) {
        reasons.push({ level: "REVIEW", code: "SIZE_UNKNOWN", label: `Calibre de ${label} inconnu (limite ${limit} po)`, materialKey: c.materialKey });
      } else if (c.maxInches > limit) {
        reasons.push({ level: "BLOCKER", code: "SIZE_TOO_BIG", label: `${label} ${c.maxInches} po dépasse la limite de ${limit} po`, materialKey: c.materialKey });
      } else {
        reasons.push({ level: "OK", code: "SIZE_OK", label: `${label} ≤ ${limit} po accepté`, materialKey: c.materialKey });
      }
    }
  }

  const result: CompatibilityResult = reasons.some((r) => r.level === "BLOCKER")
    ? "INCOMPATIBLE"
    : reasons.some((r) => r.level === "REVIEW")
      ? "NEEDS_REVIEW"
      : "COMPATIBLE";

  return {
    version: MATERIAL_MODEL_VERSION,
    result, reasons,
    refusedMaterials: refused, unknownMaterials: unknown, acceptedMaterials: accepted,
    reliesOnBroadAcceptance: broadUsed,
  };
}

// ---------------- Ponts depuis l'interprétation du langage de chantier ----------------

function scopeOf(i: ChantierInterpretation): AcceptanceScope {
  if (i.acceptsAlmostEverything) return "broad";
  if (i.materials.filter((m) => m.key !== "materiel_inconnu").length > 0) return "explicit";
  return "unknown";
}

const ROLE_LOWER: Record<CompositionRole, CompositionRole> = {
  PRINCIPAL: "PRINCIPAL", SECONDAIRE: "SECONDAIRE", TRACE: "TRACE", INCONNU: "INCONNU",
};

/** Dimension maximale lisible dans l'interprétation (granulométries + restrictions). */
export function readMaxInches(i: ChantierInterpretation): number | null {
  const values = [
    ...i.granulometries.map((g) => g.maxInches),
    ...i.restrictions.map((r) => r.maxInches ?? null),
  ].filter((n): n is number => typeof n === "number");
  return values.length ? Math.min(...values) : null;
}

/**
 * Texte libre → représentation structurée d'une DEMANDE DE REMBLAI.
 * Aucune écriture en base; aucune confirmation humaine n'est simulée.
 */
export function buildFillProfileFromInterpretation(
  i: ChantierInterpretation,
  opts: { id?: string; source?: MaterialSource } = {},
): FillRequestProfile {
  const source = opts.source ?? "inferred_pending_review";
  const max = readMaxInches(i);
  const gran = i.granulometries.find((g) => g.canonical)?.code ?? null;

  const materials: FillMaterialRule[] = i.materials
    .filter((m) => m.key !== "materiel_inconnu")
    .map((m) => ({
      materialKey: m.key,
      label: m.label,
      status: "ACCEPTED" as AcceptanceStatus,
      granulometryCode: gran,
      maxInches: max,
      role: ROLE_LOWER[m.role],
      source,
      confidence: m.confidence >= 0.9 ? "high" : m.confidence >= 0.7 ? "medium" : "low",
      confirmedAt: null,
      confirmedBy: null,
      originalExpression: m.matchedExpression,
    }));

  for (const r of i.restrictions) {
    if (r.kind !== "MATERIAU" || !r.materialKey) continue;
    // LOT 12 — « pas trop de glaise » n'est pas un refus : statut inconnu, à confirmer.
    const status: AcceptanceStatus = r.ambiguous ? "UNKNOWN" : "REFUSED";
    const existing = materials.find((m) => m.materialKey === r.materialKey);
    if (existing) { existing.status = status; continue; }
    materials.push({
      materialKey: r.materialKey,
      label: MATERIAL_LABELS[r.materialKey],
      status,
      granulometryCode: null, maxInches: null, role: null,
      source, confidence: r.ambiguous ? "low" : "high", confirmedAt: null, confirmedBy: null,
      originalExpression: r.originalExpression,
    });
  }

  const capacity: FillCapacity = i.quantity.value != null && i.quantity.unit
    ? { kind: i.quantity.approximate ? "approximate" : "known", value: i.quantity.value, unit: i.quantity.unit as CapacityUnit }
    : i.trips != null
      ? { kind: "known", value: i.trips, unit: "voyages" }
      : { kind: "unknown", value: null, unit: null };

  return {
    id: opts.id ?? "simulation",
    scope: scopeOf(i),
    materials,
    restrictions: i.restrictions,
    conditions: i.conditions.map((c) => c.key),
    // Aucune déduction environnementale : « propre » reste une condition déclarée.
    environmentStatus: "UNKNOWN",
    capacity,
    acceptedTruckCodes: i.truck.code ? [i.truck.code] : [],
    heavyTruckAccess: "inconnu",
    originalText: i.originalText,
  };
}

/** Texte libre → composition d'un CHARGEMENT (matériau à sortir). */
export function buildLoadFromInterpretation(
  i: ChantierInterpretation,
  opts: { id?: string } = {},
): LoadComposition {
  const max = readMaxInches(i);
  return {
    id: opts.id ?? "simulation",
    materials: i.materials.map((m) => ({
      materialKey: m.key,
      label: m.label,
      role: m.role,
      sharePct: m.sharePct,
      maxInches: max,
    })),
    conditions: i.conditions.map((c) => c.key),
    originalText: i.originalText,
  };
}
