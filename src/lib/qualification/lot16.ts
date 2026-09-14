// ============================================================
// LOT 16 — FILE INTELLIGENTE DE QUALIFICATION DES DEMANDES DE REMBLAI
// ------------------------------------------------------------
// Fonctions PURES. Aucune écriture, aucun appel réseau, aucune
// modification de données historiques, aucun matching public.
//
// Règle absolue : absence ≠ refus, inconnu ≠ refusé,
// « je ne sais pas » ≠ refusé, supposition ≠ confirmation humaine.
// Une réponse humaine simulée ici produit un brouillon de journal
// (LOT 14) — elle n'écrit jamais en base dans ce lot.
// ============================================================

import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import { isSizeRelevant, type LoadComposition } from "@/lib/matching/compatibility";
import type { AcceptanceProfile } from "@/lib/qualification/lot13";
import type { JournalDraft, QualificationCategory } from "@/lib/qualification/lot14";
import {
  evaluateMixture, summarizeEnrichment, type EnrichedMaterial, type EnrichedProfile,
} from "@/lib/qualification/lot15";

export const QUALIFICATION_QUEUE_VERSION = "qualification-queue-v1";

// ---------------- 1. Réponses humaines possibles ----------------

export type AnswerKind = "OUI" | "NON" | "CA_DEPEND" | "JE_NE_SAIS_PAS" | "PASSER";

export const ANSWER_LABELS: Record<AnswerKind, string> = {
  OUI: "Oui",
  NON: "Non",
  CA_DEPEND: "Ça dépend",
  JE_NE_SAIS_PAS: "Je ne sais pas",
  PASSER: "Passer",
};

/** Précisions facultatives fournies avec « Ça dépend ». */
export interface AnswerDetail {
  maxInches?: number | null;
  /** Béton : avec ou sans armature. */
  rebar?: boolean | null;
  truckCodes?: string[];
  remainingTrips?: number | null;
  note?: string | null;
}

// ---------------- 2. Questions en langage de chantier ----------------

export type QueueQuestionCategory = QualificationCategory;

export interface QueueQuestion {
  id: string;
  category: QueueQuestionCategory;
  /** Clé matériau, « max_inches », « trucks », « capacity_remaining »… */
  subject: string;
  /** Formulation québécoise simple. */
  text: string;
  reason: string;
  /** Précisions proposées si la réponse est « Ça dépend ». */
  followUps: { label: string; detail: AnswerDetail }[];
  /** Chargements simulés débloqués par un « oui ». */
  unlocked: number;
  score: number;
}

const SIZE_FOLLOWUPS: { label: string; detail: AnswerDetail }[] = [
  { label: "6 po", detail: { maxInches: 6 } },
  { label: "12 po", detail: { maxInches: 12 } },
  { label: "18 po", detail: { maxInches: 18 } },
  { label: "24 po", detail: { maxInches: 24 } },
  { label: "Je ne sais pas", detail: { maxInches: null } },
];

const MATERIAL_QUESTIONS: Partial<Record<MaterialKey, string>> = {
  terre: "Acceptez-vous de la terre propre?",
  terre_excavation: "Acceptez-vous de la terre d'excavation?",
  sable: "La terre peut-elle contenir un peu de sable?",
  pierre: "La terre peut-elle contenir de petites pierres?",
  roche: "Acceptez-vous des roches?",
  argile: "Acceptez-vous de la glaise?",
  beton: "Acceptez-vous du béton cassé?",
  asphalte: "Acceptez-vous de l'asphalte?",
  organique: "Acceptez-vous de la terre noire ou de la matière organique?",
  materiel_inconnu: "Quel type de matériel pouvez-vous recevoir?",
};

const materialQuestion = (key: MaterialKey) =>
  MATERIAL_QUESTIONS[key] ?? `Acceptez-vous ${MATERIAL_LABELS[key] ?? key}?`;

const materialFollowUps = (key: MaterialKey): { label: string; detail: AnswerDetail }[] => {
  if (key === "beton") {
    return [
      { label: "Sans armature seulement", detail: { rebar: false } },
      { label: "Avec armature accepté", detail: { rebar: true } },
      ...SIZE_FOLLOWUPS,
    ];
  }
  return isSizeRelevant(key) ? SIZE_FOLLOWUPS : [{ label: "Je ne sais pas", detail: {} }];
};

