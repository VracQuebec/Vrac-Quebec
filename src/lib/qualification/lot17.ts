// ============================================================
// LOT 17 — STABILISATION, MODE TEST SÛR ET CONTRAT POUR LE LOT 18
// ------------------------------------------------------------
// Module PUR : aucune écriture, aucun appel réseau, aucune
// modification de donnée historique. Il traduit la file du LOT 16
// en langage de chantier pour un employé des opérations et prépare
// la frontière (contrat) que le LOT 18 utilisera pour brancher les
// réponses de qualification au moteur de matching.
// ============================================================
import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import type { EnrichedProfile, MaterialStance } from "@/lib/qualification/lot15";
import type { AnswerDetail, AnswerKind, QueueCard, QueueQuestion } from "@/lib/qualification/lot16";

export const LOT17_VERSION = "qualification-safe-v1";

// ---------------- 1. Mode test sûr ----------------

/** Bandeau affiché en permanence dans l'interface de qualification. */
export const TEST_MODE_BADGE = "MODE TEST — AUCUNE DONNÉE RÉELLE MODIFIÉE";

export type MutatingAction =
  | "confirmation"
  | "statut_crm"
  | "disponibilite"
  | "suppression"
  | "reactivation"
  | "matching_public"
  | "courriel"
  | "sms"
  | "notification_client";

export interface SafeModeVerdict {
  allowed: boolean;
  reason: string;
}

/**
 * Toute action potentiellement mutante passe par ici. En mode test
 * (seul mode disponible au LOT 17) la réponse est TOUJOURS refusée :
 * les réponses saisies vivent uniquement en mémoire de session.
 */
export function guardMutation(action: MutatingAction, testMode = true): SafeModeVerdict {
  if (testMode) {
    return { allowed: false, reason: `${TEST_MODE_BADGE} — action « ${action} » simulée seulement.` };
  }
  return { allowed: false, reason: `Action « ${action} » non autorisée : aucune écriture n'est branchée.` };
}

/** Une réponse saisie en mode test n'est jamais une confirmation humaine. */
export interface SessionAnswer {
  questionId: string;
  answer: AnswerKind;
  detail: AnswerDetail;
  /** Toujours vrai au LOT 17. */
  simulated: true;
  at: string;
}

export function recordSessionAnswer(
  previous: SessionAnswer[],
  questionId: string,
  answer: AnswerKind,
  detail: AnswerDetail = {},
  now = new Date(),
): SessionAnswer[] {
  return [...previous, { questionId, answer, detail, simulated: true, at: now.toISOString() }];
}

// ---------------- 2. Carte lisible par un employé des opérations ----------------

const FRESHNESS_LABELS: Record<string, string> = {
  CONFIRMEE: "Confirmée avec le client",
  A_REVALIDER: "À revalider (confirmation ancienne)",
  JAMAIS_CONFIRMEE: "Jamais confirmée avec le client",
};

const CERTAIN: MaterialStance[] = ["ACCEPTE_CONFIRME", "REFUSE_CONFIRME"];

export interface OperatorCard {
  reference: string;
  sector: string;
  availabilityLabel: string;
  freshnessLabel: string;
  capacityLabel: string;
  /** Ce qui est certain (confirmé avec une personne). */
  confirmedMaterials: string[];
  /** Possible mais jamais confirmé — à valider au téléphone. */
  possibleMaterials: string[];
  /** Refus explicites. */
  refusedMaterials: string[];
  /** Ce qui manque et bloque des matchs. */
  missingInformation: string[];
  probableMatches: number;
  blockedMatches: number;
  unlockPotential: number;
  nextQuestion: string | null;
  whyThisCall: string;
  priority: number;
  confidenceLabel: "Information solide" | "Information partielle" | "Information faible";
}

const labelOf = (key: MaterialKey) => MATERIAL_LABELS[key] ?? key;

