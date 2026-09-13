// ============================================================
// MOTEUR DE MATCHING INTERNE V1 — CALCULS PURS
// ------------------------------------------------------------
// Règles absolues :
//  - INACTIF publiquement (flag `matching_v2_enabled_public`).
//  - Lecture / simulation seulement : aucune écriture métier.
//  - Une donnée INCONNUE n'est jamais traitée comme un NON.
//  - Aucune compatibilité environnementale/réglementaire inventée.
// ============================================================

import { cubicYardsToM3, volumeToTonnes, tripsForTonnes, type MaterialDensity } from "@/lib/transport/capacity";

export const MATCHING_ALGORITHM_VERSION = "v1";

// ---------- Types de base ----------

export type Tri = "OUI" | "NON" | "INCONNU";

export type MaterialMatchKind =
  | "MATCH_EXACT"
  | "MATCH_FAMILLE"
  | "MATCH_HISTORIQUE"
  | "MATCH_PROBABLE"
  | "A_VALIDER"
  | "INCOMPATIBLE";

export type Compatibility =
  | "COMPATIBLE_CONFIRME"
  | "COMPATIBLE_PROBABLE"
  | "A_VALIDER"
  | "INCOMPATIBLE";

export type Confidence = "ELEVEE" | "MOYENNE" | "FAIBLE" | "A_VALIDER";

export type AccessVerdict =
  | "ACCESSIBLE"
  | "PROBABLEMENT_ACCESSIBLE"
  | "A_VALIDER"
  | "NON_ACCESSIBLE";

export type DistanceKind = "ROUTIERE" | "GEODESIQUE" | "ESTIMEE" | "INCONNUE";

export type QuantityUnit = "tonnes" | "tonnes_metriques" | "m3" | "verges3";

export interface MatchingQuery {
  materialSlug?: string | null;
  materialLabel?: string | null;
  materialFamilyId?: string | null;
  quantity?: number | null;
  unit?: QuantityUnit;
  origin?: { lat: number; lng: number } | null;
  configCode?: string | null;
  density?: MaterialDensity | null;
  /** Capacité retenue du camion, en tonnes (charge utile ou capacité opérationnelle). */
  truckCapacityTonnes?: number | null;
}

export interface AcceptedMaterialRow {
  material_id?: string | null;
  slug?: string | null;
  name?: string | null;
  family_id?: string | null;
  family?: string | null;
  subfamily?: string | null;
  stance?: string | null;
  source?: string | null;
  confidence?: string | null;
  confirmation_status?: string | null;
  original_value?: string | null;
}

export interface AccessRow {
  access_width_m?: number | null;
  clear_height_m?: number | null;
  max_practical_length_m?: number | null;
  maneuvering_space_m2?: number | null;
  turning_radius_m?: number | null;
  slope_percent?: number | null;
  surface_type?: string | null;
  weight_restriction_kg?: number | null;
  narrow_entrance?: boolean | null;
  bridge_or_culvert?: boolean | null;
  overhead_obstacles?: boolean | null;
  gate?: boolean | null;
  gate_width_m?: number | null;
  backing_required?: boolean | null;
  turnaround_space?: boolean | null;
  accepts_semi_trailer?: boolean | null;
  accepts_12_roues?: boolean | null;
  accepts_10_roues?: boolean | null;
  accepts_6_roues?: boolean | null;
  driver_access_notes?: string | null;
}

export interface CandidateRow {
  id: string;
  dompe_number?: string | null;
  submission_number?: string | null;
  city?: string | null;
  address?: string | null;
  status?: string | null;
  availability_status?: string | null;
  materials?: string | null;
  other_material?: string | null;
  remaining_capacity?: string | null;
  truck_types_allowed?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  distance_kind?: string | null;
  accepted_materials?: AcceptedMaterialRow[] | null;
  access?: AccessRow | null;
}

export interface VehicleProfileLite {
  configCode: string;
  capacityTonnes?: number | null;
  overallLengthM?: number | null;
  mirrorToMirrorWidthM?: number | null;
  overallHeightM?: number | null;
  turningRadiusM?: number | null;
  groundClearanceM?: number | null;
  grossMassKg?: number | null;
}

// ---------- Marges de sécurité (règles opérationnelles Vrac Québec) ----------
export const OPERATIONAL_MARGINS = {
  widthMarginM: 0.5,
  heightMarginM: 0.3,
  lengthMarginM: 1.0,
  isRegulatory: false as const,
};

