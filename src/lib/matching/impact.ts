// ============================================================
// LOT 18 — MOTEUR D'IMPACT « QUALIFICATION → MATCH »
// ------------------------------------------------------------
// Fonctions PURES : aucune écriture, aucun appel réseau, aucune
// modification de donnée historique, aucun matching public.
//
// Règles permanentes Vrac Québec appliquées ici :
//  - une supposition (IA/NLU) ne devient JAMAIS une confirmation;
//  - « ça dépend » ne devient jamais « oui »;
//  - un refus explicite ne peut jamais être écrasé par une déduction;
//  - INCONNU ≠ REFUSÉ;
//  - béton ≠ béton armé; terre acceptée ≠ béton accepté;
//  - la conformité environnementale n'est jamais inventée.
//
// Un seul modèle de compatibilité, interrogeable dans les deux sens
// (matériau → demandes de remblai, demande de remblai → matériaux).
// ============================================================

import type { LoadComposition } from "@/lib/matching/compatibility";
import type { MaterialKey } from "@/lib/matching/interpreter";
import {
  evaluateMixture, stanceForMaterial, type EnrichedProfile,
} from "@/lib/qualification/lot15";
import {
  simulateAnswer, type AnswerDetail, type AnswerKind, type QueueQuestion,
} from "@/lib/qualification/lot16";

export const MATCH_IMPACT_VERSION = "match-impact-v1";

// ---------------- 2. États de match ----------------

export type MatchState =
  | "CONFIRMED_COMPATIBLE"
  | "PROBABLE_COMPATIBLE"
  | "NEEDS_CONFIRMATION"
  | "INCOMPATIBLE"
  | "INSUFFICIENT_INFORMATION";

/** Langage affiché aux employés — jamais les noms techniques. */
export const MATCH_STATE_LABELS: Record<MatchState, string> = {
  CONFIRMED_COMPATIBLE: "Compatible confirmé",
  PROBABLE_COMPATIBLE: "Probablement compatible",
  NEEDS_CONFIRMATION: "À confirmer",
  INCOMPATIBLE: "Non compatible",
  INSUFFICIENT_INFORMATION: "Information insuffisante",
};

export const MATCH_STATES: MatchState[] = [
  "CONFIRMED_COMPATIBLE", "PROBABLE_COMPATIBLE", "NEEDS_CONFIRMATION",
  "INCOMPATIBLE", "INSUFFICIENT_INFORMATION",
];

export type StateCounts = Record<MatchState, number>;

export const emptyCounts = (): StateCounts => ({
  CONFIRMED_COMPATIBLE: 0, PROBABLE_COMPATIBLE: 0, NEEDS_CONFIRMATION: 0,
  INCOMPATIBLE: 0, INSUFFICIENT_INFORMATION: 0,
});

// ---------------- Contexte opérationnel ----------------

export type QuantityUnit = "voyages" | "tonnes" | "verges3" | "m3";

export interface MatchContext {
  /** Quantité totale du matériau à sortir, si connue. */
  quantity?: { value: number; unit: QuantityUnit } | null;
  /** Distance approximative chantier ↔ demande de remblai. */
  distanceKm?: number | null;
  /** Rayon maximal EXPLICITEMENT exprimé par le client (sinon jamais de rejet par distance). */
  maxRadiusKm?: number | null;
  /** Béton armé connu dans le chargement. */
  reinforced?: boolean | null;
  /** Étiquette lisible de la source (chantier, ville…). */
  label?: string | null;
}

export interface CapacityView {
  /** Quantité totale à sortir. */
  totalQuantity: number | null;
  /** Capacité restante de la demande de remblai. */
  remainingCapacity: number | null;
  unit: QuantityUnit | null;
  /** Quantité réellement plaçable ici. */
  acceptableQuantity: number | null;
  partial: boolean;
  /** Reste à placer ailleurs (préparation du split matching). */
  leftover: number | null;
  known: boolean;
}

export interface MatchReason {
  mark: "✓" | "?" | "✗" | "~";
  text: string;
}