/**
 * Élargissement intelligent : à partir de ce qui est déjà connu, proposer
 * ce que la demande POURRAIT aussi recevoir. Aucune extension ne devient
 * acceptée confirmée sans réponse humaine.
 */
export const EXTENSIONS: Partial<Record<MaterialKey, MaterialKey[]>> = {
  terre: ["sable", "pierre", "argile", "terre_excavation"],
  terre_excavation: ["terre", "sable", "argile"],
  sable: ["terre", "pierre"],
  pierre: ["roche", "sable"],
  roche: ["pierre"],
  beton: ["asphalte"],
};

// ---------------- 3. Simulation d'une réponse (jamais écrite) ----------------

const clone = (p: EnrichedProfile): EnrichedProfile => ({
  ...p,
  materials: p.materials.map((m) => ({ ...m })),
  exclusions: [...p.exclusions],
  granulometry: { ...p.granulometry, accepted: [...p.granulometry.accepted] },
  conditions: [...p.conditions],
  contaminants: [...p.contaminants],
  trucks: { ...p.trucks, codes: [...p.trucks.codes] },
  capacity: { ...p.capacity },
  provenance: p.provenance.map((x) => ({ ...x })),
});

function upsertMaterial(p: EnrichedProfile, key: MaterialKey, patch: Partial<EnrichedMaterial>) {
  const existing = p.materials.find((m) => m.materialKey === key);
  if (existing) Object.assign(existing, patch);
  else {
    p.materials.push({
      materialKey: key,
      label: MATERIAL_LABELS[key] ?? key,
      stance: "INCONNU",
      origin: "unknown",
      humanConfirmed: false,
      confidence: "INCONNU",
      maxInches: null,
      ...patch,
    });
  }
}

/**
 * Applique une réponse humaine SUR UNE COPIE du profil calculé.
 * Ni la base de données ni le texte original ne sont touchés.
 */
export function simulateAnswer(
  profile: EnrichedProfile,
  question: QueueQuestion,
  answer: AnswerKind,
  detail: AnswerDetail = {},
): EnrichedProfile {
  if (answer === "PASSER" || answer === "JE_NE_SAIS_PAS") return profile;
  const p = clone(profile);

  if (question.category === "material") {
    const key = question.subject as MaterialKey;
    if (answer === "OUI") {
      p.exclusions = p.exclusions.filter((k) => k !== key);
      upsertMaterial(p, key, {
        stance: "ACCEPTE_CONFIRME", origin: "human_recent", humanConfirmed: true, confidence: "CONFIRME",
      });
    } else if (answer === "NON") {
      if (!p.exclusions.includes(key)) p.exclusions.push(key);
      upsertMaterial(p, key, {
        stance: "REFUSE_CONFIRME", origin: "human_recent", humanConfirmed: true, confidence: "CONFIRME",
      });
    } else {
      // « Ça dépend » n'est JAMAIS un oui général.
      const limited = typeof detail.maxInches === "number";
      upsertMaterial(p, key, {
        stance: limited ? "ACCEPTE_CONFIRME" : "A_CONFIRMER",
        origin: "human_recent",
        humanConfirmed: limited,
        confidence: limited ? "CONFIRME" : "MOYENNE",
        maxInches: limited ? detail.maxInches! : null,
      });
      if (limited) {
        p.granulometry = {
          ...p.granulometry,
          maxInches: p.granulometry.maxInches == null
            ? detail.maxInches!
            : Math.max(p.granulometry.maxInches, detail.maxInches!),
          confirmed: true,
        };
      }
      if (detail.rebar === false) p.conditions = [...p.conditions, "béton sans armature"];
      if (detail.rebar === true) p.conditions = [...p.conditions, "béton avec armature accepté"];
    }
    return p;
  }

  if (question.category === "granulometry") {
    if (answer === "NON") p.granulometry = { ...p.granulometry, maxInches: 0, confirmed: true };
    else if (typeof detail.maxInches === "number") {
      p.granulometry = { ...p.granulometry, maxInches: detail.maxInches, confirmed: true };
    }
    return p;
  }

  if (question.category === "truck") {
    if (answer === "NON") return p;
    const codes = detail.truckCodes?.length ? detail.truckCodes : ["semi_remorque"];
    p.trucks = { codes: [...new Set([...p.trucks.codes, ...codes])], humanConfirmed: true };
    return p;
  }

  if (question.category === "capacity") {
    if (typeof detail.remainingTrips === "number") {
      p.capacity = { ...p.capacity, remaining: detail.remainingTrips, known: true };
    }
    return p;
  }

  if (question.category === "condition" || question.category === "environment") {
    if (answer === "OUI" && detail.note) p.conditions = [...p.conditions, detail.note];
    return p;
  }

  return p;
}