// ---------- ÉTAPE 1 — matériau ----------

const norm = (v?: string | null) =>
  (v ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface MaterialMatch {
  kind: MaterialMatchKind;
  compatibility: Compatibility;
  reason: string;
  matched?: AcceptedMaterialRow | null;
}

export function matchMaterial(query: MatchingQuery, candidate: CandidateRow): MaterialMatch {
  const wanted = norm(query.materialSlug) || norm(query.materialLabel);
  if (!wanted) {
    return {
      kind: "A_VALIDER",
      compatibility: "A_VALIDER",
      reason: "Matériau à évacuer non précisé : compatibilité à valider.",
      matched: null,
    };
  }

  const rows = candidate.accepted_materials ?? [];
  const refused = rows.filter((r) => (r.stance ?? "accepted") === "refused");
  const accepted = rows.filter((r) => (r.stance ?? "accepted") !== "refused");

  const isRefused = refused.some(
    (r) => norm(r.slug) === wanted || norm(r.name) === wanted || norm(r.original_value) === wanted,
  );
  if (isRefused) {
    return {
      kind: "INCOMPATIBLE",
      compatibility: "INCOMPATIBLE",
      reason: "Ce matériau est explicitement refusé par la demande.",
      matched: null,
    };
  }

  const exact = accepted.find((r) => norm(r.slug) === wanted || norm(r.name) === wanted);
  if (exact) {
    const confirmed = exact.confirmation_status === "accepted" || exact.confidence === "high";
    return {
      kind: "MATCH_EXACT",
      compatibility: confirmed ? "COMPATIBLE_CONFIRME" : "COMPATIBLE_PROBABLE",
      reason: `Matériau accepté (${exact.name ?? exact.slug}).`,
      matched: exact,
    };
  }

  if (query.materialFamilyId) {
    const fam = accepted.find((r) => r.family_id && r.family_id === query.materialFamilyId);
    if (fam) {
      return {
        kind: "MATCH_FAMILLE",
        compatibility: "COMPATIBLE_PROBABLE",
        reason: `Même famille de matériaux (${fam.family ?? fam.name ?? "famille"}).`,
        matched: fam,
      };
    }
  }

  const histo = accepted.find((r) => norm(r.original_value) === wanted);
  if (histo) {
    return {
      kind: "MATCH_HISTORIQUE",
      compatibility: "COMPATIBLE_PROBABLE",
      reason: "Correspondance avec la valeur historique enregistrée.",
      matched: histo,
    };
  }

  const legacy = norm(candidate.materials) + " " + norm(candidate.other_material);
  const words = wanted.split(" ").filter((w) => w.length > 3);
  if (words.length && words.some((w) => legacy.includes(w))) {
    return {
      kind: "MATCH_PROBABLE",
      compatibility: "A_VALIDER",
      reason: "Correspondance partielle avec l'ancienne catégorie : à valider.",
      matched: null,
    };
  }

  if (rows.length === 0 && !candidate.materials) {
    return {
      kind: "A_VALIDER",
      compatibility: "A_VALIDER",
      reason: "Aucun matériau renseigné pour cette demande : à valider.",
      matched: null,
    };
  }

  return {
    kind: "INCOMPATIBLE",
    compatibility: "INCOMPATIBLE",
    reason: "Aucune correspondance de matériau trouvée.",
    matched: null,
  };
}

// ---------- ÉTAPE 2 — disponibilité ----------

export function availabilityState(candidate: CandidateRow): { state: Tri; label: string } {
  const st = (candidate.availability_status ?? "").toLowerCase();
  if (st === "lost" || st === "archived" || st === "unavailable") {
    return { state: "NON", label: "Demande non disponible." };
  }
  if (st === "available") return { state: "OUI", label: "Marquée disponible (à revalider)." };
  return { state: "INCONNU", label: "Disponibilité inconnue : à confirmer." };
}

// ---------- ÉTAPE 3 — distance ----------

export function distanceOf(candidate: CandidateRow): { km: number | null; kind: DistanceKind } {
  const km = candidate.distance_km ?? null;
  const kind = (candidate.distance_kind as DistanceKind) ?? "INCONNUE";
  if (km == null) return { km: null, kind: "INCONNUE" };
  return { km, kind: kind === "INCONNUE" ? "ESTIMEE" : kind };
}

// ---------- ÉTAPES 4 & 5 — camion et accessibilité ----------

const ACCEPT_FIELD: Record<string, keyof AccessRow> = {
  porteur_6_roues: "accepts_6_roues",
  porteur_10_roues: "accepts_10_roues",
  porteur_12_roues: "accepts_12_roues",
  semi_2_essieux: "accepts_semi_trailer",
  semi_3_essieux: "accepts_semi_trailer",
  semi_4_essieux: "accepts_semi_trailer",
};

export interface AccessEvaluation {
  verdict: AccessVerdict;
  reasons: string[];
  warnings: string[];
  missing: string[];
}

export function evaluateAccess(
  vehicle: VehicleProfileLite | null,
  access: AccessRow | null | undefined,
): AccessEvaluation {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const missing: string[] = [];

  if (!vehicle) {
    return { verdict: "A_VALIDER", reasons: [], warnings: ["Aucun camion sélectionné."], missing: [] };
  }
  if (!access) {
    return {
      verdict: "A_VALIDER",
      reasons: [],
      warnings: ["Contraintes d'accès non renseignées : à valider sur place."],
      missing: ["contraintes d'accès"],
    };
  }

  let blocked = false;

  const acceptField = ACCEPT_FIELD[vehicle.configCode];
  const accepts = acceptField ? (access[acceptField] as boolean | null | undefined) : undefined;
  if (accepts === false) {
    blocked = true;
    reasons.push("Ce type de camion est refusé par la demande.");
  } else if (accepts === true) {
    reasons.push("Type de camion accepté.");
  } else {
    missing.push("type de camion accepté");
    warnings.push("Acceptation de ce type de camion inconnue : à confirmer.");
  }

  const w = vehicle.mirrorToMirrorWidthM;
  if (access.access_width_m != null && w != null) {
    if (access.access_width_m < w) {
      blocked = true;
      reasons.push(`Largeur d'accès ${access.access_width_m} m < largeur miroir-à-miroir ${w} m.`);
    } else if (access.access_width_m < w + OPERATIONAL_MARGINS.widthMarginM) {
      warnings.push("Largeur d'accès serrée (marge opérationnelle non respectée).");
    } else {
      reasons.push("Largeur d'accès suffisante.");
    }
  } else if (access.access_width_m == null) {
    missing.push("largeur d'accès");
    warnings.push("Largeur d'accès non renseignée.");
  }

  const h = vehicle.overallHeightM;
  if (access.clear_height_m != null && h != null) {
    if (access.clear_height_m < h) {
      blocked = true;
      reasons.push(`Hauteur libre ${access.clear_height_m} m < hauteur du véhicule ${h} m.`);
    } else if (access.clear_height_m < h + OPERATIONAL_MARGINS.heightMarginM) {
      warnings.push("Hauteur libre serrée (marge opérationnelle non respectée).");
    } else {
      reasons.push("Hauteur libre suffisante.");
    }
  } else if (access.clear_height_m == null) {
    missing.push("hauteur libre");
  }

  const l = vehicle.overallLengthM;
  if (access.max_practical_length_m != null && l != null) {
    if (access.max_practical_length_m < l) {
      blocked = true;
      reasons.push("Longueur du véhicule supérieure à la longueur pratique du site.");
    }
  } else if (access.max_practical_length_m == null) {
    missing.push("longueur maximale pratique");
  }

  if (access.turning_radius_m != null && vehicle.turningRadiusM != null &&
      access.turning_radius_m < vehicle.turningRadiusM) {
    warnings.push("Rayon de virage du site inférieur à celui du véhicule : à valider.");
  }

  if (access.weight_restriction_kg != null && vehicle.grossMassKg != null &&
      access.weight_restriction_kg < vehicle.grossMassKg) {
    blocked = true;
    reasons.push("Restriction de poids inférieure à la masse du véhicule chargé.");
  }

  if (access.overhead_obstacles) warnings.push("Obstacles en hauteur signalés.");
  if (access.backing_required) warnings.push("Accès en reculon nécessaire.");
  if (access.narrow_entrance) warnings.push("Entrée étroite signalée.");
  if (access.bridge_or_culvert) warnings.push("Pont/ponceau sur le chemin d'accès.");

  if (blocked) return { verdict: "NON_ACCESSIBLE", reasons, warnings, missing };
  if (missing.length > 0) {
    return {
      verdict: reasons.length > 0 ? "PROBABLEMENT_ACCESSIBLE" : "A_VALIDER",
      reasons,
      warnings,
      missing,
    };
  }
  return { verdict: warnings.length ? "PROBABLEMENT_ACCESSIBLE" : "ACCESSIBLE", reasons, warnings, missing };
}

// ---------- ÉTAPE 6 — quantité et voyages ----------

export interface QuantityResult {
  tonnes: number | null;
  isEstimate: boolean;
  note: string | null;
  trips: number | null;
  capacityPerTripTonnes: number | null;
}

export function resolveQuantityTonnes(query: MatchingQuery): {
  tonnes: number | null;
  isEstimate: boolean;
  note: string | null;
} {
  const q = query.quantity;
  if (q == null || !(q > 0)) return { tonnes: null, isEstimate: false, note: null };
  const unit = query.unit ?? "tonnes";
  if (unit === "tonnes" || unit === "tonnes_metriques") {
    return { tonnes: q, isEstimate: false, note: null };
  }
  const m3 = unit === "verges3" ? cubicYardsToM3(q) : q;
  const conv = volumeToTonnes(m3, query.density ?? null);
  return { tonnes: conv.tonnes, isEstimate: true, note: conv.note };
}

export function computeQuantity(query: MatchingQuery): QuantityResult {
  const { tonnes, isEstimate, note } = resolveQuantityTonnes(query);
  const cap = query.truckCapacityTonnes ?? null;
  return {
    tonnes,
    isEstimate,
    note,
    capacityPerTripTonnes: cap,
    trips: tonnes != null ? tripsForTonnes(tonnes, cap) : null,
  };
}

// ---------- ÉTAPES 8 & 9 — score explicable et confiance ----------

export interface ScoreFactor {
  label: string;
  points: number;
  status: "ok" | "warn" | "info";
}

export interface MatchResult {
  candidate: CandidateRow;
  material: MaterialMatch;
  availability: { state: Tri; label: string };
  distance: { km: number | null; kind: DistanceKind };
  access: AccessEvaluation;
  quantity: QuantityResult;
  score: number;
  factors: ScoreFactor[];
  warnings: string[];
  missingData: string[];
  confidence: Confidence;
}

const DEFAULT_WEIGHTS = { material: 40, distance: 25, availability: 15, access: 10, capacity: 5, data_quality: 5 };

export function evaluateCandidate(
  query: MatchingQuery,
  candidate: CandidateRow,
  vehicle: VehicleProfileLite | null,
  weights: typeof DEFAULT_WEIGHTS = DEFAULT_WEIGHTS,
): MatchResult {
  const material = matchMaterial(query, candidate);
  const availability = availabilityState(candidate);
  const distance = distanceOf(candidate);
  const access = evaluateAccess(vehicle, candidate.access);
  const quantity = computeQuantity({ ...query, truckCapacityTonnes: vehicle?.capacityTonnes ?? query.truckCapacityTonnes });

  const factors: ScoreFactor[] = [];
  const warnings: string[] = [...access.warnings];
  const missingData: string[] = [...access.missing];

  // Matériau
  const matPoints =
    material.compatibility === "COMPATIBLE_CONFIRME" ? weights.material
    : material.compatibility === "COMPATIBLE_PROBABLE" ? weights.material * 0.7
    : material.compatibility === "A_VALIDER" ? weights.material * 0.4
    : 0;
  factors.push({
    label: material.reason,
    points: Math.round(matPoints),
    status: material.compatibility === "COMPATIBLE_CONFIRME" ? "ok"
      : material.compatibility === "INCOMPATIBLE" ? "warn" : "info",
  });
  if (material.compatibility === "A_VALIDER") missingData.push("matériau à valider");

  // Distance
  let distPoints = 0;
  if (distance.km == null) {
    missingData.push("localisation / distance");
    factors.push({ label: "Distance inconnue", points: 0, status: "warn" });
  } else {
    distPoints = Math.max(0, weights.distance * (1 - Math.min(distance.km, 150) / 150));
    factors.push({
      label: `${distance.km.toFixed(1)} km (${distance.kind.toLowerCase()})`,
      points: Math.round(distPoints),
      status: "ok",
    });
  }

  // Disponibilité
  const availPoints =
    availability.state === "OUI" ? weights.availability
    : availability.state === "INCONNU" ? weights.availability * 0.5
    : 0;
  factors.push({
    label: availability.label,
    points: Math.round(availPoints),
    status: availability.state === "OUI" ? "ok" : availability.state === "NON" ? "warn" : "info",
  });
  if (availability.state === "INCONNU") missingData.push("disponibilité à confirmer");

  // Accessibilité
  const accessPoints =
    access.verdict === "ACCESSIBLE" ? weights.access
    : access.verdict === "PROBABLEMENT_ACCESSIBLE" ? weights.access * 0.7
    : access.verdict === "A_VALIDER" ? weights.access * 0.4
    : 0;
  factors.push({
    label: `Accessibilité : ${access.verdict.replace(/_/g, " ").toLowerCase()}`,
    points: Math.round(accessPoints),
    status: access.verdict === "ACCESSIBLE" ? "ok" : access.verdict === "NON_ACCESSIBLE" ? "warn" : "info",
  });

  // Capacité restante
  let capPoints = 0;
  const remaining = parseCapacityTonnes(candidate.remaining_capacity);
  if (remaining == null) {
    missingData.push("capacité restante inconnue");
    factors.push({ label: "Capacité restante inconnue", points: 0, status: "warn" });
  } else {
    capPoints = weights.capacity;
    factors.push({ label: `Capacité restante ≈ ${remaining} t`, points: capPoints, status: "ok" });
  }

  // Qualité des données
  const dataPoints = Math.max(0, weights.data_quality * (1 - Math.min(missingData.length, 5) / 5));
  factors.push({ label: `Qualité des données (${missingData.length} donnée(s) manquante(s))`, points: Math.round(dataPoints), status: missingData.length ? "info" : "ok" });

  const score = Math.round(matPoints + distPoints + availPoints + accessPoints + capPoints + dataPoints);

  const confidence: Confidence =
    material.compatibility === "COMPATIBLE_CONFIRME" && missingData.length === 0 ? "ELEVEE"
    : material.compatibility === "INCOMPATIBLE" ? "FAIBLE"
    : missingData.length <= 2 ? "MOYENNE"
    : "A_VALIDER";

  if (material.compatibility === "A_VALIDER") warnings.push("Matériau historique ambigu : à valider.");
  if (availability.state === "INCONNU") warnings.push("Disponibilité à confirmer.");
  if (remaining == null) warnings.push("Capacité restante à confirmer.");

  return { candidate, material, availability, distance, access, quantity, score, factors, warnings, missingData, confidence };
}

export function parseCapacityTonnes(value?: string | null): number | null {
  if (!value) return null;
  const m = String(value).replace(",", ".").match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function rankCandidates(
  query: MatchingQuery,
  candidates: CandidateRow[],
  vehicle: VehicleProfileLite | null,
): MatchResult[] {
  return candidates
    .map((c) => evaluateCandidate(query, c, vehicle))
    // Un faux négatif est pire qu'un résultat à valider : on ne retire que
    // les incompatibilités matérielles explicites et les demandes indisponibles.
    .filter((r) => r.material.compatibility !== "INCOMPATIBLE" && r.availability.state !== "NON")
    .sort((a, b) => b.score - a.score);
}

// ---------- ÉTAPE 7 — répartition multi-remblais (simulation) ----------

export interface AllocationLine {
  submissionId: string;
  label: string;
  allocatedTonnes: number;
  remainingCapacityTonnes: number | null;
  trips: number | null;
  isEstimate: boolean;
}

export interface AllocationPlan {
  totalTonnes: number;
  allocated: number;
  unallocated: number;
  lines: AllocationLine[];
  note: string;
}

/** SIMULATION uniquement : aucune réservation, aucune capacité modifiée. */
export function planAllocation(
  totalTonnes: number,
  results: MatchResult[],
  capacityPerTripTonnes: number | null,
): AllocationPlan {
  const lines: AllocationLine[] = [];
  let left = totalTonnes > 0 ? totalTonnes : 0;
  for (const r of results) {
    if (left <= 0) break;
    const cap = parseCapacityTonnes(r.candidate.remaining_capacity);
    if (cap == null) continue;
    const take = Math.min(cap, left);
    left -= take;
    lines.push({
      submissionId: r.candidate.id,
      label: r.candidate.dompe_number || r.candidate.submission_number || r.candidate.id,
      allocatedTonnes: take,
      remainingCapacityTonnes: cap,
      trips: tripsForTonnes(take, capacityPerTripTonnes),
      isEstimate: true,
    });
  }
  return {
    totalTonnes,
    allocated: totalTonnes - left,
    unallocated: left,
    lines,
    note: "Simulation : aucune réservation effectuée, aucune capacité modifiée.",
  };
}
