// ============================================================
// LOT 11 — MOTEUR DE MATCHING V2 INTERNE (LECTURE SEULE)
// ------------------------------------------------------------
// Pipeline : TEXTE → NLU CHANTIER → CHARGEMENT STRUCTURÉ →
// DEMANDES ADMISSIBLES → MATÉRIAUX → RESTRICTIONS → GRANULOMÉTRIE →
// CONDITIONS → ENVIRONNEMENT → CAMION/ACCÈS → CAPACITÉ → GÉOGRAPHIE →
// CLASSEMENT → EXPLICATION.
//
// Règles absolues :
//  - fonctions PURES, aucune écriture, aucune communication;
//  - un REFUS explicite bat toujours une acceptation large;
//  - INCONNU n'est jamais transformé en NON ni en OUI;
//  - aucune distance routière, aucune classification environnementale
//    et aucune compatibilité ne sont inventées;
//  - jamais branché au matching public (material_matching_v2 = false).
// ============================================================

import { interpretChantier, type ChantierInterpretation } from "@/lib/nlu/chantier";
import type { MaterialKey } from "@/lib/matching/interpreter";
import { MATERIAL_LABELS } from "@/lib/matching/interpreter";
import {
  buildLoadFromInterpretation,
  evaluateMaterialCompatibility,
  readMaxInches,
  type FillCapacity,
  type FillMaterialRule,
  type FillRequestProfile,
  type LoadComposition,
  type MaterialSource,
} from "@/lib/matching/compatibility";
import type { CandidateRow } from "@/lib/matching/engine";
import { parseCapacityTonnes } from "@/lib/matching/engine";

export const MATCHING_PIPELINE_VERSION = "v2-internal-lot11";

// ---------------- Types ----------------

export type PipelineVerdict = "COMPATIBLE" | "POSSIBLE" | "INCOMPATIBLE";
export type CapacityMatch = "TOTAL" | "PARTIEL" | "INCONNUE";
export type FreshnessState = "CONFIRMEE" | "A_REVALIDER";
export type DistanceKindP = "ROUTIERE" | "APPROXIMATIVE" | "INCONNUE";

export interface PipelineWeights {
  materials: number;
  granulometry: number;
  conditions: number;
  environment: number;
  truck: number;
  capacity: number;
  distance: number;
  freshness: number;
}

/** Pondérations centralisées (jamais dispersées dans le code/UI). */
export const DEFAULT_WEIGHTS: PipelineWeights = {
  materials: 32,
  granulometry: 10,
  conditions: 8,
  environment: 8,
  truck: 10,
  capacity: 12,
  distance: 12,
  freshness: 8,
};

export interface LoadInput {
  /** Texte libre du chantier (conservé intégralement). */
  text: string;
  quantity?: number | null;
  unit?: "tonnes" | "verges3" | "m3" | "voyages" | null;
  trips?: number | null;
  configCode?: string | null;
  origin?: { lat: number; lng: number } | null;
  /** Caractérisation environnementale disponible côté chargement. */
  environmentDocumented?: boolean;
}

export interface StructuredLoad {
  interpretation: ChantierInterpretation;
  composition: LoadComposition;
  maxInches: number | null;
  quantity: number | null;
  unit: LoadInput["unit"];
  trips: number | null;
  configCode: string | null;
  origin: { lat: number; lng: number } | null;
  environmentDocumented: boolean;
  originalText: string;
}

/** Ligne candidate : sortie de `matching_lab_candidates` + champs optionnels. */
export interface PipelineCandidate extends CandidateRow {
  availability_confirmed_at?: string | null;
  /** Conditions déclarées par la demande (« sec », « propre »...). */
  conditions?: string[] | null;
  /** Exigence environnementale explicite de la demande. */
  environment_requirement?: "NONE" | "CHARACTERIZATION_REQUIRED" | "INCOMPATIBLE" | "UNKNOWN" | null;
  /** Dimension maximale acceptée, en pouces. */
  max_inches?: number | null;
  /** Capacité restante en voyages, si connue. */
  remaining_trips?: number | null;
  acceptance_scope?: "explicit" | "broad" | "unknown" | null;
}

export type StepKey =
  | "materiaux" | "restrictions" | "granulometrie" | "conditions"
  | "environnement" | "camion" | "capacite" | "distance" | "fraicheur";