export interface MatchEvaluation {
  version: string;
  requestId: string;
  loadId: string;
  /** Compatibilité MATIÈRE, indépendante de l'intérêt opérationnel. */
  state: MatchState;
  stateLabel: string;
  reasons: MatchReason[];
  blockers: string[];
  /** Ce qu'il manque pour trancher. */
  missing: string[];
  capacity: CapacityView;
  distanceKm: number | null;
  /** Utilité opérationnelle (disponibilité, capacité, distance) — séparée de la compatibilité. */
  operational: { usable: boolean; relevance: number; reasons: string[] };
  /** Question qui débloquerait ce match précis. */
  unlockingQuestion: string | null;
  reliesOnProbable: boolean;
}

// ---------------- 4/5/6/7/8 — Évaluation d'un match ----------------

const UNKNOWN_KEY: MaterialKey = "materiel_inconnu";

function capacityView(profile: EnrichedProfile, ctx: MatchContext): CapacityView {
  const unit = (ctx.quantity?.unit ?? profile.capacity.unit ?? null) as QuantityUnit | null;
  const total = ctx.quantity?.value ?? null;
  const remaining = profile.capacity.remaining ?? profile.capacity.total ?? null;
  const comparable =
    total != null && remaining != null &&
    (ctx.quantity?.unit == null || profile.capacity.unit == null || ctx.quantity.unit === profile.capacity.unit);

  if (!comparable) {
    return {
      totalQuantity: total, remainingCapacity: remaining, unit,
      acceptableQuantity: null, partial: false, leftover: null,
      known: total != null && remaining != null,
    };
  }
  const acceptable = Math.min(total!, remaining!);
  return {
    totalQuantity: total, remainingCapacity: remaining, unit,
    acceptableQuantity: acceptable,
    partial: acceptable < total!,
    leftover: Math.max(0, total! - acceptable),
    known: true,
  };
}

/**
 * Évalue un chargement face à une demande de remblai.
 * Modèle unique : utilisé dans les deux sens de recherche.
 */
