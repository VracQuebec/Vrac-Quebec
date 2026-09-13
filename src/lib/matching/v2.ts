// ============================================================
// MOTEUR DE MATCHING BIDIRECTIONNEL V2 — CALCULS PURS
// ------------------------------------------------------------
// OFFRE DE MATÉRIAUX  ↔  DEMANDE DE REMBLAI
//
// Règles absolues :
//  - INTERNE / SIMULATION seulement : aucune écriture métier,
//    aucune réservation, aucune communication.
//  - Une donnée INCONNUE n'est JAMAIS transformée en NON.
//  - Seule une incompatibilité EXPLICITE exclut fortement un résultat.
//  - Aucun score brut n'est destiné au public.
// ============================================================

import { tripsForTonnes } from "@/lib/transport/capacity";
import {
  availabilityState,
  distanceOf,
  evaluateAccess,
  parseCapacityTonnes,
  type AccessEvaluation,
  type CandidateRow,
  type DistanceKind,
  type Tri,
  type VehicleProfileLite,
} from "@/lib/matching/engine";

export const MATCHING_V2_VERSION = "v2";

// ---------------- Types ----------------

export type MatchState = "CONFIRME" | "PROBABLE" | "A_CONFIRMER" | "INCOMPATIBLE";

export type MatchCategory = "EXCELLENT" | "TRES_BON" | "POSSIBLE" | "A_CONFIRMER" | "INCOMPATIBLE";

export type SizeSource = "MESURE" | "DECLARE" | "ESTIME" | "INCONNU";

export interface OfferMaterial {
  slug: string;
  label?: string | null;
  familyId?: string | null;
  /** Grosseur maximale observée, en pouces. */
  maxSizeInches?: number | null;
  sizeSource?: SizeSource;
  sharePct?: number | null;
}

export interface OfferInput {
  id: string;
  label?: string | null;
  materials: OfferMaterial[];
  quantityTonnes?: number | null;
  origin?: { lat: number; lng: number } | null;
  configCode?: string | null;
  /** Grosseur maximale globale déclarée pour l'offre (pouces). */
  maxSizeInches?: number | null;
  sizeSource?: SizeSource;
}

/** Demande de remblai enrichie (lecture seule, provenant du RPC interne). */
export interface DemandRow extends CandidateRow {
  /** Grosseur maximale acceptée (pouces), si connue. */
  max_size_inches?: number | null;
  size_source?: SizeSource | null;
}

export interface CompositionLine {
  slug: string;
  label: string;
  state: MatchState;
  reason: string;
}

export interface CompositionResult {
  lines: CompositionLine[];
  state: MatchState;
  confirmed: number;
  probable: number;
  toConfirm: number;
  incompatible: number;
  /** Refus explicite rencontré (ex. « pas de béton »). */
  explicitRefusal: string | null;
  ratio: number;
}

export interface GranulometryResult {
  state: MatchState;
  reason: string;
  offerInches: number | null;
  demandInches: number | null;
  offerSource: SizeSource;
  demandSource: SizeSource;
}

export interface CapacityResult {
  state: MatchState;
  reason: string;
  availableTonnes: number | null;
  remainingTonnes: number | null;
  /** Quantité réellement plaçable sur ce site (partial match). */
  placeableTonnes: number | null;
  partial: boolean;
}

export interface DistanceProfile {
  km: number | null;
  kind: DistanceKind;
  isApproximation: boolean;
  allerKm: number | null;
  retourKm: number | null;
  cycleKm: number | null;
  allerMinutes: number | null;
  cycleMinutes: number | null;
  source: string;
}

export interface TruckOption {
  configCode: string;
  capacityTonnes: number | null;
  trips: number | null;
  access: AccessEvaluation;
  compatible: boolean;
}

export interface SubScores {
  material_score: number;
  distance_score: number;
  capacity_score: number;
  truck_score: number;
  access_score: number;
  availability_score: number;
  data_confidence_score: number;
}

export interface Explanation {
  symbol: "✓" | "?" | "✗";
  text: string;
}

