// ============================================================
// LOT 14 — CONFIRMATION HUMAINE RÉELLE, JOURNAL D'AUDIT,
//          PROFIL COURANT CALCULÉ ET QUALIFICATION PROGRESSIVE
// ------------------------------------------------------------
// Couche PURE (aucun accès réseau, aucune écriture ici).
// Réutilise : nlu/chantier, matching/compatibility, qualification/lot12,
// qualification/lot13. Les écritures réelles vivent dans
// src/lib/qualification/writes.ts, derrière le drapeau
// qualification_writes_v2 (FAUX par défaut, FAUX en production).
//
// RÈGLES ABSOLUES :
//   - la donnée originale n'est JAMAIS réécrite : tout est additif;
//   - une proposition IA n'est JAMAIS une confirmation humaine;
//   - UNKNOWN ≠ REFUSED;
//   - un refus explicite bat TOUJOURS une acceptation large;
//   - une correction n'efface rien : elle ajoute une entrée qui
//     remplace logiquement la précédente;
//   - « remblai / remplissage / fill / backfill » = USAGE, pas matériau;
//   - « terre propre » = déclaration du client, jamais une caractérisation;
//   - une limite de calibre ne s'applique qu'aux matériaux concernés;
//   - confirmer des matériaux ne touche JAMAIS la disponibilité ni le CRM.
// ============================================================

import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import {
  evaluateMaterialCompatibility, isSizeRelevant,
  type AcceptanceStatus, type CapacityUnit, type CompatibilityEvaluation,
  type EnvironmentStatus, type FillRequestProfile, type LoadComposition,
} from "@/lib/matching/compatibility";
import type { AcceptanceProfile, ConfidenceLevel } from "@/lib/qualification/lot13";

export const QUALIFICATION_JOURNAL_VERSION = "qualification-journal-v1";

// ---------------- 1. Journal ----------------

export type DecisionKind = "ACCEPTED" | "REFUSED" | "UNKNOWN" | "CONFIRMED" | "CORRECTED";

export type QualificationCategory =
  | "material" | "granulometry" | "condition" | "environment"
  | "capacity" | "truck" | "access" | "acceptance_mode" | "request";

export interface JournalEntry {
  id: string;
  submissionId: string;
  category: QualificationCategory;
  /** Sujet précis : clé matériau, « capacity_remaining », « environment »… */
  subject: string;
  previousValue?: unknown;
  proposedValue?: unknown;
  confirmedValue?: unknown;
  decision: DecisionKind;
  source: string;
  confidenceBefore?: ConfidenceLevel | null;
  /** Copie du texte original — pour la traçabilité, jamais pour l'écraser. */
  originalText?: string | null;
  supersedesId?: string | null;
  note?: string | null;
  confirmedBy: string;
  confirmedAt: string;
  createdAt: string;
}

export type JournalDraft = Omit<JournalEntry, "id" | "createdAt"> & { id?: string; createdAt?: string };

export const journalKey = (category: QualificationCategory, subject: string) => `${category}:${subject}`;

const time = (e: JournalEntry) => new Date(e.confirmedAt || e.createdAt).getTime();

/** Trie du plus ancien au plus récent (ordre d'insertion comme départage). */
export function sortJournal(entries: JournalEntry[]): JournalEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (time(a.e) - time(b.e)) || (a.i - b.i))
    .map((x) => x.e);
}

/** Dernière décision valide par sujet — les entrées antérieures restent au journal. */
export function latestBySubject(entries: JournalEntry[]): Map<string, JournalEntry> {
  const out = new Map<string, JournalEntry>();
  for (const e of sortJournal(entries)) out.set(journalKey(e.category, e.subject), e);
  return out;
}

/** Historique complet d'un sujet, du plus récent au plus ancien. */
export function historyOf(
  entries: JournalEntry[], category: QualificationCategory, subject: string,
): JournalEntry[] {
  return sortJournal(entries)
    .filter((e) => e.category === category && e.subject === subject)
    .reverse();
}

// ---------------- 2. Création / correction / annulation ----------------

export interface DecisionAuthor { confirmedBy: string; now?: Date }

function stamp(author: DecisionAuthor): { confirmedAt: string } {
  return { confirmedAt: (author.now ?? new Date()).toISOString() };
}