export function evaluateMatch(
  load: LoadComposition,
  profile: EnrichedProfile,
  ctx: MatchContext = {},
): MatchEvaluation {
  const reasons: MatchReason[] = [];
  const blockers: string[] = [];
  const missing: string[] = [];

  const mixture = evaluateMixture(load, profile);
  const known = load.materials.filter((m) => m.materialKey !== UNKNOWN_KEY);

  // Béton armé : jamais déduit d'une acceptation de béton simple.
  const hasConcrete = load.materials.some((m) => m.materialKey === "beton");
  const allowsRebar = profile.conditions.some((c) => /armature accept/i.test(c));
  const refusesRebar = profile.conditions.some((c) => /sans armature/i.test(c));
  if (hasConcrete && ctx.reinforced === true) {
    if (refusesRebar && !allowsRebar) {
      blockers.push("Béton armé refusé : la demande accepte le béton sans armature seulement.");
    } else if (!allowsRebar) {
      missing.push("acceptation du béton armé jamais confirmée");
    }
  }

  for (const c of mixture.components) {
    if (c.stance === "REFUSE_CONFIRME") reasons.push({ mark: "✗", text: c.explanation });
    else if (c.size === "TROP_GROS") reasons.push({ mark: "✗", text: c.explanation });
    else if (c.stance === "ACCEPTE_CONFIRME") reasons.push({ mark: "✓", text: c.explanation });
    else reasons.push({ mark: "?", text: c.explanation });
  }
  blockers.push(...mixture.blockers);
  missing.push(...mixture.toConfirm);

  if (profile.granulometry.maxInches == null && known.some((c) => c.maxInches != null)) {
    missing.push("grosseur maximale acceptée non confirmée");
  }

  // Distance : jamais un refus, sauf rayon explicite.
  const distanceKm = ctx.distanceKm ?? null;
  if (ctx.maxRadiusKm != null && distanceKm != null && distanceKm > ctx.maxRadiusKm) {
    blockers.push(`Hors du rayon maximal exprimé (${distanceKm} km > ${ctx.maxRadiusKm} km).`);
  }

  const capacity = capacityView(profile, ctx);

  // État matière.
  let state: MatchState;
  if (blockers.length) state = "INCOMPATIBLE";
  else if (!known.length) state = "INSUFFICIENT_INFORMATION";
  else if (missing.length || mixture.kind === "MELANGE_A_CONFIRMER") state = "NEEDS_CONFIRMATION";
  else if (mixture.components.every((c) => c.stance === "ACCEPTE_CONFIRME")) state = "CONFIRMED_COMPATIBLE";
  else state = "PROBABLE_COMPATIBLE";

  // Intérêt opérationnel : séparé de la compatibilité matière.
  const opReasons: string[] = [];
  let relevance = 100;
  if (!profile.availability.available) {
    opReasons.push("La dompe n'est pas ouverte présentement.");
    relevance -= 60;
  }
  if (profile.availability.freshness.state !== "CONFIRMEE") {
    opReasons.push("Disponibilité jamais reconfirmée avec le client.");
    relevance -= 10;
  }
  if (capacity.partial) {
    opReasons.push(
      `Capacité partielle estimée : ${capacity.acceptableQuantity} / ${capacity.totalQuantity} ${capacity.unit ?? ""}`.trim(),
    );
    relevance -= 15;
  }
  if (distanceKm != null) {
    reasons.push({ mark: "~", text: `${distanceKm} km du chantier` });
    relevance -= Math.min(40, Math.round(distanceKm / 5));
  } else {
    missing.push("distance inconnue");
  }
  if (profile.availability.available) reasons.push({ mark: "✓", text: "Dompe actuellement disponible" });
  else reasons.push({ mark: "✗", text: "Dompe pas ouverte présentement" });

  const unlocking =
    state === "NEEDS_CONFIRMATION" || state === "INSUFFICIENT_INFORMATION"
      ? missing[0] ? `À demander : ${missing[0]}` : null
      : null;

  return {
    version: MATCH_IMPACT_VERSION,
    requestId: profile.submissionId,
    loadId: load.id,
    state,
    stateLabel: MATCH_STATE_LABELS[state],
    reasons,
    blockers,
    missing,
    capacity,
    distanceKm,
    operational: {
      usable: profile.availability.available && state !== "INCOMPATIBLE",
      relevance: Math.max(0, Math.min(100, relevance)),
      reasons: opReasons,
    },
    unlockingQuestion: unlocking,
    reliesOnProbable: mixture.reliesOnProbable,
  };
}

// ---------------- 16 — Génération de candidats + cache ----------------

/** Pré-filtrage bon marché : écarte ce qui est certainement refusé, sans évaluation complète. */
export function isPlausibleCandidate(load: LoadComposition, profile: EnrichedProfile): boolean {
  const keys = load.materials.map((m) => m.materialKey).filter((k) => k !== UNKNOWN_KEY);
  if (!keys.length) return true;
  return !keys.every((k) => stanceForMaterial(profile, k) === "REFUSE_CONFIRME");
}

export interface MatchCache {
  evaluate(load: LoadComposition, profile: EnrichedProfile, ctx?: MatchContext, tag?: string): MatchEvaluation;
  size(): number;
  clear(): void;
}

/** Mémoïsation : une même paire (demande, chargement, contexte) n'est calculée qu'une fois. */
export function createMatchCache(): MatchCache {
  const store = new Map<string, MatchEvaluation>();
  return {
    evaluate(load, profile, ctx = {}, tag = "") {
      const key = [
        profile.submissionId, load.id, tag,
        profile.materials.map((m) => `${m.materialKey}:${m.stance}`).join("|"),
        profile.exclusions.join(","), profile.granulometry.maxInches ?? "n",
        profile.capacity.remaining ?? "n", profile.availability.available ? 1 : 0,
        ctx.distanceKm ?? "n", ctx.quantity?.value ?? "n", ctx.reinforced ?? "n",
      ].join("#");
      const hit = store.get(key);
      if (hit) return hit;
      const value = evaluateMatch(load, profile, ctx);
      store.set(key, value);
      return value;
    },
    size: () => store.size,
    clear: () => store.clear(),
  };
}