// ---------------- 4. Impact d'une réponse, avant toute sauvegarde ----------------

export interface MatchCounts { compatible: number; toConfirm: number; incompatible: number }

export function countMatches(profile: EnrichedProfile, loads: LoadComposition[]): MatchCounts {
  let compatible = 0, toConfirm = 0, incompatible = 0;
  for (const l of loads) {
    const k = evaluateMixture(l, profile).kind;
    if (k === "MELANGE_INCOMPATIBLE") incompatible += 1;
    else if (k === "MELANGE_A_CONFIRMER") toConfirm += 1;
    else compatible += 1;
  }
  return { compatible, toConfirm, incompatible };
}

export interface AnswerImpact {
  before: MatchCounts;
  after: MatchCounts;
  gain: number;
  explanation: string;
}

export function answerImpact(
  profile: EnrichedProfile, loads: LoadComposition[],
  question: QueueQuestion, answer: AnswerKind, detail: AnswerDetail = {},
): AnswerImpact {
  const before = countMatches(profile, loads);
  const after = countMatches(simulateAnswer(profile, question, answer, detail), loads);
  const gain = after.compatible - before.compatible;
  return {
    before, after, gain,
    explanation:
      answer === "PASSER" || answer === "JE_NE_SAIS_PAS"
        ? "Aucune information ajoutée : les matchs restent identiques."
        : `${before.compatible} compatible(s) et ${before.toConfirm} à confirmer avant; ` +
          `${after.compatible} compatible(s) et ${after.toConfirm} à confirmer après (${gain >= 0 ? "+" : ""}${gain}).`,
  };
}

// ---------------- 5. Questions adaptatives et valorisées ----------------

export function buildQuestions(profile: EnrichedProfile, loads: LoadComposition[]): QueueQuestion[] {
  const base = countMatches(profile, loads);
  const seen = new Set<string>();
  const raw: Omit<QueueQuestion, "unlocked" | "score">[] = [];

  const pushMaterial = (key: MaterialKey, reason: string) => {
    if (seen.has(`material:${key}`)) return;
    const known = profile.materials.find((m) => m.materialKey === key);
    if (profile.exclusions.includes(key)) return;              // refus confirmé : ne pas redemander
    if (known?.stance === "ACCEPTE_CONFIRME") return;
    seen.add(`material:${key}`);
    raw.push({
      id: `material:${key}`, category: "material", subject: key,
      text: materialQuestion(key), reason, followUps: materialFollowUps(key),
    });
  };

  // a) Matériaux présents dans les chargements simulés mais non confirmés.
  for (const load of loads) {
    for (const c of load.materials) pushMaterial(c.materialKey, "présent dans des chargements à placer");
  }
  // b) Élargissement intelligent à partir de ce qui est déjà connu.
  for (const m of profile.materials) {
    if (m.stance === "REFUSE_CONFIRME") continue;
    for (const ext of EXTENSIONS[m.materialKey] ?? []) {
      pushMaterial(ext, `extension possible de ${m.label}`);
    }
  }

  if (profile.granulometry.maxInches == null) {
    raw.push({
      id: "granulometry:max_inches", category: "granulometry", subject: "max_inches",
      text: "Quelle grosseur maximale de roche acceptez-vous?",
      reason: "grosseur maximale inconnue", followUps: SIZE_FOLLOWUPS,
    });
  }
  if (profile.mixturesAllowed == null) {
    raw.push({
      id: "acceptance_mode:mixtures", category: "acceptance_mode", subject: "mixtures",
      text: "Acceptez-vous des matériaux mélangés?",
      reason: "mélanges acceptés inconnus", followUps: [{ label: "Je ne sais pas", detail: {} }],
    });
  }
  if (!profile.trucks.codes.length) {
    raw.push({
      id: "truck:trucks", category: "truck", subject: "trucks",
      text: "Quel type de camion peut entrer sur le terrain?",
      reason: "camions acceptés inconnus",
      followUps: [
        { label: "10 roues", detail: { truckCodes: ["10_roues"] } },
        { label: "12 roues", detail: { truckCodes: ["12_roues"] } },
        { label: "Semi-remorque", detail: { truckCodes: ["semi_remorque"] } },
      ],
    });
  }
  if (!profile.capacity.known) {
    raw.push({
      id: "capacity:capacity_remaining", category: "capacity", subject: "capacity_remaining",
      text: "Combien de voyages pouvez-vous encore recevoir environ?",
      reason: "capacité restante inconnue",
      followUps: [
        { label: "Environ 10", detail: { remainingTrips: 10 } },
        { label: "Environ 50", detail: { remainingTrips: 50 } },
        { label: "Environ 100", detail: { remainingTrips: 100 } },
      ],
    });
  }
  if (profile.availability.freshness.state !== "CONFIRMEE") {
    raw.push({
      id: "request:availability", category: "request", subject: "availability",
      text: "Recevez-vous encore du matériel ces temps-ci?",
      reason: profile.availability.freshness.state === "JAMAIS_CONFIRMEE"
        ? "disponibilité jamais confirmée" : "disponibilité à revalider",
      followUps: [{ label: "Je ne sais pas", detail: {} }],
    });
  }

  const weight = (c: QueueQuestionCategory) =>
    c === "material" ? 10 : c === "granulometry" ? 8 : c === "acceptance_mode" ? 6 : c === "request" ? 5 : 3;

  return raw
    .map((q) => {
      const question = { ...q, unlocked: 0, score: 0 } as QueueQuestion;
      const after = countMatches(simulateAnswer(profile, question, "OUI", { maxInches: 24 }), loads);
      const unlocked = Math.max(0, after.compatible - base.compatible);
      return { ...question, unlocked, score: unlocked * weight(q.category) + (unlocked ? 0 : 1) };
    })
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
}