export interface StepResult {
  key: StepKey;
  level: "OK" | "REVIEW" | "BLOCKER" | "NA";
  label: string;
  /** Sous-score 0..1, ou null quand l'information est absente. */
  score: number | null;
}

export interface CandidateMatch {
  requestId: string;
  reference: string | null;
  city: string | null;
  compatibility: PipelineVerdict;
  score: number;
  distanceKm: number | null;
  distanceKind: DistanceKindP;
  capacityMatch: CapacityMatch;
  /** Voyages potentiellement dirigeables (simulation, aucune affectation). */
  usableTrips: number | null;
  remainingTripsAfter: number | null;
  freshness: FreshnessState;
  positiveReasons: string[];
  warnings: string[];
  blockingReasons: string[];
  needsConfirmation: string[];
  steps: StepResult[];
}

export interface PipelineFilters {
  maxDistanceKm?: number | null;
  requireRecentConfirmation?: boolean;
  includeToRevalidate?: boolean;
  materialKey?: MaterialKey | null;
  configCode?: string | null;
  minCapacityTrips?: number | null;
  only?: Array<PipelineVerdict>;
}

export interface PipelineRun {
  version: string;
  load: StructuredLoad;
  evaluated: number;
  excluded: number;
  exclusionReasons: Record<string, number>;
  results: CandidateMatch[];
  summary: { compatible: number; possible: number; incompatible: number };
}

// ---------------- Étape 1 — chargement structuré ----------------

export function buildLoad(input: LoadInput): StructuredLoad {
  const interpretation = interpretChantier(input.text, { direction: "EVACUATION" });
  const composition = buildLoadFromInterpretation(interpretation);
  return {
    interpretation,
    composition,
    maxInches: readMaxInches(interpretation),
    quantity: input.quantity ?? interpretation.quantity.value ?? null,
    unit: input.unit ?? (interpretation.quantity.unit as LoadInput["unit"]) ?? null,
    trips: input.trips ?? interpretation.trips ?? null,
    configCode: input.configCode ?? interpretation.truck.code ?? null,
    origin: input.origin ?? null,
    environmentDocumented: Boolean(input.environmentDocumented),
    originalText: input.text,
  };
}

// ---------------- Étape 2 — admissibilité ----------------

const BLOCKED_STATUS = /(perdu|archiv|ferm|termin|annul|blacklist)/i;

export function isAdmissible(
  c: PipelineCandidate,
  opts: { requireGeo?: boolean } = {},
): { ok: boolean; reason?: string } {
  if (BLOCKED_STATUS.test(c.status ?? "")) return { ok: false, reason: "statut non admissible" };
  if (BLOCKED_STATUS.test(c.availability_status ?? "")) return { ok: false, reason: "disponibilité non admissible" };
  if ((c.availability_status ?? "available") !== "available") return { ok: false, reason: "disponibilité non admissible" };
  if (opts.requireGeo && (c.latitude == null || c.longitude == null)) return { ok: false, reason: "GPS manquant" };
  return { ok: true };
}

// ---------------- Étape 3 — profil de la demande ----------------