// ---------------- 12 — Matching bidirectionnel (modèle unique) ----------------

export interface RankedMatch {
  evaluation: MatchEvaluation;
  /** Classement : compatibilité d'abord, intérêt opérationnel ensuite. */
  rank: number;
  label: string;
}

const STATE_RANK: Record<MatchState, number> = {
  CONFIRMED_COMPATIBLE: 400, PROBABLE_COMPATIBLE: 300,
  NEEDS_CONFIRMATION: 200, INSUFFICIENT_INFORMATION: 100, INCOMPATIBLE: 0,
};

const rankOf = (e: MatchEvaluation) => STATE_RANK[e.state] + e.operational.relevance / 100;

function rank(evaluations: MatchEvaluation[], labels: (e: MatchEvaluation) => string): RankedMatch[] {
  return evaluations
    .map((evaluation) => ({ evaluation, rank: rankOf(evaluation), label: labels(evaluation) }))
    .sort((a, b) => b.rank - a.rank || a.evaluation.requestId.localeCompare(b.evaluation.requestId));
}

/** Sens A — « où mon matériel peut-il aller ? ». */
export function matchesForLoad(
  load: LoadComposition,
  requests: { profile: EnrichedProfile; ctx?: MatchContext }[],
  cache = createMatchCache(),
): RankedMatch[] {
  const evaluations = requests
    .filter((r) => isPlausibleCandidate(load, r.profile))
    .map((r) => cache.evaluate(load, r.profile, r.ctx ?? {}));
  return rank(evaluations, (e) => `Demande ${e.requestId.slice(0, 8)} — ${e.stateLabel}`);
}

/** Sens B — « quels matériaux disponibles pourraient remplir cette demande ? ». */
export function matchesForRequest(
  profile: EnrichedProfile,
  loads: { load: LoadComposition; ctx?: MatchContext }[],
  cache = createMatchCache(),
): RankedMatch[] {
  const evaluations = loads
    .filter((l) => isPlausibleCandidate(l.load, profile))
    .map((l) => cache.evaluate(l.load, profile, l.ctx ?? {}));
  return rank(evaluations, (e) => `Chargement ${e.loadId} — ${e.stateLabel}`);
}

// ---------------- 1/10 — Impact d'une réponse de qualification ----------------

export function countStates(
  profile: EnrichedProfile,
  loads: { load: LoadComposition; ctx?: MatchContext }[],
  cache?: MatchCache,
): StateCounts {
  const counts = emptyCounts();
  for (const l of loads) {
    const e = cache ? cache.evaluate(l.load, profile, l.ctx ?? {}) : evaluateMatch(l.load, profile, l.ctx ?? {});
    counts[e.state] += 1;
  }
  return counts;
}

export interface StateTransition {
  loadId: string;
  before: MatchState;
  after: MatchState;
  beforeLabel: string;
  afterLabel: string;
  reason: string;
}

export interface QualificationImpact {
  version: string;
  question: string;
  answer: AnswerKind;
  before: StateCounts;
  after: StateCounts;
  transitions: StateTransition[];
  /** Matchs devenus utilisables (confirmés ou probables) grâce à la réponse. */
  newlyUnlocked: string[];
  newlyBlocked: string[];
  nowConfirmed: string[];
  stillProbable: string[];
  stillNeedClarification: string[];
  gain: number;
  summary: string;
}

const USABLE: MatchState[] = ["CONFIRMED_COMPATIBLE", "PROBABLE_COMPATIBLE"];

function transitionReason(after: MatchEvaluation, before: MatchEvaluation): string {
  if (after.state === before.state) {
    return after.state === "NEEDS_CONFIRMATION"
      ? `Toujours à confirmer : ${after.missing[0] ?? "information manquante"}`
      : `État inchangé (${after.stateLabel.toLowerCase()})`;
  }
  if (after.state === "INCOMPATIBLE") return after.blockers[0] ?? "Refus confirmé par la réponse";
  if (after.state === "CONFIRMED_COMPATIBLE") return "Acceptation confirmée par une personne";
  if (after.state === "PROBABLE_COMPATIBLE") return "Compatible probable : reste à confirmer avec le client";
  return after.missing[0] ?? "Nouvelle information manquante";
}