export function buildOperatorCard(card: QueueCard, profile: EnrichedProfile): OperatorCard {
  const confirmed = profile.materials
    .filter((m) => m.stance === "ACCEPTE_CONFIRME")
    .map((m) => labelOf(m.materialKey));
  const possible = profile.materials
    .filter((m) => m.stance === "COMPATIBLE_PROBABLE" || m.stance === "A_CONFIRMER")
    .map((m) => labelOf(m.materialKey));
  const refused = [
    ...profile.materials.filter((m) => m.stance === "REFUSE_CONFIRME").map((m) => labelOf(m.materialKey)),
    ...profile.exclusions.map(labelOf),
  ];

  const missing: string[] = [];
  if (profile.granulometry.maxInches == null) missing.push("grosseur maximale des morceaux");
  if (profile.mixturesAllowed == null) missing.push("mélanges acceptés ou non");
  if (!profile.trucks.codes.length) missing.push("types de camions qui peuvent entrer");
  if (!profile.capacity.known) missing.push("quantité qu'il reste à remplir");
  if (profile.availability.freshness.state !== "CONFIRMEE") missing.push("confirmation que la dompe est encore ouverte");
  if (!profile.materials.some((m) => CERTAIN.includes(m.stance))) missing.push("matériaux réellement acceptés");

  const certainCount = profile.materials.filter((m) => CERTAIN.includes(m.stance)).length;
  const confidenceLabel: OperatorCard["confidenceLabel"] =
    card.quality.score >= 70 && certainCount > 0
      ? "Information solide"
      : card.quality.score >= 40
        ? "Information partielle"
        : "Information faible";

  return {
    reference: card.reference ?? card.submissionId.slice(0, 8),
    sector: card.city ?? "Secteur non précisé",
    availabilityLabel: card.available ? "Ouverte pour recevoir" : "Pas ouverte présentement",
    freshnessLabel: FRESHNESS_LABELS[card.freshness.state] ?? "Inconnue",
    capacityLabel:
      profile.capacity.remaining != null
        ? `Environ ${profile.capacity.remaining} ${profile.capacity.unit ?? ""}`.trim()
        : profile.capacity.total != null
          ? `Capacité annoncée : ${profile.capacity.total} ${profile.capacity.unit ?? ""}`.trim()
          : "Quantité restante inconnue",
    confirmedMaterials: confirmed,
    possibleMaterials: possible,
    refusedMaterials: refused,
    missingInformation: missing,
    probableMatches: card.counts.compatible,
    blockedMatches: card.counts.toConfirm,
    unlockPotential: Math.max(0, card.estimatedGain),
    nextQuestion: card.recommended?.text ?? null,
    whyThisCall: card.priority.reasons[0] ?? "aucune raison prioritaire détectée",
    priority: card.priority.score,
    confidenceLabel,
  };
}

/** Vaut-il la peine d'appeler? Une fiche sans potentiel réel ne se qualifie pas. */
export function callWorthwhile(card: QueueCard): boolean {
  return card.available && (card.counts.toConfirm > 0 || Math.max(0, card.estimatedGain) > 0);
}

// ---------------- 3. Contrat pour le LOT 18 (frontière documentée) ----------------

export type MaterialFamily =
  | "terre" | "sable" | "argile" | "pierre" | "beton" | "asphalte" | "organique" | "inconnu";

export const MATERIAL_FAMILY: Record<MaterialKey, MaterialFamily> = {
  terre: "terre",
  terre_excavation: "terre",
  sable: "sable",
  argile: "argile",
  pierre: "pierre",
  roche: "pierre",
  beton: "beton",
  asphalte: "asphalte",
  organique: "organique",
  materiel_inconnu: "inconnu",
};

export type AcceptanceState = "CONFIRMED" | "POSSIBLE" | "REJECTED" | "UNKNOWN";

/**
 * Représentation normalisée d'une contrainte de qualification.
 * Les noms de champs sont ceux du contrat LOT 18 ; ils ne sont PAS
 * imposés au schéma existant (aucune migration destructive).
 */