export function buildDecisionEntry(args: {
  submissionId: string;
  category: QualificationCategory;
  subject: string;
  decision: DecisionKind;
  proposedValue?: unknown;
  confirmedValue?: unknown;
  previousValue?: unknown;
  confidenceBefore?: ConfidenceLevel | null;
  originalText?: string | null;
  note?: string | null;
  supersedesId?: string | null;
  source?: string;
  author: DecisionAuthor;
}): JournalDraft {
  return {
    submissionId: args.submissionId,
    category: args.category,
    subject: args.subject,
    decision: args.decision,
    proposedValue: args.proposedValue ?? null,
    confirmedValue: args.confirmedValue ?? null,
    previousValue: args.previousValue ?? null,
    confidenceBefore: args.confidenceBefore ?? null,
    originalText: args.originalText ?? null,
    note: args.note ?? null,
    supersedesId: args.supersedesId ?? null,
    source: args.source ?? "admin_manual",
    confirmedBy: args.author.confirmedBy,
    ...stamp(args.author),
  };
}

/**
 * Correction : NE SUPPRIME RIEN. Ajoute une entrée qui remplace logiquement
 * la précédente (supersedesId) et conserve l'ancienne valeur.
 */
export function buildCorrectionEntry(
  previous: JournalEntry,
  next: { decision: DecisionKind; confirmedValue?: unknown; note?: string | null },
  author: DecisionAuthor,
): JournalDraft {
  return buildDecisionEntry({
    submissionId: previous.submissionId,
    category: previous.category,
    subject: previous.subject,
    decision: next.decision,
    previousValue: previous.confirmedValue ?? previous.decision,
    proposedValue: previous.proposedValue ?? null,
    confirmedValue: next.confirmedValue ?? next.decision,
    confidenceBefore: previous.confidenceBefore ?? null,
    originalText: previous.originalText ?? null,
    note: next.note ?? "correction de la qualification précédente",
    supersedesId: previous.id,
    author,
  });
}

/** « Corriger la dernière qualification » : revient à l'état antérieur, sans effacer. */
export function buildRollbackEntry(
  entries: JournalEntry[], category: QualificationCategory, subject: string, author: DecisionAuthor,
): JournalDraft | null {
  const hist = historyOf(entries, category, subject);
  if (hist.length === 0) return null;
  const last = hist[0];
  const before = hist[1];
  return buildCorrectionEntry(
    last,
    {
      decision: before ? before.decision : "UNKNOWN",
      confirmedValue: before ? before.confirmedValue ?? before.decision : null,
      note: before ? "retour à la qualification précédente" : "annulation : retour à inconnu",
    },
    author,
  );
}

// ---------------- 3. Profil courant calculé ----------------

export type ValueOrigin =
  | "human_recent" | "human_previous" | "explicit_text"
  | "historical" | "nlu_high" | "nlu_medium" | "unknown";

/** Priorité décroissante demandée au Lot 14. */
export const ORIGIN_PRIORITY: ValueOrigin[] = [
  "human_recent", "human_previous", "explicit_text", "historical", "nlu_high", "nlu_medium", "unknown",
];

export const originRank = (o: ValueOrigin) => ORIGIN_PRIORITY.indexOf(o);

