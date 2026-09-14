// ============================================================
// LOT 20 — BRANCHEMENT « OFFRE RÉELLE → MOTEUR DE MATCHING »
// ------------------------------------------------------------
// Fonctions PURES. Aucune écriture, aucune confirmation, aucune
// communication. La compatibilité matière (LOT 18) reste strictement
// séparée du score opérationnel (distance, capacité, questions).
// ============================================================
import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import type { LoadComposition, LoadComponent } from "@/lib/matching/compatibility";
import type { CompositionRole } from "@/lib/nlu/chantier";
import type { EnrichedProfile } from "@/lib/qualification/lot15";
import {
  createMatchCache, evaluateMatch, matchesForLoad, planSplit,
  type MatchContext, type MatchEvaluation, type MatchState, type SplitPlanPart,
} from "@/lib/matching/impact";
import {
  classifyDistance, geographicDistance, exceedsExplicitRadius,
  DEFAULT_DISTANCE_THRESHOLDS, type DistanceBand, type DistanceThresholds, type GeoPoint,
} from "./distance";
import type { MaterialOffer, MaterialOfferInput, OfferQuantityUnit } from "./types";
import { ENVIRONMENTAL_LABELS, MATERIAL_OFFER_VERSION } from "./types";
import type { ParsedMaterialDescription } from "@/lib/material-language";

// ---------------- Offre → modèle du moteur ----------------

const component = (key: MaterialKey, role: CompositionRole, maxInches: number | null): LoadComponent => ({
  materialKey: key,
  label: MATERIAL_LABELS[key] ?? key,
  role,
  sharePct: null,
  maxInches,
});

/** Convertit une offre persistée en chargement compréhensible par le moteur LOT 18. */
export function loadMaterialOfferForMatching(offer: MaterialOffer): LoadComposition {
  const max = offer.granulometry_max_inches ?? null;
  const materials: LoadComponent[] = [];
  if (offer.principal_material) materials.push(component(offer.principal_material, "PRINCIPAL", max));
  for (const k of offer.secondary_materials ?? []) materials.push(component(k, "SECONDAIRE", max));
  for (const k of offer.trace_materials ?? []) materials.push(component(k, "TRACE", max));
  const conditions: string[] = [];
  if (offer.declared_clean) conditions.push("déclaré propre par l'utilisateur (non vérifié)");
  if (offer.declared_contaminated) conditions.push("déclaré contaminé par l'utilisateur (non vérifié)");
  return {
    id: offer.id,
    materials,
    conditions,
    originalText: offer.raw_description ?? "",
  };
}

export interface RequestTarget {
  profile: EnrichedProfile;
  reference?: string | null;
  point?: GeoPoint;
  /** Rayon maximal EXPLICITEMENT exprimé par la demande (jamais inventé). */
  maxRadiusKm?: number | null;
  city?: string | null;
}

/** Contexte opérationnel d'une offre face à une demande précise. */
export function offerMatchContext(offer: MaterialOffer, target?: RequestTarget): MatchContext {
  const distanceKm = target?.point
    ? geographicDistance({ latitude: offer.latitude, longitude: offer.longitude }, target.point)
    : null;
  const radii = [offer.max_radius_km, target?.maxRadiusKm].filter((n): n is number => typeof n === "number");
  return {
    quantity: offer.quantity_value != null && offer.quantity_unit
      ? { value: offer.quantity_value, unit: offer.quantity_unit as OfferQuantityUnit }
      : null,
    distanceKm,
    maxRadiusKm: radii.length ? Math.min(...radii) : null,
    label: offer.city ?? offer.location_raw ?? null,
  };
}

// ---------------- Score opérationnel (JAMAIS la compatibilité) ----------------

export interface OperationalScore {
  /** 0 → 100, priorisation uniquement. */
  score: number;
  distanceBand: DistanceBand | null;
  reasons: string[];
}

