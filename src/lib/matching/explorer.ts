// ============================================================
// LOT 19 — EXPLORATEUR DE MATCHS DÉBLOCABLES + JOURNAL DE SIMULATION
// ------------------------------------------------------------
// Fonctions PURES, construites au-dessus du moteur d'impact du LOT 18.
// Aucune écriture en base, aucune confirmation réelle, aucune
// communication. Le journal vit en mémoire de session seulement.
// ============================================================
import type { LoadComposition } from "@/lib/matching/compatibility";
import { MATERIAL_LABELS } from "@/lib/matching/interpreter";
import type { EnrichedProfile } from "@/lib/qualification/lot15";
import { buildQuestions, type AnswerDetail, type AnswerKind, type QueueQuestion } from "@/lib/qualification/lot16";
import {
  countStates, createMatchCache, evaluateMatch, evaluateQualificationImpact,
  rankQuestionsByMatchImpact, MATCH_STATE_LABELS,
  type MatchContext, type MatchState, type QualificationImpact, type StateCounts,
} from "@/lib/matching/impact";

export const MATCH_EXPLORER_VERSION = "match-explorer-v1";

export interface ExplorerPair {
  load: LoadComposition;
  ctx?: MatchContext;
}

/** Une ligne complète de l'explorateur : matériau ↔ demande de remblai. */
export interface UnlockableMatch {
  requestId: string;
  requestReference: string | null;
  loadId: string;
  /** Description du matériau à sortir (texte original de la source). */
  materialSource: string;
  principalMaterial: string;
  secondaryMaterials: string[];
  granulometry: string;
  quantity: string;
  remainingCapacity: string;
  distance: string;
  state: MatchState;
  stateLabel: string;
  acceptance: { mark: "✓" | "?" | "✗" | "~"; text: string }[];
  blockingReason: string;
  missing: string[];
  question: QueueQuestion | null;
  /** Nombre de matchs que la réponse pourrait débloquer sur cette demande. */
  potentialUnlocked: number;
  unlockable: boolean;
}

const q = (v: unknown, unit?: string | null) => (v == null ? null : `${v}${unit ? ` ${unit}` : ""}`);

/**
 * PARTIE A — ouvre le compteur « X matchs débloquables » sous forme de liste
 * détaillée, explicable, question par question.
 */
export function buildUnlockableMatches(args: {
  profile: EnrichedProfile;
  reference?: string | null;
  loads: ExplorerPair[];
  onlyUnlockable?: boolean;
}): UnlockableMatch[] {
  const { profile, loads, reference = null, onlyUnlockable = false } = args;
  const questions = buildQuestions(profile, loads.map((l) => l.load));
  const ranked = rankQuestionsByMatchImpact(profile, loads, questions);

  const rows = loads.map(({ load, ctx }) => {
    const e = evaluateMatch(load, profile, ctx ?? {});
    const principal = load.materials.find((m) => m.role === "PRINCIPAL") ?? load.materials[0] ?? null;
    const secondary = load.materials.filter((m) => m !== principal);

    // Question qui touche réellement ce chargement.
    const best = ranked.find((r) =>
      evaluateQualificationImpact({ profile, loads: [{ load, ctx }], question: r.question, answer: "OUI" })
        .transitions.some((t) => t.before !== t.after)) ?? null;

    const unlockable =
      (e.state === "NEEDS_CONFIRMATION" || e.state === "INSUFFICIENT_INFORMATION") && best != null;

    return {
      requestId: profile.submissionId,
      requestReference: reference,
      loadId: load.id,
      materialSource: load.originalText || "Chargement sans description",
      principalMaterial: principal ? MATERIAL_LABELS[principal.materialKey] : "matériau non précisé",
      secondaryMaterials: secondary.map((m) => MATERIAL_LABELS[m.materialKey]),
      granulometry:
        principal?.maxInches != null ? `maximum ${principal.maxInches} po` : "grosseur inconnue",
      quantity: ctx?.quantity ? `${ctx.quantity.value} ${ctx.quantity.unit}` : "quantité inconnue",
      remainingCapacity:
        q(e.capacity.remainingCapacity, e.capacity.unit) ?? "capacité restante inconnue",
      distance: e.distanceKm != null ? `${e.distanceKm} km` : "distance inconnue",
      state: e.state,
      stateLabel: e.stateLabel,
      acceptance: e.reasons,
      blockingReason: e.blockers[0] ?? e.missing[0] ?? "Aucun blocage identifié",
      missing: e.missing,
      question: best?.question ?? null,
      potentialUnlocked: best?.bestGain && best.bestGain > 0 ? best.bestGain : best?.affected ?? 0,
      unlockable,
    } satisfies UnlockableMatch;
  });

  return onlyUnlockable ? rows.filter((r) => r.unlockable) : rows;
}