export interface QualifiedMaterial {
  materialKey: MaterialKey;
  label: string;
  status: AcceptanceStatus;
  origin: ValueOrigin;
  humanConfirmed: boolean;
  confidence: ConfidenceLevel;
  maxInches: number | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

export interface QualifiedCapacity {
  total: number | null;
  remaining: number | null;
  unit: CapacityUnit | null;
  confirmedAt: string | null;
  humanConfirmed: boolean;
}

export interface QualifiedProfile {
  version: string;
  submissionId: string;
  /** Texte original, strictement inchangé. */
  originalText: string;
  acceptanceMode: "broad" | "explicit" | "unknown";
  acceptanceModeHumanConfirmed: boolean;
  materials: QualifiedMaterial[];
  /** Exclusions explicites : prioritaires même en acceptation large. */
  exclusions: MaterialKey[];
  conditions: { label: string; humanConfirmed: boolean }[];
  environment: {
    status: EnvironmentStatus;
    humanConfirmed: boolean;
    /** Déclarations du client (« terre propre »…) — jamais une caractérisation. */
    declarations: string[];
  };
  capacity: QualifiedCapacity;
  trucks: { codes: string[]; humanConfirmed: boolean };
  accessConstraints: { labels: string[]; humanConfirmed: boolean };
  requestConfirmedBy: string | null;
  requestConfirmedAt: string | null;
  /** Disponibilité / CRM : affichés seulement, jamais modifiés ici. */
  available: boolean;
  freshness: AcceptanceProfile["freshness"];
  journalSize: number;
}

const asStatus = (d: DecisionKind, fallback: AcceptanceStatus): AcceptanceStatus =>
  d === "ACCEPTED" ? "ACCEPTED" : d === "REFUSED" ? "REFUSED" : d === "UNKNOWN" ? "UNKNOWN" : fallback;

/**
 * Reconstitue le profil courant : historique original + propositions NLU +
 * confirmations et corrections humaines. Rien n'est recopié inutilement.
 */
export function buildQualifiedProfile(
  profile: AcceptanceProfile, entries: JournalEntry[] = [],
): QualifiedProfile {
  const mine = entries.filter((e) => e.submissionId === profile.submissionId);
  const latest = latestBySubject(mine);
  const counts = new Map<string, number>();
  for (const e of mine) {
    const k = journalKey(e.category, e.subject);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const byKey = new Map<MaterialKey, QualifiedMaterial>();
  const push = (
    key: MaterialKey, status: AcceptanceStatus, origin: ValueOrigin,
    confidence: ConfidenceLevel, maxInches: number | null,
  ) => {
    const prev = byKey.get(key);
    if (prev && originRank(prev.origin) <= originRank(origin)) return;
    byKey.set(key, {
      materialKey: key, label: MATERIAL_LABELS[key], status, origin,
      humanConfirmed: false, confidence, maxInches,
      confirmedAt: null, confirmedBy: null,
    });
  };

  // Base : propositions NLU / texte explicite / historique (jamais modifiées).
  for (const m of profile.accepted) push(m.materialKey, "ACCEPTED", m.source === "structured_historical" ? "historical" : m.source === "original_text" ? "explicit_text" : m.confidence === "HAUTE" ? "nlu_high" : "nlu_medium", m.confidence, null);
  for (const m of profile.refused) push(m.materialKey, "REFUSED", m.source === "original_text" ? "explicit_text" : "nlu_high", m.confidence, null);
  for (const m of profile.unknown) push(m.materialKey, "UNKNOWN", "unknown", "INCONNU", null);

  // Calibre proposé : uniquement aux matériaux concernés.
  const proposedMax = profile.dimensions.maxInches;
  if (proposedMax != null) {
    for (const m of byKey.values()) if (isSizeRelevant(m.materialKey)) m.maxInches = proposedMax;
  }

  // Confirmations humaines : priorité absolue.
  for (const [key, entry] of latest) {
    if (!key.startsWith("material:")) continue;
    const mk = entry.subject as MaterialKey;
    const base = byKey.get(mk);
    const total = counts.get(key) ?? 1;
    byKey.set(mk, {
      materialKey: mk,
      label: MATERIAL_LABELS[mk] ?? mk,
      status: asStatus(entry.decision, base?.status ?? "UNKNOWN"),
      origin: total > 1 ? "human_recent" : "human_recent",
      humanConfirmed: entry.decision !== "UNKNOWN",
      confidence: entry.decision === "UNKNOWN" ? "INCONNU" : "CONFIRME",
      maxInches: base?.maxInches ?? null,
      confirmedAt: entry.confirmedAt,
      confirmedBy: entry.confirmedBy,
    });
  }

  // Calibre confirmé par matériau.
  for (const [key, entry] of latest) {
    if (!key.startsWith("granulometry:")) continue;
    const mk = entry.subject as MaterialKey;
    const m = byKey.get(mk);
    const value = typeof entry.confirmedValue === "number" ? entry.confirmedValue : null;
    if (m) m.maxInches = value;
    else if (MATERIAL_LABELS[mk]) {
      byKey.set(mk, {
        materialKey: mk, label: MATERIAL_LABELS[mk], status: "UNKNOWN", origin: "human_recent",
        humanConfirmed: false, confidence: "INCONNU", maxInches: value,
        confirmedAt: entry.confirmedAt, confirmedBy: entry.confirmedBy,
      });
    }
  }

  const materials = [...byKey.values()];
  const exclusions = materials.filter((m) => m.status === "REFUSED").map((m) => m.materialKey);

  const modeEntry = latest.get(journalKey("acceptance_mode", "mode"));
  const acceptanceMode: QualifiedProfile["acceptanceMode"] = modeEntry
    ? (entryString(modeEntry.confirmedValue) === "broad" ? "broad" : "explicit")
    : profile.broadAcceptance ? "broad" : profile.accepted.length ? "explicit" : "unknown";

  const conditionEntries = [...latest.entries()].filter(([k]) => k.startsWith("condition:"));
  const conditions = [
    ...profile.conditions.map((label) => ({ label, humanConfirmed: false })),
    ...conditionEntries
      .filter(([, e]) => e.decision === "ACCEPTED" || e.decision === "CONFIRMED")
      .map(([, e]) => ({ label: e.subject, humanConfirmed: true })),
  ].filter((c, i, arr) => arr.findIndex((x) => x.label === c.label) === i);

  const envEntry = latest.get(journalKey("environment", "environment"));
  const envValue = entryString(envEntry?.confirmedValue) as EnvironmentStatus | null;

  const capTotal = latest.get(journalKey("capacity", "capacity_total"));
  const capRemaining = latest.get(journalKey("capacity", "capacity_remaining"));
  const capUnit = latest.get(journalKey("capacity", "capacity_unit"));

  const truckEntry = latest.get(journalKey("truck", "trucks"));
  const accessEntry = latest.get(journalKey("access", "constraints"));
  const requestEntry = latest.get(journalKey("request", "qualification"));

  return {
    version: QUALIFICATION_JOURNAL_VERSION,
    submissionId: profile.submissionId,
    originalText: profile.originalText,
    acceptanceMode,
    acceptanceModeHumanConfirmed: !!modeEntry,
    materials,
    exclusions,
    conditions,
    environment: {
      status: envValue ?? "UNKNOWN",
      humanConfirmed: !!envEntry,
      declarations: profile.environmental.declarations,
    },
    capacity: {
      total: numberOf(capTotal?.confirmedValue) ?? profile.capacity.value,
      remaining: numberOf(capRemaining?.confirmedValue),
      unit: (entryString(capUnit?.confirmedValue) as CapacityUnit | null) ?? profile.capacity.unit,
      confirmedAt: capRemaining?.confirmedAt ?? capTotal?.confirmedAt ?? null,
      humanConfirmed: !!(capTotal || capRemaining),
    },
    trucks: {
      codes: stringArray(truckEntry?.confirmedValue) ?? profile.truckConstraints,
      humanConfirmed: !!truckEntry,
    },
    accessConstraints: {
      labels: stringArray(accessEntry?.confirmedValue) ?? [],
      humanConfirmed: !!accessEntry,
    },
    requestConfirmedBy: requestEntry?.confirmedBy ?? null,
    requestConfirmedAt: requestEntry?.confirmedAt ?? null,
    available: profile.available,
    freshness: profile.freshness,
    journalSize: mine.length,
  };
}

function entryString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numberOf(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function stringArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

// ---------------- 4. Profil de compatibilité recalculé ----------------

/** Profil de matching V2 INTERNE issu du profil courant (refus > acceptation large). */
export function toFillProfile(q: QualifiedProfile, base: FillRequestProfile): FillRequestProfile {
  const materials = q.materials.map((m) => ({
    materialKey: m.materialKey,
    label: m.label,
    status: m.status,
    maxInches: m.maxInches,
    source: (m.humanConfirmed ? "admin_manual" : "inferred_pending_review") as FillRequestProfile["materials"][number]["source"],
    confidence: (m.humanConfirmed ? "high" : m.confidence === "HAUTE" ? "high" : "low") as "high" | "medium" | "low",
    confirmedAt: m.confirmedAt,
    confirmedBy: m.confirmedBy,
  }));
  return {
    ...base,
    scope: q.acceptanceMode === "broad" ? "broad" : q.acceptanceMode === "explicit" ? "explicit" : "unknown",
    materials,
    conditions: q.conditions.map((c) => c.label),
    environmentStatus: q.environment.status,
    capacity: {
      kind: q.capacity.remaining != null || q.capacity.total != null ? "known" : base.capacity.kind,
      value: q.capacity.remaining ?? q.capacity.total ?? base.capacity.value,
      unit: q.capacity.unit ?? base.capacity.unit,
    },
    originalText: q.originalText,
  };
}

export interface MatchingSnapshot { certain: number; potential: number; incompatible: number }

export function matchingSnapshot(profile: FillRequestProfile, loads: LoadComposition[]): MatchingSnapshot {
  let certain = 0, potential = 0, incompatible = 0;
  for (const load of loads) {
    const r: CompatibilityEvaluation = evaluateMaterialCompatibility(load, profile);
    if (r.result === "COMPATIBLE") certain += 1;
    else if (r.result === "NEEDS_REVIEW") potential += 1;
    else incompatible += 1;
  }
  return { certain, potential, incompatible };
}

/** AVANT / APRÈS réellement calculés — aucun chiffre inventé. */
export function matchingDelta(
  profile: AcceptanceProfile, entries: JournalEntry[], loads: LoadComposition[],
): { before: MatchingSnapshot; after: MatchingSnapshot } {
  const before = matchingSnapshot(toFillProfile(buildQualifiedProfile(profile, []), profile.fillProfile), loads);
  const after = matchingSnapshot(toFillProfile(buildQualifiedProfile(profile, entries), profile.fillProfile), loads);
  return { before, after };
}

// ---------------- 5. Confirmation ultra rapide ----------------

export interface PendingQuestion {
  category: QualificationCategory;
  subject: string;
  label: string;
  question: string;
  options: ("ACCEPTED" | "REFUSED" | "UNKNOWN")[];
}

export interface FastTrack {
  /** Propositions certaines confirmables en un seul geste. */
  certain: QualifiedMaterial[];
  /** Uniquement les décisions UTILES (pas 45 questions). */
  questions: PendingQuestion[];
  requiresConfirmationDialog: boolean;
}

export function fastTrack(q: QualifiedProfile, maxQuestions = 5): FastTrack {
  const certain = q.materials.filter(
    (m) => !m.humanConfirmed && m.status !== "UNKNOWN" &&
      (m.origin === "explicit_text" || m.origin === "historical" || m.origin === "nlu_high"),
  );
  const questions: PendingQuestion[] = q.materials
    .filter((m) => !m.humanConfirmed && (m.status === "UNKNOWN" || m.origin === "nlu_medium"))
    .slice(0, maxQuestions)
    .map((m) => ({
      category: "material" as const,
      subject: m.materialKey,
      label: m.label,
      question: `${m.label} ?`,
      options: ["ACCEPTED", "REFUSED", "UNKNOWN"],
    }));
  return { certain, questions, requiresConfirmationDialog: certain.length > 1 };
}

/** Entrées de journal pour « confirmer les propositions certaines ». */
export function buildBulkConfirmation(
  profile: AcceptanceProfile, q: QualifiedProfile, author: DecisionAuthor,
): JournalDraft[] {
  return fastTrack(q).certain.map((m) =>
    buildDecisionEntry({
      submissionId: profile.submissionId,
      category: "material",
      subject: m.materialKey,
      decision: m.status === "ACCEPTED" ? "ACCEPTED" : "REFUSED",
      proposedValue: m.status,
      confirmedValue: m.status,
      confidenceBefore: m.confidence,
      originalText: profile.originalText,
      note: "confirmation groupée des propositions certaines",
      author,
    }),
  );
}

/** Acceptation large + exclusions explicites (les exclusions gagnent toujours). */
export function buildBroadAcceptance(
  submissionId: string, exclusions: MaterialKey[], author: DecisionAuthor, originalText?: string,
): JournalDraft[] {
  const mode = buildDecisionEntry({
    submissionId, category: "acceptance_mode", subject: "mode",
    decision: "CONFIRMED", confirmedValue: "broad", originalText: originalText ?? null,
    note: "accepte presque tout, sauf exclusions explicites", author,
  });
  return [
    mode,
    ...exclusions.map((key) => buildDecisionEntry({
      submissionId, category: "material", subject: key, decision: "REFUSED",
      confirmedValue: "REFUSED", originalText: originalText ?? null,
      note: "exclusion explicite de l'acceptation large", author,
    })),
  ];
}

/** Confirmation globale : les inconnus RESTENT inconnus. */
export function buildRequestConfirmation(
  submissionId: string, q: QualifiedProfile, author: DecisionAuthor,
): JournalDraft {
  const unknowns = q.materials.filter((m) => m.status === "UNKNOWN").length;
  return buildDecisionEntry({
    submissionId, category: "request", subject: "qualification", decision: "CONFIRMED",
    confirmedValue: { confirmedMaterials: q.materials.filter((m) => m.status !== "UNKNOWN").length, stillUnknown: unknowns },
    note: "confirmation globale de la dompe — les informations inconnues restent inconnues",
    author,
  });
}

// ---------------- 6. Score de complétude ----------------

export interface CompletenessResult {
  score: number;
  essentialComplete: boolean;
  rows: { key: string; label: string; applicable: boolean; complete: boolean }[];
  missing: string[];
}

/** Seules les informations PERTINENTES comptent. */
export function completeness(q: QualifiedProfile): CompletenessResult {
  const accepted = q.materials.filter((m) => m.status === "ACCEPTED");
  const sizeRelevantAccepted = accepted.filter((m) => isSizeRelevant(m.materialKey));
  const rows = [
    {
      key: "materiaux", label: "Matériaux acceptés", applicable: true,
      complete: accepted.length > 0 || q.acceptanceMode === "broad",
    },
    {
      key: "confirmation", label: "Confirmation humaine", applicable: true,
      complete: q.materials.some((m) => m.humanConfirmed),
    },
    {
      key: "calibre", label: "Calibre maximal", applicable: sizeRelevantAccepted.length > 0,
      complete: sizeRelevantAccepted.every((m) => m.maxInches != null),
    },
    {
      key: "capacite", label: "Capacité", applicable: true,
      complete: q.capacity.total != null || q.capacity.remaining != null,
    },
    {
      key: "camions", label: "Camions acceptés", applicable: true,
      complete: q.trucks.codes.length > 0,
    },
    {
      key: "acces", label: "Contraintes d'accès", applicable: q.accessConstraints.humanConfirmed,
      complete: q.accessConstraints.labels.length > 0,
    },
    {
      key: "environnement", label: "Environnement", applicable: q.environment.humanConfirmed,
      complete: q.environment.status !== "UNKNOWN",
    },
  ];
  const applicable = rows.filter((r) => r.applicable);
  const done = applicable.filter((r) => r.complete).length;
  const score = Math.round((done / (applicable.length || 1)) * 100);
  const essentialComplete = rows[0].complete && rows[1].complete && rows[3].complete;
  return { score, essentialComplete, rows, missing: applicable.filter((r) => !r.complete).map((r) => r.label) };
}

// ---------------- 7. Termes non reconnus / apprentissage contrôlé ----------------

export type TermDecision = "ALIAS_CREATED" | "ASSOCIATED" | "LEFT_UNKNOWN";

export interface TermProposalDraft {
  term: string;
  termNorm: string;
  context: string | null;
  occurrences: number;
  proposedMaterialKey: MaterialKey | null;
}

export const normalizeTerm = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export function buildTermProposal(input: {
  term: string; context?: string | null; occurrences?: number; proposedMaterialKey?: MaterialKey | null;
}): TermProposalDraft {
  return {
    term: input.term,
    termNorm: normalizeTerm(input.term),
    context: input.context ?? null,
    occurrences: input.occurrences ?? 1,
    proposedMaterialKey: input.proposedMaterialKey ?? null,
  };
}

export interface AliasDraft {
  expression: string;
  expression_norm: string;
  material_keys: MaterialKey[];
  validated_by_admin: true;
  is_active: boolean;
  confidence: "high";
  notes: string;
}

/** Aucun alias automatique : une décision humaine explicite est obligatoire. */
export function buildAliasFromDecision(
  proposal: TermProposalDraft, decision: TermDecision, materialKey: MaterialKey | null, author: DecisionAuthor,
): AliasDraft | null {
  if (decision === "LEFT_UNKNOWN") return null;
  if (!materialKey) throw new Error("Un alias exige un matériau confirmé par un humain.");
  return {
    expression: proposal.term,
    expression_norm: proposal.termNorm,
    material_keys: [materialKey],
    validated_by_admin: true,
    is_active: true,
    confidence: "high",
    notes: `alias confirmé par ${author.confirmedBy} · occurrences observées : ${proposal.occurrences}`,
  };
}