export function operationalScore(
  evaluation: MatchEvaluation,
  opts: { openQuestions?: number; thresholds?: DistanceThresholds } = {},
): OperationalScore {
  const thresholds = opts.thresholds ?? DEFAULT_DISTANCE_THRESHOLDS;
  const band = classifyDistance(evaluation.distanceKm, thresholds);
  const reasons: string[] = [];
  let score = 40;

  const distancePoints: Record<DistanceBand, number> = {
    excellent_distance: 30, good_distance: 22, acceptable_distance: 14, far: 6, very_far: 0,
  };
  if (band) { score += distancePoints[band]; reasons.push(`Distance : ${evaluation.distanceKm} km`); }
  else reasons.push("Distance inconnue");

  if (evaluation.capacity.known) {
    score += evaluation.capacity.partial ? 8 : 16;
    reasons.push(evaluation.capacity.partial ? "Capacité partielle" : "Capacité suffisante estimée");
  } else reasons.push("Capacité inconnue");

  const confirmationPoints: Record<MatchState, number> = {
    CONFIRMED_COMPATIBLE: 14, PROBABLE_COMPATIBLE: 9, NEEDS_CONFIRMATION: 4,
    INSUFFICIENT_INFORMATION: 0, INCOMPATIBLE: 0,
  };
  score += confirmationPoints[evaluation.state];

  const open = opts.openQuestions ?? evaluation.missing.length;
  score -= Math.min(20, open * 4);
  if (open > 0) reasons.push(`${open} information(s) manquante(s)`);
  if (!evaluation.operational.usable) { score -= 25; reasons.push("Non exploitable actuellement"); }

  return { score: Math.max(0, Math.min(100, Math.round(score))), distanceBand: band, reasons };
}

// ---------------- Matching d'une offre réelle ----------------

export interface OfferMatchRow {
  requestId: string;
  reference: string | null;
  city: string | null;
  state: MatchState;
  stateLabel: string;
  distanceKm: number | null;
  distanceBand: DistanceBand | null;
  blockedByRadius: boolean;
  remainingCapacity: number | null;
  acceptableQuantity: number | null;
  acceptedMaterials: string[];
  granulometry: string;
  reasons: string[];
  missing: string[];
  unlockingQuestion: string | null;
  operational: OperationalScore;
}

export function matchOffer(
  offer: MaterialOffer,
  targets: RequestTarget[],
  thresholds: DistanceThresholds = DEFAULT_DISTANCE_THRESHOLDS,
): OfferMatchRow[] {
  const load = loadMaterialOfferForMatching(offer);
  const cache = createMatchCache();
  const rows = targets.map((t) => {
    const ctx = offerMatchContext(offer, t);
    const evaluation = cache.evaluate(load, t.profile, ctx);
    const op = operationalScore(evaluation, { thresholds });
    return {
      requestId: evaluation.requestId,
      reference: t.reference ?? null,
      city: t.city ?? null,
      state: evaluation.state,
      stateLabel: evaluation.stateLabel,
      distanceKm: evaluation.distanceKm,
      distanceBand: op.distanceBand,
      blockedByRadius: exceedsExplicitRadius(ctx.distanceKm ?? null, ctx.maxRadiusKm ?? null),
      remainingCapacity: evaluation.capacity.remainingCapacity,
      acceptableQuantity: evaluation.capacity.acceptableQuantity,
      acceptedMaterials: t.profile.materials
        .filter((m) => m.stance === "ACCEPTE_CONFIRME" || m.stance === "COMPATIBLE_PROBABLE")
        .map((m) => m.label),
      granulometry: t.profile.granulometry.maxInches != null
        ? `max ${t.profile.granulometry.maxInches} po`
        : "calibre non précisé",
      reasons: evaluation.reasons.map((r) => `${r.mark} ${r.text}`),
      missing: evaluation.missing,
      unlockingQuestion: evaluation.unlockingQuestion,
      operational: op,
    } satisfies OfferMatchRow;
  });
  // Compatibilité d'abord, score opérationnel ensuite : jamais fusionnés.
  const order: Record<MatchState, number> = {
    CONFIRMED_COMPATIBLE: 4, PROBABLE_COMPATIBLE: 3, NEEDS_CONFIRMATION: 2,
    INSUFFICIENT_INFORMATION: 1, INCOMPATIBLE: 0,
  };
  return rows.sort(
    (a, b) => order[b.state] - order[a.state] ||
      b.operational.score - a.operational.score ||
      a.requestId.localeCompare(b.requestId),
  );
}

/** Répartition potentielle de l'offre sur plusieurs demandes — simulation seulement. */
export function planOfferSplit(
  offer: MaterialOffer,
  targets: RequestTarget[],
): { parts: SplitPlanPart[]; placed: number; leftover: number } {
  const load = loadMaterialOfferForMatching(offer);
  const total = offer.quantity_value ?? 0;
  return planSplit(
    load,
    targets.map((t) => ({ profile: t.profile, ctx: offerMatchContext(offer, t) })),
    total,
  );
}