/** Question suivante : toujours celle qui apporte le plus de valeur maintenant. */
export function nextQuestion(
  profile: EnrichedProfile, loads: LoadComposition[], skipped: string[] = [],
): QueueQuestion | null {
  return buildQuestions(profile, loads).find((q) => !skipped.includes(q.id)) ?? null;
}

// ---------------- 6. Score de priorité explicable ----------------

export interface PriorityResult { score: number; reasons: string[] }

export function priorityScore(profile: EnrichedProfile, loads: LoadComposition[]): PriorityResult {
  const counts = countMatches(profile, loads);
  const questions = buildQuestions(profile, loads);
  const best = questions[0];
  const reasons: string[] = [];
  let score = 0;

  if (best && best.unlocked > 0) {
    score += best.unlocked * 12;
    reasons.push(`une seule réponse pourrait débloquer ${best.unlocked} chargement(s)`);
  }
  if (counts.toConfirm > 0) {
    score += Math.min(counts.toConfirm, 40) * 2;
    reasons.push(`${counts.toConfirm} match(s) bloqué(s) par une information manquante`);
  }
  const probable = profile.materials.filter((m) => m.stance === "COMPATIBLE_PROBABLE").length;
  if (probable) { score += probable * 3; reasons.push(`${probable} matériau(x) probable(s) jamais confirmé(s)`); }

  const sizeRelevant = loads.some((l) => l.materials.some((c) => isSizeRelevant(c.materialKey)));
  if (profile.granulometry.maxInches == null && sizeRelevant) {
    score += 8; reasons.push("grosseur maximale inconnue alors que des roches sont à placer");
  }
  if (profile.mixturesAllowed == null) { score += 5; reasons.push("mélanges acceptés inconnus"); }
  if (!profile.trucks.codes.length) { score += 4; reasons.push("camions acceptés inconnus"); }
  if (!profile.capacity.known) { score += 4; reasons.push("capacité restante inconnue"); }
  if (profile.availability.available && profile.availability.freshness.state === "JAMAIS_CONFIRMEE") {
    score += 6; reasons.push("disponible mais jamais confirmée");
  } else if (profile.availability.available && profile.availability.freshness.state === "A_REVALIDER") {
    score += 3; reasons.push("disponible mais confirmation ancienne");
  }

  // Une fiche pleine d'inconnus sans aucun potentiel réel ne doit pas remonter.
  if (counts.compatible + counts.toConfirm === 0) {
    score = Math.round(score * 0.2);
    reasons.push("aucun potentiel de match détecté pour l'instant");
  }
  if (!profile.availability.available) {
    score = Math.round(score * 0.5);
    reasons.push("demande non disponible actuellement");
  }

  return { score, reasons };
}