export interface NormalizedConstraint {
  request_id: string;
  material: MaterialKey | null;
  material_family: MaterialFamily | null;
  mixture_components: MaterialKey[];
  granulometry: { max_inches: number | null; min_inches: number | null };
  reinforcement: "WITH" | "WITHOUT" | "UNKNOWN";
  acceptance_state: AcceptanceState;
  confidence: "HAUTE" | "MOYENNE" | "INCONNU";
  source: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

const STATE_OF: Record<AnswerKind, AcceptanceState> = {
  OUI: "CONFIRMED",
  NON: "REJECTED",
  CA_DEPEND: "POSSIBLE",
  JE_NE_SAIS_PAS: "UNKNOWN",
  PASSER: "UNKNOWN",
};

/**
 * qualification answer → normalized constraint.
 * Étape 1 de la frontière ; le LOT 18 branchera l'étape 2
 * (normalized constraint → recalcul des matchs) via `QualificationBoundary`.
 */
export function toNormalizedConstraint(args: {
  profile: EnrichedProfile;
  question: QueueQuestion;
  answer: AnswerKind;
  detail?: AnswerDetail;
  confirmedBy?: string | null;
  now?: Date;
  /** En mode test, aucune confirmation humaine n'est revendiquée. */
  testMode?: boolean;
}): NormalizedConstraint {
  const { profile, question, answer, detail = {}, testMode = true } = args;
  const material = question.category === "material" ? (question.subject as MaterialKey) : null;
  const reinforcement =
    detail.note?.includes("sans armature") ? "WITHOUT"
    : detail.note?.includes("avec armature") ? "WITH"
    : "UNKNOWN";

  return {
    request_id: profile.submissionId,
    material,
    material_family: material ? MATERIAL_FAMILY[material] ?? "inconnu" : null,
    mixture_components: profile.materials
      .filter((m) => m.stance !== "REFUSE_CONFIRME" && m.stance !== "INCONNU")
      .map((m) => m.materialKey),
    granulometry: {
      max_inches: detail.maxInches ?? profile.granulometry.maxInches,
      min_inches: profile.granulometry.minInches,
    },
    reinforcement,
    acceptance_state: STATE_OF[answer],
    confidence: answer === "OUI" || answer === "NON" ? (testMode ? "MOYENNE" : "HAUTE") : "INCONNU",
    source: testMode ? "qualification_test_mode" : "qualification_queue_v2",
    // En mode test : jamais de signataire humain, jamais d'horodatage de confirmation.
    confirmed_by: testMode ? null : args.confirmedBy ?? null,
    confirmed_at: testMode ? null : (args.now ?? new Date()).toISOString(),
  };
}

/**
 * Frontière de service documentée pour le LOT 18 :
 *   réponse de qualification → contrainte normalisée → recalcul des matchs.
 * L'implémentation par défaut est strictement en lecture seule.
 */
export interface QualificationBoundary {
  readonly mode: "test" | "production";
  normalize(args: Parameters<typeof toNormalizedConstraint>[0]): NormalizedConstraint;
  /** Persistance : refusée tant que le LOT 18 n'est pas autorisé. */
  persist(constraint: NormalizedConstraint): Promise<SafeModeVerdict>;
  /** Recalcul des matchs : point d'accroche du LOT 18. */
  recomputeMatches(constraint: NormalizedConstraint): Promise<{ recomputed: false; reason: string }>;
}

export function createReadOnlyBoundary(): QualificationBoundary {
  return {
    mode: "test",
    normalize: (args) => toNormalizedConstraint({ ...args, testMode: true }),
    persist: async () => guardMutation("confirmation", true),
    recomputeMatches: async () => ({
      recomputed: false,
      reason: "Le recalcul des matchs sera branché au LOT 18 (non autorisé actuellement).",
    }),
  };
}