// ---------------- Qualité de l'offre ----------------

export interface OfferQuality {
  /** 0 → 100. */
  percent: number;
  missingRequired: string[];
  missingRecommended: string[];
  missingOptional: string[];
  matchable: boolean;
  environmentalLabel: string;
}

const has = (v: unknown) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

/** Minimum requis pour matcher : le matériau principal. Le reste améliore la qualité. */
export function offerQuality(offer: MaterialOffer): OfferQuality {
  const required: [string, unknown][] = [["matériau principal", offer.principal_material]];
  const recommended: [string, unknown][] = [
    ["quantité", offer.quantity_value],
    ["localisation", offer.city ?? offer.location_raw],
    ["coordonnées géographiques", offer.latitude != null && offer.longitude != null ? true : null],
  ];
  const optional: [string, unknown][] = [
    ["type de camion", offer.vehicle_type],
    ["date de disponibilité", offer.availability_start],
    ["matériaux secondaires", offer.secondary_materials],
    ["granulométrie précise", offer.granulometry_max_inches],
  ];

  const missingRequired = required.filter(([, v]) => !has(v)).map(([l]) => l);
  const missingRecommended = recommended.filter(([, v]) => !has(v)).map(([l]) => l);
  const missingOptional = optional.filter(([, v]) => !has(v)).map(([l]) => l);

  const weight = (total: number, missing: number, points: number) =>
    total === 0 ? points : ((total - missing) / total) * points;
  const percent = Math.round(
    weight(required.length, missingRequired.length, 40) +
    weight(recommended.length, missingRecommended.length, 40) +
    weight(optional.length, missingOptional.length, 20),
  );

  return {
    percent,
    missingRequired,
    missingRecommended,
    missingOptional,
    matchable: missingRequired.length === 0,
    environmentalLabel: ENVIRONMENTAL_LABELS[offer.environmental_status],
  };
}

// ---------------- Interprétation → brouillon d'offre ----------------

const UNIT_MAP: Record<string, OfferQuantityUnit> = {
  tonne: "tonnes", voyage: "voyages", m3: "m3", verge3: "verges3",
};

/**
 * Brouillon d'offre issu du parser LOT 19.
 * RIEN n'est enregistré : la création reste un geste humain explicite.
 */
export function offerDraftFromParsed(
  parsed: ParsedMaterialDescription,
  extra: Partial<MaterialOfferInput> = {},
): MaterialOfferInput {
  const principal = parsed.materials.find((m) => m.role === "principal") ?? parsed.materials[0];
  const secondary = parsed.materials.filter((m) => m.role === "secondary").map((m) => m.type);
  const trace = parsed.materials.filter((m) => m.role === "trace").map((m) => m.type);
  const clean = parsed.contamination.statedClean === true;
  const contaminated = parsed.contamination.statedContaminated === true;

  return {
    source_type: "free_text_parser",
    status: parsed.ambiguities.length > 0 ? "needs_confirmation" : "parsed",
    qualification_status: parsed.ambiguities.length > 0 ? "partially_qualified" : "unqualified",
    raw_description: parsed.rawText,
    quantity_value: parsed.quantity?.value ?? null,
    quantity_unit: parsed.quantity?.unit ? UNIT_MAP[parsed.quantity.unit] : null,
    quantity_approximate: parsed.quantity?.approximate ?? false,
    trip_count: parsed.transport?.tripCount ?? null,
    vehicle_type: parsed.transport?.vehicleType && parsed.transport.vehicleType !== "unknown"
      ? parsed.transport.vehicleType : null,
    principal_material: principal?.type ?? null,
    secondary_materials: secondary,
    trace_materials: trace,
    granulometry_min_inches: parsed.granulometry?.minInches ?? null,
    granulometry_max_inches: parsed.granulometry?.maxInches ?? null,
    granulometry_approximate: parsed.granulometry?.approximate ?? false,
    declared_clean: clean ? true : null,
    declared_contaminated: contaminated ? true : null,
    environmental_status: contaminated
      ? "stated_contaminated_by_user"
      : clean ? "stated_clean_by_user" : "unknown",
    location_raw: parsed.location?.raw ?? null,
    city: parsed.location?.raw ?? null,
    parser_confidence: parsed.confidence,
    parser_version: parsed.version,
    ...extra,
  };
}

export const OFFER_ENGINE_VERSION = MATERIAL_OFFER_VERSION;
export { evaluateMatch, matchesForLoad };