// ---------------- 7. Score de qualité (capacité à décider) ----------------

export interface QualityResult {
  score: number;
  breakdown: { key: string; applicable: boolean; earned: number; max: number }[];
  decidable: boolean;
}

/** « Peut-on décider correctement si un chargement peut aller ici? » */
export function qualityScore(profile: EnrichedProfile): QualityResult {
  const decided = profile.materials.filter(
    (m) => m.stance === "ACCEPTE_CONFIRME" || m.stance === "REFUSE_CONFIRME",
  ).length;
  const sizeRelevant =
    profile.materials.some((m) => isSizeRelevant(m.materialKey)) || profile.granulometry.maxInches != null;

  const breakdown = [
    { key: "matériaux décidés", applicable: true, earned: Math.min(decided, 3) * 10, max: 30 },
    {
      key: "grosseur maximale", applicable: sizeRelevant,
      earned: sizeRelevant && profile.granulometry.maxInches != null ? 20 : 0, max: sizeRelevant ? 20 : 0,
    },
    { key: "refus documentés", applicable: true, earned: profile.exclusions.length ? 10 : 0, max: 10 },
    { key: "camions / accès", applicable: true, earned: profile.trucks.codes.length ? 15 : 0, max: 15 },
    { key: "capacité", applicable: true, earned: profile.capacity.known ? 10 : 0, max: 10 },
    {
      key: "disponibilité confirmée", applicable: true,
      earned: profile.availability.freshness.state === "CONFIRMEE" ? 15
        : profile.availability.freshness.state === "A_REVALIDER" ? 7 : 0,
      max: 15,
    },
  ];
  const max = breakdown.reduce((s, b) => s + b.max, 0) || 1;
  const earned = breakdown.reduce((s, b) => s + b.earned, 0);
  const score = Math.round((earned / max) * 100);
  return { score, breakdown, decidable: decided > 0 && (!sizeRelevant || profile.granulometry.maxInches != null) };
}

// ---------------- 8. Les cas à valider : A / B / C ----------------

export type ValidationCaseKind = "A_ERREUR_INTERPRETATION" | "B_INFORMATION_MANQUANTE" | "C_CONFIRMATION_CLIENT";

export const VALIDATION_CASE_LABELS: Record<ValidationCaseKind, string> = {
  A_ERREUR_INTERPRETATION: "Erreur d'interprétation",
  B_INFORMATION_MANQUANTE: "Information manquante",
  C_CONFIRMATION_CLIENT: "Confirmation du client nécessaire",
};

export interface ValidationCase { kind: ValidationCaseKind; label: string; reason: string }

export function classifyValidationCase(
  profile: EnrichedProfile, acceptance?: AcceptanceProfile,
): ValidationCase {
  const mk = (kind: ValidationCaseKind, reason: string): ValidationCase =>
    ({ kind, label: VALIDATION_CASE_LABELS[kind], reason });

  if (acceptance?.contradictions.length) {
    return mk("A_ERREUR_INTERPRETATION", acceptance.contradictions[0].label);
  }
  if (acceptance?.usageOnly) {
    return mk("A_ERREUR_INTERPRETATION", "le texte décrit un usage, pas un matériau reçu");
  }
  if (profile.materials.some((m) => m.materialKey === "materiel_inconnu")) {
    return mk("A_ERREUR_INTERPRETATION", "matériel non reconnu dans le texte original");
  }
  if (profile.materials.some((m) => m.stance === "COMPATIBLE_PROBABLE" || m.stance === "A_CONFIRMER")) {
    return mk("C_CONFIRMATION_CLIENT", "des acceptations probables attendent une confirmation humaine");
  }
  return mk("B_INFORMATION_MANQUANTE", "des informations utiles ne sont jamais documentées");
}

// ---------------- 9. Carte de qualification et file ----------------

export interface QueueCardInput {
  profile: EnrichedProfile;
  loads: LoadComposition[];
  reference?: string | null;
  city?: string | null;
  contactName?: string | null;
  phone?: string | null;
  acceptance?: AcceptanceProfile;
}