/**
 * Calcule l'impact RÉEL d'une réponse simulée sur les matchs.
 * La réponse est appliquée sur une COPIE du profil : rien n'est écrit.
 */
export function evaluateQualificationImpact(args: {
  profile: EnrichedProfile;
  loads: { load: LoadComposition; ctx?: MatchContext }[];
  question: QueueQuestion;
  answer: AnswerKind;
  detail?: AnswerDetail;
}): QualificationImpact {
  const { profile, loads, question, answer, detail = {} } = args;
  const simulated = simulateAnswer(profile, question, answer, detail);

  const transitions: StateTransition[] = [];
  const before = emptyCounts();
  const after = emptyCounts();
  const newlyUnlocked: string[] = [];
  const newlyBlocked: string[] = [];
  const nowConfirmed: string[] = [];
  const stillProbable: string[] = [];
  const stillNeedClarification: string[] = [];

  for (const l of loads) {
    const b = evaluateMatch(l.load, profile, l.ctx ?? {});
    const a = evaluateMatch(l.load, simulated, l.ctx ?? {});
    before[b.state] += 1;
    after[a.state] += 1;
    transitions.push({
      loadId: l.load.id, before: b.state, after: a.state,
      beforeLabel: b.stateLabel, afterLabel: a.stateLabel,
      reason: transitionReason(a, b),
    });
    const wasUsable = USABLE.includes(b.state);
    const isUsable = USABLE.includes(a.state);
    if (!wasUsable && isUsable) newlyUnlocked.push(l.load.id);
    if (wasUsable && a.state === "INCOMPATIBLE") newlyBlocked.push(l.load.id);
    if (a.state === "CONFIRMED_COMPATIBLE") nowConfirmed.push(l.load.id);
    if (a.state === "PROBABLE_COMPATIBLE") stillProbable.push(l.load.id);
    if (a.state === "NEEDS_CONFIRMATION" || a.state === "INSUFFICIENT_INFORMATION") {
      stillNeedClarification.push(l.load.id);
    }
  }

  const usableBefore = USABLE.reduce((n, s) => n + before[s], 0);
  const usableAfter = USABLE.reduce((n, s) => n + after[s], 0);
  const gain = usableAfter - usableBefore;

  return {
    version: MATCH_IMPACT_VERSION,
    question: question.text,
    answer,
    before, after, transitions,
    newlyUnlocked, newlyBlocked, nowConfirmed, stillProbable, stillNeedClarification,
    gain,
    summary:
      answer === "PASSER" || answer === "JE_NE_SAIS_PAS"
        ? "Aucune information ajoutée : les matchs restent identiques."
        : `${usableBefore} match(s) utilisable(s) avant · ${usableAfter} après (${gain >= 0 ? "+" : ""}${gain}).`,
  };
}

// ---------------- 11 — Classement des questions par impact réel ----------------

export interface RankedQuestion {
  question: QueueQuestion;
  /** Matchs dont l'état changerait selon la réponse. */
  affected: number;
  bestGain: number;
  worstGain: number;
  likelihood: number;
  operationalValue: number;
  confidence: number;
  score: number;
  explanation: string;
}

/** Probabilité qu'une réponse change réellement l'état — heuristique de RANG, pas une précision. */
const LIKELIHOOD: Record<string, number> = { material: 0.6, granulometry: 0.5, truck: 0.3, capacity: 0.3 };