const norm = (v?: string | null) =>
  (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Traduit un libellé de catalogue en clé matériau normalisée (via le NLU). */
export function materialKeyOf(row: { slug?: string | null; name?: string | null; original_value?: string | null }): MaterialKey | null {
  const text = [row.slug, row.name, row.original_value].filter(Boolean).join(" ");
  if (!text.trim()) return null;
  const i = interpretChantier(text.replace(/[-_]/g, " "), { direction: "RECEPTION" });
  const first = i.materials.find((m) => m.key !== "materiel_inconnu");
  return first?.key ?? null;
}

export function candidateToProfile(c: PipelineCandidate): FillRequestProfile {
  const materials: FillMaterialRule[] = [];
  for (const row of c.accepted_materials ?? []) {
    const key = materialKeyOf(row);
    if (!key) continue;
    const stance = (row.stance ?? "accepted").toLowerCase();
    const status = stance === "refused" ? "REFUSED" : stance === "unknown" ? "UNKNOWN" : "ACCEPTED";
    const existing = materials.find((m) => m.materialKey === key);
    if (existing) {
      // Un refus explicite l'emporte toujours sur une acceptation.
      if (status === "REFUSED") existing.status = "REFUSED";
      continue;
    }
    materials.push({
      materialKey: key,
      label: row.name ?? MATERIAL_LABELS[key],
      status,
      granulometryCode: null,
      maxInches: c.max_inches ?? null,
      role: null,
      source: (row.source as MaterialSource) ?? "historical",
      confidence: (row.confidence as "high" | "medium" | "low") ?? "low",
      confirmedAt: row.confirmation_status === "confirmed" ? "confirmed" : null,
      confirmedBy: null,
      originalExpression: row.original_value ?? null,
    });
  }

  const trips = c.remaining_trips ?? null;
  const tonnes = parseCapacityTonnes(c.remaining_capacity);
  const capacity: FillCapacity = trips != null
    ? { kind: "known", value: trips, unit: "voyages" }
    : tonnes != null
      ? { kind: "approximate", value: tonnes, unit: "tonnes" }
      : { kind: "unknown", value: null, unit: null };

  return {
    id: c.id,
    scope: c.acceptance_scope ?? (materials.length ? "explicit" : "unknown"),
    materials,
    restrictions: c.max_inches != null
      ? [{ kind: "DIMENSION", label: `max ${c.max_inches} po`, maxInches: c.max_inches, originalExpression: null } as never]
      : [],
    conditions: (c.conditions ?? []).map(norm),
    environmentStatus: "UNKNOWN",
    capacity,
    acceptedTruckCodes: c.truck_types_allowed ?? [],
    heavyTruckAccess: c.access?.accepts_semi_trailer === true ? "oui" : c.access?.accepts_semi_trailer === false ? "non" : "inconnu",
    originalText: [c.materials, c.other_material].filter(Boolean).join(" · "),
  };
}

// ---------------- Étapes d'évaluation ----------------

const WET = /mouill|humide|detremp/;
const DRY = /\bsec\b|seche/;

export function evaluateConditions(load: StructuredLoad, profile: FillRequestProfile): StepResult {
  const loadConds = load.composition.conditions.map(norm);
  const reqConds = profile.conditions.map(norm);
  if (!reqConds.length) {
    return { key: "conditions", level: "NA", label: "Aucune condition déclarée par la demande", score: null };
  }
  const requiresDry = reqConds.some((c) => DRY.test(c));
  const loadWet = loadConds.some((c) => WET.test(c));
  if (requiresDry && loadWet) {
    return { key: "conditions", level: "BLOCKER", label: "Demande « sec seulement » et chargement déclaré mouillé", score: 0 };
  }
  if (requiresDry && !loadConds.some((c) => DRY.test(c))) {
    return { key: "conditions", level: "REVIEW", label: "Humidité du chargement à confirmer (demande « sec »)", score: 0.5 };
  }
  return { key: "conditions", level: "OK", label: "Conditions déclarées compatibles", score: 1 };
}

export function evaluateEnvironment(load: StructuredLoad, c: PipelineCandidate): StepResult {
  const req = c.environment_requirement ?? "UNKNOWN";
  if (req === "INCOMPATIBLE") {
    return { key: "environnement", level: "BLOCKER", label: "Incompatibilité environnementale explicite", score: 0 };
  }
  if (req === "CHARACTERIZATION_REQUIRED") {
    return load.environmentDocumented
      ? { key: "environnement", level: "OK", label: "Caractérisation environnementale fournie", score: 1 }
      : { key: "environnement", level: "REVIEW", label: "Caractérisation environnementale exigée : à confirmer", score: 0.4 };
  }
  return { key: "environnement", level: "NA", label: "Aucune exigence environnementale déclarée (aucune déduction)", score: null };
}

export function evaluateTruck(load: StructuredLoad, profile: FillRequestProfile, c: PipelineCandidate): StepResult {
  const code = load.configCode;
  const allowed = profile.acceptedTruckCodes.map(norm).filter(Boolean);
  if (!code) return { key: "camion", level: "NA", label: "Type de camion non précisé", score: null };
  const isSemi = /semi/.test(norm(code));
  if (isSemi && c.access?.accepts_semi_trailer === false) {
    return { key: "camion", level: "BLOCKER", label: "Semi-remorque explicitement refusé sur le site", score: 0 };
  }
  if (!allowed.length) {
    return { key: "camion", level: "REVIEW", label: "Camions acceptés inconnus : à confirmer", score: 0.5 };
  }
  const ok = allowed.some((a) => norm(code).includes(a) || a.includes(norm(code)));
  return ok
    ? { key: "camion", level: "OK", label: `Configuration ${code} acceptée`, score: 1 }
    : { key: "camion", level: "REVIEW", label: `Configuration ${code} non listée : à confirmer`, score: 0.4 };
}

export interface CapacityEvaluation {
  step: StepResult;
  match: CapacityMatch;
  usableTrips: number | null;
  remainingAfter: number | null;
}

export function evaluateCapacity(load: StructuredLoad, profile: FillRequestProfile): CapacityEvaluation {
  const needed = load.trips;
  const cap = profile.capacity;
  if (cap.kind === "unlimited") {
    return {
      step: { key: "capacite", level: "OK", label: "Capacité déclarée illimitée", score: 1 },
      match: "TOTAL", usableTrips: needed, remainingAfter: needed != null ? 0 : null,
    };
  }
  if (cap.kind === "unknown" || cap.unit !== "voyages" || cap.value == null || needed == null) {
    return {
      step: { key: "capacite", level: "REVIEW", label: "Capacité restante inconnue : à confirmer", score: 0.5 },
      match: "INCONNUE", usableTrips: null, remainingAfter: null,
    };
  }
  const usable = Math.min(cap.value, needed);
  if (usable >= needed) {
    return {
      step: { key: "capacite", level: "OK", label: `Capacité suffisante (${needed} voyage(s))`, score: 1 },
      match: "TOTAL", usableTrips: needed, remainingAfter: 0,
    };
  }
  return {
    step: { key: "capacite", level: "REVIEW", label: `Match partiel : ${usable}/${needed} voyage(s) dirigeables`, score: 0.6 },
    match: "PARTIEL", usableTrips: usable, remainingAfter: needed - usable,
  };
}

const EARTH_RADIUS_KM = 6371;
/** Distance géodésique (Haversine) — jamais présentée comme distance routière. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export function evaluateDistance(load: StructuredLoad, c: PipelineCandidate): { step: StepResult; km: number | null; kind: DistanceKindP } {
  let km: number | null = null;
  let kind: DistanceKindP = "INCONNUE";
  if (c.distance_km != null && c.distance_kind === "ROUTIERE") {
    km = Number(c.distance_km); kind = "ROUTIERE";
  } else if (load.origin && c.latitude != null && c.longitude != null) {
    km = haversineKm(load.origin, { lat: Number(c.latitude), lng: Number(c.longitude) });
    kind = "APPROXIMATIVE";
  } else if (c.distance_km != null) {
    km = Number(c.distance_km); kind = "APPROXIMATIVE";
  }
  if (km == null) return { step: { key: "distance", level: "NA", label: "Distance inconnue", score: null }, km, kind };
  const score = km <= 10 ? 1 : km <= 25 ? 0.85 : km <= 50 ? 0.65 : km <= 100 ? 0.4 : 0.15;
  return {
    step: { key: "distance", level: "OK", label: `${km} km ${kind === "ROUTIERE" ? "routiers" : "approximatifs"}`, score },
    km, kind,
  };
}

export function evaluateFreshness(c: PipelineCandidate): { step: StepResult; state: FreshnessState } {
  const at = c.availability_confirmed_at ? Date.parse(c.availability_confirmed_at) : NaN;
  if (!Number.isFinite(at)) {
    return {
      step: { key: "fraicheur", level: "REVIEW", label: "Disponibilité jamais confirmée : à revalider", score: 0.3 },
      state: "A_REVALIDER",
    };
  }
  const days = (Date.now() - at) / 86_400_000;
  if (days <= 30) {
    return { step: { key: "fraicheur", level: "OK", label: `Disponibilité confirmée il y a ${Math.round(days)} j`, score: 1 }, state: "CONFIRMEE" };
  }
  return {
    step: { key: "fraicheur", level: "REVIEW", label: `Dernière confirmation il y a ${Math.round(days)} j : à revalider`, score: 0.5 },
    state: "A_REVALIDER",
  };
}

// ---------------- Évaluation complète d'un candidat ----------------

export function evaluateCandidateV2(
  load: StructuredLoad,
  c: PipelineCandidate,
  weights: PipelineWeights = DEFAULT_WEIGHTS,
): CandidateMatch {
  const profile = candidateToProfile(c);
  const mat = evaluateMaterialCompatibility(load.composition, profile);

  const steps: StepResult[] = [];
  const positives: string[] = [];
  const warnings: string[] = [];
  const blocking: string[] = [];
  const toConfirm: string[] = [];

  // Matériaux + restrictions + granulométrie (résultats détaillés du LOT 10).
  const sizeReasons = mat.reasons.filter((r) => r.code.startsWith("SIZE_"));
  const matReasons = mat.reasons.filter((r) => !r.code.startsWith("SIZE_"));
  for (const r of matReasons) {
    if (r.level === "OK") positives.push(r.label);
    else if (r.level === "BLOCKER") blocking.push(r.label);
    else toConfirm.push(r.label);
  }
  const matLevel = matReasons.some((r) => r.level === "BLOCKER") ? "BLOCKER"
    : matReasons.some((r) => r.level === "REVIEW") ? "REVIEW" : "OK";
  steps.push({
    key: "materiaux", level: matLevel,
    label: matLevel === "OK" ? "Toutes les composantes sont acceptées"
      : matLevel === "BLOCKER" ? "Composante refusée" : "Composante à confirmer",
    score: matLevel === "OK" ? 1 : matLevel === "REVIEW" ? 0.5 : 0,
  });
  steps.push({
    key: "restrictions",
    level: mat.refusedMaterials.length ? "BLOCKER" : profile.restrictions.length ? "OK" : "NA",
    label: mat.refusedMaterials.length ? "Restriction explicite déclenchée" : "Aucune restriction déclenchée",
    score: null,
  });

  const sizeLevel = sizeReasons.some((r) => r.level === "BLOCKER") ? "BLOCKER"
    : sizeReasons.some((r) => r.level === "REVIEW") ? "REVIEW"
      : sizeReasons.length ? "OK" : "NA";
  steps.push({
    key: "granulometrie", level: sizeLevel,
    label: sizeReasons.length ? sizeReasons.map((r) => r.label).join(" · ") : "Aucune limite de calibre déclarée",
    score: sizeLevel === "OK" ? 1 : sizeLevel === "REVIEW" ? 0.5 : sizeLevel === "BLOCKER" ? 0 : null,
  });
  for (const r of sizeReasons) {
    if (r.level === "OK") positives.push(r.label);
    else if (r.level === "BLOCKER") blocking.push(r.label);
    else toConfirm.push(r.label);
  }

  const cond = evaluateConditions(load, profile); steps.push(cond);
  const env = evaluateEnvironment(load, c); steps.push(env);
  const truck = evaluateTruck(load, profile, c); steps.push(truck);
  const cap = evaluateCapacity(load, profile); steps.push(cap.step);
  const dist = evaluateDistance(load, c); steps.push(dist.step);
  const fresh = evaluateFreshness(c); steps.push(fresh.step);

  for (const s of [cond, env, truck, cap.step, dist.step, fresh.step]) {
    if (s.level === "OK") positives.push(s.label);
    else if (s.level === "BLOCKER") blocking.push(s.label);
    else if (s.level === "REVIEW") {
      if (s.key === "fraicheur") warnings.push(s.label);
      else toConfirm.push(s.label);
    }
  }
  if (fresh.state === "A_REVALIDER" && !warnings.length) warnings.push("Disponibilité à revalider");

  // Score : moyenne pondérée des sous-scores disponibles.
  const weightOf: Record<StepKey, number> = {
    materiaux: weights.materials, restrictions: 0, granulometrie: weights.granulometry,
    conditions: weights.conditions, environnement: weights.environment, camion: weights.truck,
    capacite: weights.capacity, distance: weights.distance, fraicheur: weights.freshness,
  };
  let num = 0, den = 0;
  for (const s of steps) {
    if (s.score == null) continue;
    const w = weightOf[s.key];
    if (!w) continue;
    num += w * s.score; den += w;
  }
  const score = den ? Math.round((num / den) * 100) : 0;

  const compatibility: PipelineVerdict = blocking.length
    ? "INCOMPATIBLE"
    : toConfirm.length
      ? "POSSIBLE"
      : "COMPATIBLE";

  return {
    requestId: c.id,
    reference: c.dompe_number ?? c.submission_number ?? null,
    city: c.city ?? null,
    compatibility,
    score: compatibility === "INCOMPATIBLE" ? 0 : score,
    distanceKm: dist.km,
    distanceKind: dist.kind,
    capacityMatch: cap.match,
    usableTrips: cap.usableTrips,
    remainingTripsAfter: cap.remainingAfter,
    freshness: fresh.state,
    positiveReasons: positives,
    warnings,
    blockingReasons: blocking,
    needsConfirmation: toConfirm,
    steps,
  };
}

// ---------------- Pipeline complet ----------------

export function runMatchingPipeline(
  input: LoadInput,
  candidates: PipelineCandidate[],
  opts: { weights?: PipelineWeights; filters?: PipelineFilters } = {},
): PipelineRun {
  const load = buildLoad(input);
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const f = opts.filters ?? {};
  const requireGeo = Boolean(f.maxDistanceKm != null && load.origin);

  const exclusionReasons: Record<string, number> = {};
  const bump = (k: string) => { exclusionReasons[k] = (exclusionReasons[k] ?? 0) + 1; };

  const kept: PipelineCandidate[] = [];
  for (const c of candidates) {
    const adm = isAdmissible(c, { requireGeo });
    if (!adm.ok) { bump(adm.reason ?? "non admissible"); continue; }
    if (f.configCode && (c.truck_types_allowed ?? []).length &&
        !(c.truck_types_allowed ?? []).some((t) => norm(t).includes(norm(f.configCode)))) {
      bump("camion filtré"); continue;
    }
    kept.push(c);
  }

  let results = kept.map((c) => evaluateCandidateV2(load, c, weights));

  if (f.maxDistanceKm != null) {
    const before = results.length;
    results = results.filter((r) => r.distanceKm == null || r.distanceKm <= f.maxDistanceKm!);
    for (let i = 0; i < before - results.length; i++) bump("hors rayon");
  }
  if (f.requireRecentConfirmation) {
    const before = results.length;
    results = results.filter((r) => r.freshness === "CONFIRMEE");
    for (let i = 0; i < before - results.length; i++) bump("confirmation ancienne");
  } else if (f.includeToRevalidate === false) {
    results = results.filter((r) => r.freshness === "CONFIRMEE");
  }
  if (f.minCapacityTrips != null) {
    results = results.filter((r) => r.usableTrips == null || r.usableTrips >= f.minCapacityTrips!);
  }
  if (f.only?.length) results = results.filter((r) => f.only!.includes(r.compatibility));

  const rank: Record<PipelineVerdict, number> = { COMPATIBLE: 0, POSSIBLE: 1, INCOMPATIBLE: 2 };
  results.sort((a, b) =>
    rank[a.compatibility] - rank[b.compatibility] ||
    b.score - a.score ||
    (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

  const excluded = candidates.length - kept.length;
  return {
    version: MATCHING_PIPELINE_VERSION,
    load,
    evaluated: kept.length,
    excluded,
    exclusionReasons,
    results,
    summary: {
      compatible: results.filter((r) => r.compatibility === "COMPATIBLE").length,
      possible: results.filter((r) => r.compatibility === "POSSIBLE").length,
      incompatible: results.filter((r) => r.compatibility === "INCOMPATIBLE").length,
    },
  };
}

/** Répartition simulée d'un chargement entre plusieurs demandes (aucune affectation réelle). */
export interface SplitLine { requestId: string; reference: string | null; trips: number }
export function simulateSplit(run: PipelineRun, totalTrips: number | null): { lines: SplitLine[]; remaining: number | null } {
  if (totalTrips == null) return { lines: [], remaining: null };
  let remaining = totalTrips;
  const lines: SplitLine[] = [];
  for (const r of run.results) {
    if (remaining <= 0) break;
    if (r.compatibility === "INCOMPATIBLE") continue;
    const take = r.usableTrips == null ? remaining : Math.min(r.usableTrips, remaining);
    if (take <= 0) continue;
    lines.push({ requestId: r.requestId, reference: r.reference, trips: take });
    remaining -= take;
  }
  return { lines, remaining };
}