export interface MatchV2Result {
  offerId: string;
  demandId: string;
  demand: DemandRow;
  composition: CompositionResult;
  granulometry: GranulometryResult;
  capacity: CapacityResult;
  distance: DistanceProfile;
  availability: { state: Tri; label: string };
  access: AccessEvaluation;
  truckOptions: TruckOption[];
  bestTruck: TruckOption | null;
  subScores: SubScores;
  score: number;
  category: MatchCategory;
  explanations: Explanation[];
  missingData: string[];
  algorithmVersion: string;
}

export interface MatchWeights {
  material: number;
  distance: number;
  availability: number;
  access: number;
  capacity: number;
  data_quality: number;
}

export const DEFAULT_V2_WEIGHTS: MatchWeights = {
  material: 40,
  distance: 25,
  availability: 15,
  access: 10,
  capacity: 5,
  data_quality: 5,
};

/** Vitesse moyenne servant uniquement aux estimations de temps (jamais présentée comme mesurée). */
export const ESTIMATED_AVG_SPEED_KMH = 55;

// ---------------- Utilitaires ----------------

const norm = (v?: string | null) =>
  (v ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ceil = (n: number) => Math.ceil(n - 1e-9);

// ---------------- 2. Composition complète ----------------

export function matchComposition(offer: OfferInput, demand: DemandRow): CompositionResult {
  const rows = demand.accepted_materials ?? [];
  const refused = rows.filter((r) => (r.stance ?? "accepted") === "refused");
  const accepted = rows.filter((r) => (r.stance ?? "accepted") !== "refused");
  const legacy = `${norm(demand.materials)} ${norm(demand.other_material)}`.trim();

  const lines: CompositionLine[] = [];
  let explicitRefusal: string | null = null;

  for (const m of offer.materials) {
    const wanted = norm(m.slug) || norm(m.label);
    const label = m.label || m.slug;
    if (!wanted) {
      lines.push({ slug: m.slug, label, state: "A_CONFIRMER", reason: "matériau non précisé" });
      continue;
    }

    const isRefused = refused.some(
      (r) => norm(r.slug) === wanted || norm(r.name) === wanted || norm(r.original_value) === wanted,
    );
    if (isRefused) {
      explicitRefusal = label;
      lines.push({ slug: m.slug, label, state: "INCOMPATIBLE", reason: `${label} explicitement refusé` });
      continue;
    }

    const exact = accepted.find((r) => norm(r.slug) === wanted || norm(r.name) === wanted);
    if (exact) {
      const confirmed = exact.confirmation_status === "accepted" || exact.confidence === "high";
      lines.push({
        slug: m.slug,
        label,
        state: confirmed ? "CONFIRME" : "PROBABLE",
        reason: `${label} accepté`,
      });
      continue;
    }

    if (m.familyId) {
      const fam = accepted.find((r) => r.family_id && r.family_id === m.familyId);
      if (fam) {
        lines.push({ slug: m.slug, label, state: "PROBABLE", reason: `${label} : même famille acceptée` });
        continue;
      }
    }

    const histo = accepted.find((r) => norm(r.original_value) === wanted);
    if (histo) {
      lines.push({ slug: m.slug, label, state: "PROBABLE", reason: `${label} : correspondance historique` });
      continue;
    }

    const words = wanted.split(" ").filter((w) => w.length > 3);
    if (words.length && words.some((w) => legacy.includes(w))) {
      lines.push({ slug: m.slug, label, state: "A_CONFIRMER", reason: `${label} : correspondance partielle à valider` });
      continue;
    }

    // Inconnu ≠ refus.
    lines.push({ slug: m.slug, label, state: "A_CONFIRMER", reason: `${label} à confirmer` });
  }

  const confirmed = lines.filter((l) => l.state === "CONFIRME").length;
  const probable = lines.filter((l) => l.state === "PROBABLE").length;
  const toConfirm = lines.filter((l) => l.state === "A_CONFIRMER").length;
  const incompatible = lines.filter((l) => l.state === "INCOMPATIBLE").length;
  const total = lines.length || 1;
  const ratio = (confirmed + probable * 0.75 + toConfirm * 0.4) / total;

  const state: MatchState =
    incompatible > 0 ? "INCOMPATIBLE"
    : toConfirm === 0 && probable === 0 && confirmed > 0 ? "CONFIRME"
    : toConfirm === 0 ? "PROBABLE"
    : "A_CONFIRMER";

  return { lines, state, confirmed, probable, toConfirm, incompatible, explicitRefusal, ratio };
}

// ---------------- 5. Granulométrie ----------------

export function matchGranulometry(offer: OfferInput, demand: DemandRow): GranulometryResult {
  const offerInches =
    offer.maxSizeInches ??
    offer.materials.reduce<number | null>((max, m) => {
      if (m.maxSizeInches == null) return max;
      return max == null ? m.maxSizeInches : Math.max(max, m.maxSizeInches);
    }, null);
  const offerSource: SizeSource =
    offer.sizeSource ?? offer.materials.find((m) => m.maxSizeInches != null)?.sizeSource ?? (offerInches == null ? "INCONNU" : "DECLARE");
  const demandInches = demand.max_size_inches ?? null;
  const demandSource: SizeSource = (demand.size_source as SizeSource | null) ?? (demandInches == null ? "INCONNU" : "DECLARE");

  if (offerInches == null || demandInches == null) {
    return {
      state: "A_CONFIRMER",
      reason: "grosseur maximale inconnue : à confirmer",
      offerInches, demandInches, offerSource, demandSource,
    };
  }
  if (offerInches > demandInches) {
    return {
      state: "INCOMPATIBLE",
      reason: `grosseur ${offerInches} po supérieure au maximum accepté (${demandInches} po)`,
      offerInches, demandInches, offerSource, demandSource,
    };
  }
  const estimated = offerSource === "ESTIME" || demandSource === "ESTIME";
  return {
    state: estimated ? "PROBABLE" : "CONFIRME",
    reason: `grosseur ${offerInches} po ≤ maximum accepté ${demandInches} po${estimated ? " (estimation)" : ""}`,
    offerInches, demandInches, offerSource, demandSource,
  };
}

// ---------------- 6 & 7. Quantité et partial match ----------------

export function matchCapacity(offer: OfferInput, demand: DemandRow): CapacityResult {
  const available = offer.quantityTonnes ?? null;
  const remaining = parseCapacityTonnes(demand.remaining_capacity);
  if (remaining == null) {
    return {
      state: "A_CONFIRMER",
      reason: "capacité à confirmer",
      availableTonnes: available,
      remainingTonnes: null,
      placeableTonnes: available,
      partial: false,
    };
  }
  if (available == null) {
    return {
      state: "A_CONFIRMER",
      reason: `capacité restante ≈ ${remaining} t (quantité offerte inconnue)`,
      availableTonnes: null, remainingTonnes: remaining, placeableTonnes: remaining, partial: false,
    };
  }
  const placeable = Math.min(available, remaining);
  const partial = placeable < available;
  return {
    state: partial ? "PROBABLE" : "CONFIRME",
    reason: partial
      ? `capacité partielle : ${placeable} t sur ${available} t`
      : `capacité suffisante (${remaining} t disponibles)`,
    availableTonnes: available, remainingTonnes: remaining, placeableTonnes: placeable, partial,
  };
}

// ---------------- 9 & 10. Distance aller / retour / cycle ----------------

export function distanceProfile(demand: DemandRow): DistanceProfile {
  const d = distanceOf(demand);
  if (d.km == null) {
    return {
      km: null, kind: "INCONNUE", isApproximation: true,
      allerKm: null, retourKm: null, cycleKm: null,
      allerMinutes: null, cycleMinutes: null,
      source: "distance inconnue",
    };
  }
  const aller = d.km;
  const retour = d.km;
  const cycle = aller + retour;
  const minutes = (km: number) => Math.round((km / ESTIMATED_AVG_SPEED_KMH) * 60);
  return {
    km: d.km,
    kind: d.kind,
    isApproximation: d.kind !== "ROUTIERE",
    allerKm: aller,
    retourKm: retour,
    cycleKm: cycle,
    allerMinutes: minutes(aller),
    cycleMinutes: minutes(cycle),
    source: d.kind === "ROUTIERE" ? "distance routière" : "distance géodésique (approximation)",
  };
}

// ---------------- 11, 12 & 13. Camions et voyages ----------------

export function truckOptions(
  demand: DemandRow,
  vehicles: VehicleProfileLite[],
  tonnes: number | null,
): TruckOption[] {
  return vehicles.map((v) => {
    const access = evaluateAccess(v, demand.access);
    return {
      configCode: v.configCode,
      capacityTonnes: v.capacityTonnes ?? null,
      trips: tonnes != null ? tripsForTonnes(tonnes, v.capacityTonnes ?? null) : null,
      access,
      compatible: access.verdict !== "NON_ACCESSIBLE",
    };
  });
}

export function pickBestTruck(options: TruckOption[]): TruckOption | null {
  const usable = options.filter((o) => o.compatible);
  if (usable.length === 0) return null;
  const withTrips = usable.filter((o) => o.trips != null);
  const pool = withTrips.length ? withTrips : usable;
  return [...pool].sort((a, b) => {
    const rank = (o: TruckOption) => (o.access.verdict === "ACCESSIBLE" ? 0 : o.access.verdict === "PROBABLEMENT_ACCESSIBLE" ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.trips ?? Number.MAX_SAFE_INTEGER) - (b.trips ?? Number.MAX_SAFE_INTEGER);
  })[0];
}

// ---------------- 14 à 17. Score explicable ----------------

const CAT_ORDER: MatchCategory[] = ["INCOMPATIBLE", "A_CONFIRMER", "POSSIBLE", "TRES_BON", "EXCELLENT"];

export function categoryOf(score: number, composition: CompositionResult, granulometry: GranulometryResult): MatchCategory {
  if (composition.state === "INCOMPATIBLE" || granulometry.state === "INCOMPATIBLE") return "INCOMPATIBLE";
  if (score >= 85 && composition.toConfirm === 0) return "EXCELLENT";
  if (score >= 70) return "TRES_BON";
  if (score >= 50) return "POSSIBLE";
  return "A_CONFIRMER";
}

export function evaluateMatchV2(
  offer: OfferInput,
  demand: DemandRow,
  vehicles: VehicleProfileLite[],
  weights: MatchWeights = DEFAULT_V2_WEIGHTS,
): MatchV2Result {
  const composition = matchComposition(offer, demand);
  const granulometry = matchGranulometry(offer, demand);
  const capacity = matchCapacity(offer, demand);
  const distance = distanceProfile(demand);
  const availability = availabilityState(demand);

  const requested = offer.configCode ? vehicles.filter((v) => v.configCode === offer.configCode) : vehicles;
  const pool = requested.length ? requested : vehicles;
  const options = truckOptions(demand, pool, offer.quantityTonnes ?? null);
  const bestTruck = pickBestTruck(options);
  const access = bestTruck?.access ?? evaluateAccess(pool[0] ?? null, demand.access);

  const missingData: string[] = [];
  if (composition.toConfirm > 0) missingData.push("matériaux à confirmer");
  if (granulometry.state === "A_CONFIRMER") missingData.push("grosseur maximale");
  if (capacity.remainingTonnes == null) missingData.push("capacité restante");
  if (distance.km == null) missingData.push("localisation / distance");
  if (availability.state === "INCONNU") missingData.push("disponibilité");
  for (const m of access.missing) if (!missingData.includes(m)) missingData.push(m);

  // Sous-scores (bornés par les poids configurables).
  const material_score = composition.state === "INCOMPATIBLE" ? 0 : weights.material * Math.min(1, composition.ratio);
  const distance_score = distance.km == null
    ? weights.distance * 0.3
    : weights.distance * Math.max(0, 1 - Math.min(distance.km, 150) / 150);
  const availability_score =
    availability.state === "OUI" ? weights.availability
    : availability.state === "INCONNU" ? weights.availability * 0.5
    : 0;
  const access_score =
    access.verdict === "ACCESSIBLE" ? weights.access
    : access.verdict === "PROBABLEMENT_ACCESSIBLE" ? weights.access * 0.7
    : access.verdict === "A_VALIDER" ? weights.access * 0.4
    : 0;
  const capacity_score =
    capacity.state === "CONFIRME" ? weights.capacity
    : capacity.state === "PROBABLE" ? weights.capacity * 0.7
    : weights.capacity * 0.4;
  const truck_score = bestTruck ? (bestTruck.access.verdict === "ACCESSIBLE" ? weights.access * 0.5 : weights.access * 0.25) : 0;
  const data_confidence_score = weights.data_quality * Math.max(0, 1 - Math.min(missingData.length, 5) / 5);

  const granPenalty = granulometry.state === "INCOMPATIBLE" ? 1 : granulometry.state === "A_CONFIRMER" ? 0.9 : 1;

  const subScores: SubScores = {
    material_score: Math.round(material_score),
    distance_score: Math.round(distance_score),
    capacity_score: Math.round(capacity_score),
    truck_score: Math.round(truck_score),
    access_score: Math.round(access_score),
    availability_score: Math.round(availability_score),
    data_confidence_score: Math.round(data_confidence_score),
  };

  const raw =
    (material_score + distance_score + capacity_score + truck_score + access_score + availability_score + data_confidence_score) *
    granPenalty;
  const score = composition.state === "INCOMPATIBLE" || granulometry.state === "INCOMPATIBLE" ? Math.round(raw * 0.1) : Math.round(raw);

  const explanations: Explanation[] = [];
  for (const l of composition.lines) {
    explanations.push({
      symbol: l.state === "CONFIRME" || l.state === "PROBABLE" ? "✓" : l.state === "A_CONFIRMER" ? "?" : "✗",
      text: l.reason,
    });
  }
  explanations.push({
    symbol: granulometry.state === "INCOMPATIBLE" ? "✗" : granulometry.state === "A_CONFIRMER" ? "?" : "✓",
    text: granulometry.reason,
  });
  explanations.push({
    symbol: capacity.state === "A_CONFIRMER" ? "?" : "✓",
    text: capacity.reason,
  });
  explanations.push({
    symbol: distance.km == null ? "?" : "✓",
    text: distance.km == null ? "distance inconnue" : `${distance.km.toFixed(1)} km (${distance.source})`,
  });
  explanations.push({
    symbol: bestTruck ? (bestTruck.access.verdict === "ACCESSIBLE" ? "✓" : "?") : "✗",
    text: bestTruck
      ? `${bestTruck.configCode.replace(/_/g, " ")} : ${bestTruck.access.verdict.replace(/_/g, " ").toLowerCase()}${bestTruck.trips ? ` · ≈ ${bestTruck.trips} voyage(s)` : ""}`
      : "aucun camion compatible identifié",
  });
  explanations.push({
    symbol: availability.state === "OUI" ? "✓" : availability.state === "INCONNU" ? "?" : "✗",
    text: availability.label,
  });

  return {
    offerId: offer.id,
    demandId: demand.id,
    demand,
    composition,
    granulometry,
    capacity,
    distance,
    availability,
    access,
    truckOptions: options,
    bestTruck,
    subScores,
    score,
    category: categoryOf(score, composition, granulometry),
    explanations,
    missingData,
    algorithmVersion: MATCHING_V2_VERSION,
  };
}

// ---------------- 1. Matching dans les deux directions ----------------

/** OFFRE → DEMANDES DE REMBLAI. */
export function matchOfferToDemands(
  offer: OfferInput,
  demands: DemandRow[],
  vehicles: VehicleProfileLite[],
  weights: MatchWeights = DEFAULT_V2_WEIGHTS,
): MatchV2Result[] {
  return demands
    .map((d) => evaluateMatchV2(offer, d, vehicles, weights))
    .filter((r) => r.availability.state !== "NON")
    .sort((a, b) => b.score - a.score);
}

/** DEMANDE DE REMBLAI → OFFRES DE MATÉRIAUX (même moteur, même taxonomie). */
export function matchDemandToOffers(
  demand: DemandRow,
  offers: OfferInput[],
  vehicles: VehicleProfileLite[],
  weights: MatchWeights = DEFAULT_V2_WEIGHTS,
): MatchV2Result[] {
  return offers
    .map((o) => evaluateMatchV2(o, demand, vehicles, weights))
    .sort((a, b) => b.score - a.score);
}

// ---------------- 8. Optimisation multi-remblai ----------------

export interface DistributionLine {
  demandId: string;
  label: string;
  tonnes: number;
  trips: number | null;
  category: MatchCategory;
  km: number | null;
}

export interface DistributionOption {
  key: "A" | "B" | "C";
  sites: number;
  lines: DistributionLine[];
  allocated: number;
  unallocated: number;
  totalTrips: number | null;
  note: string;
}

export function planDistributionOptions(
  totalTonnes: number,
  results: MatchV2Result[],
  capacityPerTripTonnes: number | null,
): DistributionOption[] {
  const usable = results.filter((r) => r.category !== "INCOMPATIBLE");
  const build = (key: "A" | "B" | "C", maxSites: number): DistributionOption => {
    let left = totalTonnes > 0 ? totalTonnes : 0;
    const lines: DistributionLine[] = [];
    for (const r of usable) {
      if (lines.length >= maxSites || left <= 0) break;
      const cap = r.capacity.remainingTonnes;
      const take = cap == null ? left : Math.min(cap, left);
      if (take <= 0) continue;
      left -= take;
      lines.push({
        demandId: r.demandId,
        label: r.demand.dompe_number || r.demand.submission_number || r.demandId,
        tonnes: take,
        trips: capacityPerTripTonnes ? ceil(take / capacityPerTripTonnes) : null,
        category: r.category,
        km: r.distance.km,
      });
    }
    const totalTrips = lines.every((l) => l.trips != null)
      ? lines.reduce((s, l) => s + (l.trips ?? 0), 0)
      : null;
    return {
      key,
      sites: lines.length,
      lines,
      allocated: totalTonnes - left,
      unallocated: left,
      totalTrips: lines.length ? totalTrips : null,
      note: "Simulation : aucune réservation, aucune capacité modifiée.",
    };
  };
  return [build("A", 1), build("B", 2), build("C", 3)];
}

// ---------------- 18 & 19. Matrice de matching ----------------

export interface MatrixCell {
  offerId: string;
  demandId: string;
  category: MatchCategory;
  score: number;
  result: MatchV2Result;
}

export function buildMatchingMatrix(
  offers: OfferInput[],
  demands: DemandRow[],
  vehicles: VehicleProfileLite[],
  weights: MatchWeights = DEFAULT_V2_WEIGHTS,
): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const o of offers) {
    for (const d of demands) {
      const r = evaluateMatchV2(o, d, vehicles, weights);
      cells.push({ offerId: o.id, demandId: d.id, category: r.category, score: r.score, result: r });
    }
  }
  return cells;
}