export function rankQuestionsByMatchImpact(
  profile: EnrichedProfile,
  loads: { load: LoadComposition; ctx?: MatchContext }[],
  questions: QueueQuestion[],
): RankedQuestion[] {
  const operationalValue =
    (profile.availability.available ? 1 : 0.3) * (profile.capacity.known ? 1 : 0.8);

  return questions
    .map((question) => {
      const positive = evaluateQualificationImpact({ profile, loads, question, answer: "OUI" });
      const bounded = question.followUps.find((f) => typeof f.detail.maxInches === "number");
      const conditional = bounded
        ? evaluateQualificationImpact({
            profile, loads, question, answer: "CA_DEPEND", detail: bounded.detail,
          })
        : null;
      const negative = evaluateQualificationImpact({ profile, loads, question, answer: "NON" });

      const affected = new Set([
        ...positive.transitions.filter((t) => t.before !== t.after).map((t) => t.loadId),
        ...negative.transitions.filter((t) => t.before !== t.after).map((t) => t.loadId),
        ...(conditional?.transitions.filter((t) => t.before !== t.after).map((t) => t.loadId) ?? []),
      ]).size;

      const bestGain = Math.max(positive.gain, conditional?.gain ?? Number.NEGATIVE_INFINITY);
      const worstGain = negative.gain;
      const likelihood = LIKELIHOOD[question.category] ?? 0.4;
      const confidence = profile.availability.freshness.state === "CONFIRMEE" ? 1 : 0.8;
      const score = Math.round(affected * likelihood * operationalValue * confidence * 100) / 10;

      return {
        question, affected, bestGain, worstGain, likelihood, operationalValue, confidence, score,
        explanation:
          affected === 0
            ? "Aucun match connu ne dépend de cette réponse."
            : `${affected} match(s) dépendent de cette réponse · jusqu'à ${Math.max(0, bestGain)} de plus si la réponse est favorable.`,
      };
    })
    .sort((a, b) => b.score - a.score || b.bestGain - a.bestGain || a.question.text.localeCompare(b.question.text));
}

// ---------------- 14 — Explorateur de matchs (vue admin légère) ----------------

export interface ExplorerRow {
  loadId: string;
  source: string;
  quantity: string;
  location: string;
  stateLabel: string;
  blockingReason: string;
  distance: string;
  capacity: string;
  nextClarification: string;
}

export function buildExplorerRows(
  profile: EnrichedProfile,
  loads: { load: LoadComposition; ctx?: MatchContext }[],
  filter?: MatchState[],
): ExplorerRow[] {
  return loads
    .map((l) => ({ l, e: evaluateMatch(l.load, profile, l.ctx ?? {}) }))
    .filter(({ e }) => !filter || filter.includes(e.state))
    .map(({ l, e }) => ({
      loadId: l.load.id,
      source: l.load.originalText || "Chargement sans description",
      quantity: l.ctx?.quantity
        ? `${l.ctx.quantity.value} ${l.ctx.quantity.unit}`
        : "Quantité inconnue",
      location: l.ctx?.label ?? "Lieu non précisé",
      stateLabel: e.stateLabel,
      blockingReason: e.blockers[0] ?? e.missing[0] ?? "Aucun blocage",
      distance: e.distanceKm != null ? `${e.distanceKm} km` : "Distance inconnue",
      capacity: e.capacity.partial
        ? `Partielle : ${e.capacity.acceptableQuantity} / ${e.capacity.totalQuantity} ${e.capacity.unit ?? ""}`.trim()
        : e.capacity.known ? "Capacité suffisante estimée" : "Capacité inconnue",
      nextClarification: e.unlockingQuestion ?? "—",
    }));
}

/** Préparation du split matching : répartition d'une quantité sur plusieurs demandes. */
export interface SplitPlanPart { requestId: string; quantity: number; state: MatchState }

export function planSplit(
  load: LoadComposition,
  requests: { profile: EnrichedProfile; ctx?: MatchContext }[],
  totalQuantity: number,
): { parts: SplitPlanPart[]; placed: number; leftover: number } {
  let left = totalQuantity;
  const parts: SplitPlanPart[] = [];
  for (const m of matchesForLoad(load, requests)) {
    if (left <= 0) break;
    const e = m.evaluation;
    if (e.state === "INCOMPATIBLE" || !e.operational.usable) continue;
    const capacity = e.capacity.remainingCapacity;
    const take = capacity == null ? left : Math.min(left, capacity);
    if (take <= 0) continue;
    parts.push({ requestId: e.requestId, quantity: take, state: e.state });
    left -= take;
  }
  return { parts, placed: totalQuantity - left, leftover: Math.max(0, left) };
}