export interface QueueCard {
  version: string;
  submissionId: string;
  reference: string | null;
  city: string | null;
  contactName: string | null;
  phone: string | null;
  available: boolean;
  freshness: EnrichedProfile["availability"]["freshness"];
  counts: MatchCounts;
  /** Total de chargements simulés confrontés à la demande. */
  potential: number;
  priority: PriorityResult;
  quality: QualityResult;
  validationCase: ValidationCase;
  recommended: QueueQuestion | null;
  /** Impact estimé d'un « oui » à la question recommandée. */
  estimatedGain: number;
  questions: QueueQuestion[];
}

export function buildQueueCard(input: QueueCardInput): QueueCard {
  const { profile, loads } = input;
  const questions = buildQuestions(profile, loads);
  const recommended = questions[0] ?? null;
  const counts = countMatches(profile, loads);
  return {
    version: QUALIFICATION_QUEUE_VERSION,
    submissionId: profile.submissionId,
    reference: input.reference ?? null,
    city: input.city ?? null,
    contactName: input.contactName ?? null,
    phone: input.phone ?? null,
    available: profile.availability.available,
    freshness: profile.availability.freshness,
    counts,
    potential: loads.length,
    priority: priorityScore(profile, loads),
    quality: qualityScore(profile),
    validationCase: classifyValidationCase(profile, input.acceptance),
    recommended,
    estimatedGain: recommended
      ? answerImpact(profile, loads, recommended, "OUI", { maxInches: 24 }).gain
      : 0,
    questions,
  };
}

export function buildQueue(inputs: QueueCardInput[]): QueueCard[] {
  return inputs
    .map(buildQueueCard)
    .sort((a, b) => b.priority.score - a.priority.score || b.estimatedGain - a.estimatedGain);
}

// ---------------- 10. Indicateurs administrateur ----------------

export interface QueueIndicators {
  analyzed: number;
  sufficientlyQualified: number;
  toEnrich: number;
  priorityQuestions: number;
  unlockableMatches: number;
  confirmedToday: number;
}

export function queueIndicators(cards: QueueCard[], confirmedToday = 0): QueueIndicators {
  const qualified = cards.filter((c) => c.quality.decidable && c.quality.score >= 60);
  return {
    analyzed: cards.length,
    sufficientlyQualified: qualified.length,
    toEnrich: cards.length - qualified.length,
    priorityQuestions: cards.filter((c) => c.recommended && c.recommended.unlocked > 0).length,
    unlockableMatches: cards.reduce((s, c) => s + Math.max(0, c.estimatedGain), 0),
    confirmedToday,
  };
}

// ---------------- 11. Brouillon de journal (LOT 14) — jamais écrit ici ----------------

const DECISION_OF: Record<Exclude<AnswerKind, "PASSER">, JournalDraft["decision"]> = {
  OUI: "ACCEPTED",
  NON: "REFUSED",
  CA_DEPEND: "CONFIRMED",
  JE_NE_SAIS_PAS: "UNKNOWN",
};

/**
 * Traduit une réponse humaine en entrée de journal traçable
 * (date, utilisateur, source, valeur précédente, nouvelle valeur, confiance, champ).
 * Ce lot NE L'ENREGISTRE PAS : la sauvegarde reste derrière les drapeaux du LOT 14.
 */
export function answerToJournalDraft(args: {
  profile: EnrichedProfile;
  question: QueueQuestion;
  answer: AnswerKind;
  detail?: AnswerDetail;
  confirmedBy: string;
  now?: Date;
}): JournalDraft | null {
  const { profile, question, answer, detail = {}, confirmedBy } = args;
  if (answer === "PASSER") return null;
  const previous =
    question.category === "material"
      ? profile.materials.find((m) => m.materialKey === question.subject)?.stance ?? "INCONNU"
      : question.category === "granulometry" ? profile.granulometry.maxInches
      : question.category === "truck" ? profile.trucks.codes
      : question.category === "capacity" ? profile.capacity.remaining
      : null;

  return {
    submissionId: profile.submissionId,
    category: question.category,
    subject: question.subject,
    previousValue: previous,
    proposedValue: question.text,
    confirmedValue: answer === "CA_DEPEND" ? { answer, ...detail } : answer,
    decision: DECISION_OF[answer],
    source: "qualification_queue_v2",
    confidenceBefore: answer === "JE_NE_SAIS_PAS" ? "INCONNU" : "MOYENNE",
    originalText: profile.originalText,
    note: detail.note ?? null,
    confirmedBy,
    confirmedAt: (args.now ?? new Date()).toISOString(),
  };
}