export function matrixSummary(cells: MatrixCell[]): Record<MatchCategory, number> {
  const out: Record<MatchCategory, number> = {
    EXCELLENT: 0, TRES_BON: 0, POSSIBLE: 0, A_CONFIRMER: 0, INCOMPATIBLE: 0,
  };
  for (const c of cells) out[c.category] += 1;
  return out;
}

// ---------------- 20 & 21. Opportunités cachées et valeur de la donnée ----------------

export interface HiddenOpportunity {
  missingField: string;
  question: string;
  blockedMatches: number;
  demandIds: string[];
  /** Valeur estimée de l'information manquante (nombre de matches potentiellement débloqués). */
  value: number;
}

const FIELD_QUESTIONS: Record<string, string> = {
  "grosseur maximale": "Quelle grosseur maximale de pierre acceptez-vous ?",
  "capacité restante": "Quelle capacité reste-t-il encore sur le site ?",
  "matériaux à confirmer": "Acceptez-vous aussi ces matériaux ?",
  "disponibilité": "Le site reçoit-il encore du matériel actuellement ?",
  "type de camion accepté": "Est-ce que les semi-remorques peuvent entrer ?",
  "largeur d'accès": "Quelle est la largeur de l'entrée du site ?",
  "hauteur libre": "Y a-t-il une limite de hauteur à l'entrée ?",
  "contraintes d'accès": "Quels camions peuvent entrer sur le site ?",
  "longueur maximale pratique": "Quelle longueur de camion peut manœuvrer sur le site ?",
  "localisation / distance": "Où se situe exactement le site ?",
};