/** Compteurs d'état courants (« AVANT »). */
export function currentCounts(profile: EnrichedProfile, loads: ExplorerPair[]): StateCounts {
  return countStates(profile, loads, createMatchCache());
}

// ---------------- PARTIE C — journal de simulation (mémoire seulement) ----------------

export interface SimulationEntry {
  /** Numéro séquentiel lisible (SIMULATION #n). */
  index: number;
  timestamp: string;
  source: string;
  question: string;
  answerLabel: string;
  answer: AnswerKind;
  detail: AnswerDetail;
  affected: number;
  before: StateCounts;
  after: StateCounts;
  changes: { loadId: string; from: string; to: string; reason: string }[];
  summary: string;
  /** Toujours vrai : ce journal ne sera jamais écrit en production. */
  simulationOnly: true;
}

export interface SimulationJournal {
  entries: SimulationEntry[];
  add(impact: QualificationImpact, source: string, detail?: AnswerDetail): SimulationEntry;
  clear(): void;
}

export function createSimulationJournal(now: () => Date = () => new Date()): SimulationJournal {
  const entries: SimulationEntry[] = [];
  return {
    entries,
    add(impact, source, detail = {}) {
      const changes = impact.transitions
        .filter((t) => t.before !== t.after)
        .map((t) => ({ loadId: t.loadId, from: t.beforeLabel, to: t.afterLabel, reason: t.reason }));
      const entry: SimulationEntry = {
        index: entries.length + 1,
        timestamp: now().toISOString(),
        source,
        question: impact.question,
        answer: impact.answer,
        answerLabel: impact.answer,
        detail,
        affected: changes.length,
        before: impact.before,
        after: impact.after,
        changes,
        summary: impact.summary,
        simulationOnly: true,
      };
      entries.push(entry);
      return entry;
    },
    clear() { entries.length = 0; },
  };
}

/** Résumé lisible : « +7 compatibles · -5 à confirmer ». */
export function describeDelta(before: StateCounts, after: StateCounts): string {
  const parts = (Object.keys(MATCH_STATE_LABELS) as MatchState[])
    .map((s) => ({ s, d: after[s] - before[s] }))
    .filter((p) => p.d !== 0)
    .map((p) => `${p.d > 0 ? "+" : ""}${p.d} ${MATCH_STATE_LABELS[p.s].toLowerCase()}`);
  return parts.length ? parts.join(" · ") : "Aucun changement d'état.";
}

// ---------------- PARTIE J — matchs d'une interprétation ----------------

export interface InterpretationMatchSummary {
  total: number;
  confirmed: number;
  probable: number;
  needConfirmation: number;
  incompatible: number;
  insufficient: number;
  rows: UnlockableMatch[];
}

/** Simule les demandes de remblai compatibles avec un chargement interprété. */
export function matchInterpretation(args: {
  load: LoadComposition;
  ctx?: MatchContext;
  requests: { profile: EnrichedProfile; reference?: string | null; ctx?: MatchContext }[];
}): InterpretationMatchSummary {
  const rows = args.requests.flatMap((r) =>
    buildUnlockableMatches({
      profile: r.profile,
      reference: r.reference ?? null,
      loads: [{ load: args.load, ctx: r.ctx ?? args.ctx }],
    }));

  const by = (s: MatchState) => rows.filter((r) => r.state === s).length;
  return {
    total: rows.length,
    confirmed: by("CONFIRMED_COMPATIBLE"),
    probable: by("PROBABLE_COMPATIBLE"),
    needConfirmation: by("NEEDS_CONFIRMATION"),
    incompatible: by("INCOMPATIBLE"),
    insufficient: by("INSUFFICIENT_INFORMATION"),
    rows,
  };
}