export function hiddenOpportunities(cells: MatrixCell[]): HiddenOpportunity[] {
  const map = new Map<string, { count: number; demands: Set<string> }>();
  for (const c of cells) {
    if (c.category === "INCOMPATIBLE" || c.category === "EXCELLENT") continue;
    for (const field of c.result.missingData) {
      const entry = map.get(field) ?? { count: 0, demands: new Set<string>() };
      entry.count += 1;
      entry.demands.add(c.demandId);
      map.set(field, entry);
    }
  }
  return [...map.entries()]
    .map(([missingField, e]) => ({
      missingField,
      question: FIELD_QUESTIONS[missingField] ?? `Information manquante : ${missingField}`,
      blockedMatches: e.count,
      demandIds: [...e.demands],
      value: e.count,
    }))
    .sort((a, b) => b.value - a.value);
}

/** 22. Une seule question prioritaire par demande. */
export function recommendedQuestion(results: MatchV2Result[], demandId: string): { question: string; field: string } | null {
  const rows = results.filter((r) => r.demandId === demandId);
  const counts = new Map<string, number>();
  for (const r of rows) for (const f of r.missingData) counts.set(f, (counts.get(f) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  return { field: best[0], question: FIELD_QUESTIONS[best[0]] ?? `Information manquante : ${best[0]}` };
}

// ---------------- 24. Demandes sous-exploitées ----------------

export interface UnderusedDemand {
  demandId: string;
  label: string;
  acceptedCount: number;
  potentialMaterials: string[];
  note: string;
}

export function underusedDemands(demands: DemandRow[], threshold = 2): UnderusedDemand[] {
  const out: UnderusedDemand[] = [];
  for (const d of demands) {
    const accepted = (d.accepted_materials ?? []).filter((m) => (m.stance ?? "accepted") !== "refused");
    if (accepted.length > threshold) continue;
    const legacy = `${d.materials ?? ""} ${d.other_material ?? ""}`.toLowerCase();
    const potential: string[] = [];
    const hints: [RegExp, string][] = [
      [/sabl/, "terre sablonneuse"],
      [/glaise|argil/, "glaise"],
      [/pierre|roche|caillou/, "petites pierres"],
      [/terre/, "sable terreux"],
      [/gravier/, "gravier"],
    ];
    for (const [re, label] of hints) {
      if (re.test(legacy) && !accepted.some((a) => (a.name ?? a.slug ?? "").toLowerCase().includes(label.split(" ")[0]))) {
        potential.push(label);
      }
    }
    if (potential.length === 0) continue;
    out.push({
      demandId: d.id,
      label: d.dompe_number || d.submission_number || d.id,
      acceptedCount: accepted.length,
      potentialMaterials: potential,
      note: "Potentiel d'élargissement — aucune modification automatique.",
    });
  }
  return out;
}

// ---------------- 25. Offres sans match ----------------

export interface OfferWithoutMatch {
  offerId: string;
  label: string;
  reason: string;
  blockedBy: string[];
}

export function offersWithoutMatch(offers: OfferInput[], cells: MatrixCell[]): OfferWithoutMatch[] {
  return offers
    .filter((o) => !cells.some((c) => c.offerId === o.id && c.category !== "INCOMPATIBLE"))
    .map((o) => {
      const mine = cells.filter((c) => c.offerId === o.id);
      const reasons = new Set<string>();
      for (const c of mine) {
        if (c.result.granulometry.state === "INCOMPATIBLE") reasons.add("grosseur trop grande");
        if (c.result.composition.explicitRefusal) reasons.add(`refus explicite : ${c.result.composition.explicitRefusal}`);
        if (c.result.composition.state === "INCOMPATIBLE") reasons.add("matériaux refusés");
      }
      return {
        offerId: o.id,
        label: o.label || o.id,
        reason: mine.length === 0 ? "aucune demande analysée" : "aucune demande compatible trouvée",
        blockedBy: [...reasons],
      };
    });
}

// ---------------- 26. Analytics réseau ----------------

export interface NetworkAnalytics {
  offersCount: number;
  demandsCount: number;
  tonnesAvailable: number | null;
  tonnesSought: number | null;
  topOfferedMaterials: { label: string; count: number }[];
  topSoughtMaterials: { label: string; count: number }[];
  surplusRegions: { region: string; tonnes: number }[];
  shortageRegions: { region: string; demands: number }[];
  potentialMatches: number;
  underusedDemands: number;
  offersWithoutSolution: number;
  disclaimer: string;
}

export function networkAnalytics(
  offers: OfferInput[],
  demands: DemandRow[],
  cells: MatrixCell[],
): NetworkAnalytics {
  const tonnesAvailable = offers.reduce<number | null>((s, o) => (o.quantityTonnes == null ? s : (s ?? 0) + o.quantityTonnes), null);
  const tonnesSought = demands.reduce<number | null>((s, d) => {
    const t = parseCapacityTonnes(d.remaining_capacity);
    return t == null ? s : (s ?? 0) + t;
  }, null);

  const count = (pairs: string[]) => {
    const m = new Map<string, number>();
    for (const p of pairs) m.set(p, (m.get(p) ?? 0) + 1);
    return [...m.entries()].map(([label, c]) => ({ label, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const offered = count(offers.flatMap((o) => o.materials.map((m) => m.label || m.slug)));
  const sought = count(
    demands.flatMap((d) => (d.accepted_materials ?? [])
      .filter((m) => (m.stance ?? "accepted") !== "refused")
      .map((m) => m.name ?? m.slug ?? "inconnu")),
  );

  const surplus = new Map<string, number>();
  for (const o of offers) {
    const region = o.origin ? `${o.origin.lat.toFixed(1)}/${o.origin.lng.toFixed(1)}` : "région inconnue";
    surplus.set(region, (surplus.get(region) ?? 0) + (o.quantityTonnes ?? 0));
  }
  const shortage = new Map<string, number>();
  for (const d of demands) {
    const region = d.city || "ville inconnue";
    const has = cells.some((c) => c.demandId === d.id && c.category !== "INCOMPATIBLE");
    if (!has) shortage.set(region, (shortage.get(region) ?? 0) + 1);
  }

  return {
    offersCount: offers.length,
    demandsCount: demands.length,
    tonnesAvailable,
    tonnesSought,
    topOfferedMaterials: offered,
    topSoughtMaterials: sought,
    surplusRegions: [...surplus.entries()].map(([region, tonnes]) => ({ region, tonnes })).sort((a, b) => b.tonnes - a.tonnes).slice(0, 10),
    shortageRegions: [...shortage.entries()].map(([region, d]) => ({ region, demands: d })).sort((a, b) => b.demands - a.demands).slice(0, 10),
    potentialMatches: cells.filter((c) => c.category !== "INCOMPATIBLE").length,
    underusedDemands: underusedDemands(demands).length,
    offersWithoutSolution: offersWithoutMatch(offers, cells).length,
    disclaimer: "Estimations internes : ces chiffres ne sont pas des mesures exactes.",
  };
}

export const categoryLabel = (c: MatchCategory): string =>
  c === "EXCELLENT" ? "Excellent match"
  : c === "TRES_BON" ? "Très bon match"
  : c === "POSSIBLE" ? "Match possible"
  : c === "A_CONFIRMER" ? "À confirmer"
  : "Incompatible";

export const categoryRank = (c: MatchCategory): number => CAT_ORDER.indexOf(c);
