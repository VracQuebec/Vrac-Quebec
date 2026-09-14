// ============================================================
// LOT 12 — QUALIFICATION DES DEMANDES DE REMBLAI
// ------------------------------------------------------------
// Couche PURE et ADDITIVE. Elle réutilise :
//   - src/lib/nlu/chantier.ts           (interprétation du langage)
//   - src/lib/matching/compatibility.ts (acceptation / refus / calibre)
// Elle n'écrit rien, n'active rien (drapeau material_qualification_v2),
// et ne transforme JAMAIS une interprétation automatique en
// confirmation humaine.
//
// Règles fondamentales :
//   - ABSENCE ≠ REFUS : un matériau non mentionné reste INCONNU.
//   - INCOMPATIBLE exige une incompatibilité réelle.
//   - Une information inconnue non pertinente pour le chargement
//     ne doit pas provoquer « à confirmer ».
//   - Une source faible n'écrase jamais une source forte.
// ============================================================

import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import {
  interpretChantier, type ChantierInterpretation, type Restriction,
} from "@/lib/nlu/chantier";
import {
  buildFillProfileFromInterpretation, isSizeRelevant,
  type AcceptanceScope, type AcceptanceStatus, type CapacityKind, type CapacityUnit,
  type CompatibilityEvaluation, type EnvironmentStatus, type FillRequestProfile,
} from "@/lib/matching/compatibility";

export const QUALIFICATION_VERSION = "qualification-v1";

// ---------------- 21. Priorité des sources ----------------

export type QualificationSource =
  | "human_recent" | "human_historical" | "human_refusal"
  | "original_text" | "structured_historical"
  | "nlu_high" | "nlu_medium" | "unknown";

const SOURCE_RANK: Record<QualificationSource, number> = {
  human_recent: 1, human_historical: 2, human_refusal: 3, original_text: 4,
  structured_historical: 5, nlu_high: 6, nlu_medium: 7, unknown: 8,
};

export const sourceRank = (s: QualificationSource) => SOURCE_RANK[s];
export const isStrongerSource = (a: QualificationSource, b: QualificationSource) =>
  SOURCE_RANK[a] < SOURCE_RANK[b];

export interface QualificationSignal {
  materialKey: MaterialKey;
  status: AcceptanceStatus;
  source: QualificationSource;
  originalText?: string | null;
  confidence?: "high" | "medium" | "low";
}

/** Une source faible ne peut jamais écraser une source plus forte. */
export function resolveSignals(signals: QualificationSignal[]): QualificationSignal[] {
  const best = new Map<MaterialKey, QualificationSignal>();
  for (const s of signals) {
    const cur = best.get(s.materialKey);
    if (!cur || isStrongerSource(s.source, cur.source)) best.set(s.materialKey, s);
  }
  return Array.from(best.values());
}

// ---------------- 3. Refus explicites lus dans les textes ----------------

export interface RefusalRead {
  kind: "MATERIAU" | "ENVIRONNEMENT" | "DIMENSION" | "AUTRE";
  materialKey?: MaterialKey;
  label: string;
  /** false = formulation ambiguë (« pas trop de glaise ») → validation humaine. */
  certain: boolean;
  originalExpression: string;
}

/**
 * Lecture seule : extrait les refus/restrictions présents dans un texte historique.
 * « pas mal de roche » n'est jamais un refus; « rien de contaminé » n'est pas un matériau.
 */
export function extractExplicitRefusals(text: string): RefusalRead[] {
  const i = interpretChantier(text, { direction: "RECEPTION" });
  return i.restrictions.map((r: Restriction) => ({
    kind: r.kind === "MATERIAU" ? "MATERIAU" : r.kind === "ENVIRONNEMENT" ? "ENVIRONNEMENT" : r.kind === "DIMENSION" ? "DIMENSION" : "AUTRE",
    materialKey: r.materialKey,
    label: r.label,
    certain: r.ambiguous !== true,
    originalExpression: r.originalExpression,
  }));
}

// ---------------- 13/14/15. Propositions de qualification ----------------

export type ProposalConfidence = "high" | "medium" | "low";

export interface ProposedMaterial {
  materialKey: MaterialKey;
  label: string;
  status: AcceptanceStatus;
  source: QualificationSource;
  confidence: ProposalConfidence;
  originalExpression: string;
}

export interface QualificationProposal {
  version: string;
  submissionId: string;
  /** Jamais écrasé, jamais nettoyé. */
  originalText: string;
  scope: AcceptanceScope;
  detected: ProposedMaterial[];
  toConfirm: ProposedMaterial[];
  refusals: RefusalRead[];
  granulometries: { label: string; maxInches: number | null; qualitative: boolean }[];
  conditions: string[];
  environmentStatus: EnvironmentStatus;
  capacity: { kind: CapacityKind; value: number | null; unit: CapacityUnit | null };
  confidence: ProposalConfidence;
  /** Vue « confirmations rapides » : groupe confirmable en une seule action. */
  groupConfirmable: boolean;
  ambiguityReasons: string[];
  interpretation: ChantierInterpretation;
  profile: FillRequestProfile;
}

export interface QualificationInput {
  submissionId: string;
  /** Texte historique concaténé (description, autre matériau, notes…). */
  text: string;
  /** Matériaux déjà reliés à la demande (relations historiques). */
  historicalMaterials?: MaterialKey[];
  trips?: number | null;
}

export function buildQualificationProposal(input: QualificationInput): QualificationProposal {
  const i = interpretChantier(input.text || "", { direction: "RECEPTION" });
  const profile = buildFillProfileFromInterpretation(i, { id: input.submissionId });

  const detected: ProposedMaterial[] = [];
  const toConfirm: ProposedMaterial[] = [];

  for (const m of i.materials) {
    if (m.key === "materiel_inconnu") continue;
    const conf: ProposalConfidence = m.confidence >= 0.9 ? "high" : m.confidence >= 0.7 ? "medium" : "low";
    const item: ProposedMaterial = {
      materialKey: m.key,
      label: MATERIAL_LABELS[m.key],
      status: "ACCEPTED",
      source: conf === "high" ? "original_text" : conf === "medium" ? "nlu_high" : "nlu_medium",
      confidence: conf,
      originalExpression: m.matchedExpression,
    };
    (conf === "low" ? toConfirm : detected).push(item);
  }

  for (const key of input.historicalMaterials ?? []) {
    if (detected.some((d) => d.materialKey === key) || toConfirm.some((d) => d.materialKey === key)) continue;
    detected.push({
      materialKey: key, label: MATERIAL_LABELS[key], status: "ACCEPTED",
      source: "structured_historical", confidence: "medium", originalExpression: "relation historique",
    });
  }

  const refusals = i.restrictions.map((r) => ({
    kind: (r.kind === "MATERIAU" ? "MATERIAU" : r.kind === "ENVIRONNEMENT" ? "ENVIRONNEMENT" : r.kind === "DIMENSION" ? "DIMENSION" : "AUTRE") as RefusalRead["kind"],
    materialKey: r.materialKey,
    label: r.label,
    certain: r.ambiguous !== true,
    originalExpression: r.originalExpression,
  }));

  for (const r of refusals) {
    if (r.kind !== "MATERIAU" || !r.materialKey) continue;
    const entry: ProposedMaterial = {
      materialKey: r.materialKey, label: MATERIAL_LABELS[r.materialKey],
      status: r.certain ? "REFUSED" : "UNKNOWN",
      source: r.certain ? "original_text" : "nlu_medium",
      confidence: r.certain ? "high" : "low",
      originalExpression: r.originalExpression,
    };
    if (r.certain) detected.push(entry); else toConfirm.push(entry);
  }

  const ambiguityReasons: string[] = [];
  if (i.uncertaintyMarkers.length) ambiguityReasons.push(`formulation incertaine : ${i.uncertaintyMarkers.join(", ")}`);
  if (refusals.some((r) => !r.certain)) ambiguityReasons.push("restriction évoquée sans refus clair");
  if (i.materials.some((m) => m.key === "materiel_inconnu")) ambiguityReasons.push("matériau non identifié dans le texte");
  if (!detected.length && !toConfirm.length) ambiguityReasons.push("aucun matériau exploitable dans le texte");

  const confidence: ProposalConfidence =
    detected.length > 0 && ambiguityReasons.length === 0 && detected.every((d) => d.confidence === "high")
      ? "high"
      : detected.length > 0 && ambiguityReasons.length === 0
        ? "medium"
        : "low";

  const qualitativeGran = /petites? (?:roches?|pierres?)|petits? cailloux|grosses? roches?/.test(i.normalizedText);

  return {
    version: QUALIFICATION_VERSION,
    submissionId: input.submissionId,
    originalText: input.text,
    scope: i.acceptsAlmostEverything ? "broad" : detected.length ? "explicit" : "unknown",
    detected,
    toConfirm,
    refusals,
    granulometries: i.granulometries.map((g) => ({
      label: g.label, maxInches: g.maxInches, qualitative: !g.canonical && qualitativeGran,
    })),
    conditions: i.conditions.map((c) => c.label),
    // 19. Aucune déduction environnementale : « terre propre » ne caractérise rien.
    environmentStatus: "UNKNOWN",
    capacity: input.trips != null
      ? { kind: "known", value: input.trips, unit: "voyages" }
      : i.trips != null
        ? { kind: "approximate", value: i.trips, unit: "voyages" }
        : { kind: "unknown", value: null, unit: null },
    confidence,
    groupConfirmable: confidence === "high" && detected.length > 0,
    ambiguityReasons,
    interpretation: i,
    profile,
  };
}

// ---------------- 10. Confirmation humaine traçable ----------------

export type ConfirmationSource = "admin_manual" | "owner_confirmation" | "historical_explicit" | "nlu_proposal";

export interface ConfirmationRecord {
  submission_id: string;
  material_key: MaterialKey;
  stance: AcceptanceStatus;
  source: ConfirmationSource;
  confidence: ProposalConfidence;
  original_text: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

/** Une proposition automatique (`nlu_proposal`) n'est JAMAIS une confirmation humaine. */
export function buildConfirmationRecord(args: {
  submissionId: string;
  materialKey: MaterialKey;
  stance: AcceptanceStatus;
  source: ConfirmationSource;
  confidence?: ProposalConfidence;
  originalText?: string | null;
  userId?: string | null;
  now?: string;
}): ConfirmationRecord {
  const human = args.source === "admin_manual" || args.source === "owner_confirmation";
  return {
    submission_id: args.submissionId,
    material_key: args.materialKey,
    stance: args.stance,
    source: args.source,
    confidence: args.confidence ?? (human ? "high" : "medium"),
    original_text: args.originalText ?? null,
    confirmed_by: human ? args.userId ?? null : null,
    confirmed_at: human ? args.now ?? new Date().toISOString() : null,
  };
}

export const isHumanConfirmed = (r: ConfirmationRecord) => r.confirmed_by != null && r.confirmed_at != null;

// ---------------- 11. File de validation priorisée ----------------

export interface QueueItem {
  submissionId: string;
  usable: boolean;
  available: boolean;
  acceptedCount: number;
  unknownCount: number;
  potentialMatches: number;
  lastConfirmationDays: number | null;
  missingFields: number;
}

export interface ScoredQueueItem extends QueueItem { priority: number; reasons: string[] }

export function prioritizeQueue(items: QueueItem[]): ScoredQueueItem[] {
  return items
    .map((it) => {
      const reasons: string[] = [];
      let p = 0;
      if (it.usable) { p += 40; reasons.push("demande utilisable"); }
      if (it.available) { p += 20; reasons.push("disponible"); }
      if (it.acceptedCount >= 3) { p += 10; reasons.push("peut recevoir plusieurs matériaux"); }
      p += Math.min(30, it.potentialMatches);
      if (it.potentialMatches > 0) reasons.push(`${it.potentialMatches} correspondances potentielles`);
      if (it.unknownCount > 0) { p += Math.min(15, it.unknownCount * 3); reasons.push(`${it.unknownCount} information(s) à confirmer`); }
      if (it.lastConfirmationDays == null || it.lastConfirmationDays > 180) { p += 8; reasons.push("jamais confirmée / à revalider"); }
      p += Math.min(6, it.missingFields);
      return { ...it, priority: p, reasons };
    })
    .sort((a, b) => b.priority - a.priority || a.submissionId.localeCompare(b.submissionId));
}

// ---------------- 12. Impact potentiel (jamais inventé) ----------------

export interface LoadSample { id: string; materialKeys: MaterialKey[] }

/** Nombre RÉEL de chargements analysés contenant ce matériau. */
export function impactOfConfirmation(materialKey: MaterialKey, loads: LoadSample[]): number {
  return loads.filter((l) => l.materialKeys.includes(materialKey)).length;
}

export function impactSentence(materialKey: MaterialKey, loads: LoadSample[]): string | null {
  const n = impactOfConfirmation(materialKey, loads);
  if (n <= 0) return null;
  return `Confirmer cette information pourrait débloquer ${n} correspondance${n > 1 ? "s" : ""} potentielle${n > 1 ? "s" : ""}.`;
}

// ---------------- 22. Match partiel lisible ----------------

export interface PartialMatchSummary {
  total: number;
  compatible: number;
  toConfirm: number;
  refused: number;
  label: "MATCH POTENTIEL ÉLEVÉ" | "MATCH POTENTIEL" | "À ANALYSER" | "INCOMPATIBLE";
  detail: string;
}

export function partialMatchSummary(ev: CompatibilityEvaluation): PartialMatchSummary {
  const compatible = ev.acceptedMaterials.length;
  const toConfirm = ev.unknownMaterials.length;
  const refused = ev.refusedMaterials.length;
  const total = compatible + toConfirm + refused;
  const ratio = total ? compatible / total : 0;
  const label: PartialMatchSummary["label"] =
    ev.result === "INCOMPATIBLE" ? "INCOMPATIBLE"
      : ev.result === "COMPATIBLE" || ratio >= 0.6 ? "MATCH POTENTIEL ÉLEVÉ"
        : ratio > 0 ? "MATCH POTENTIEL" : "À ANALYSER";
  const detail = `${compatible}/${total} matériaux compatibles${toConfirm ? ` · ${toConfirm} à confirmer` : ""}${refused ? ` · ${refused} refusé(s)` : ""}`;
  return { total, compatible, toConfirm, refused, label, detail };
}

// ---------------- 26. Top causes de « à confirmer » ----------------

export interface CauseCount { cause: string; requests: number; potentialMatches: number }

export function topNeedsReviewCauses(
  evaluations: { submissionId: string; evaluation: CompatibilityEvaluation }[],
  limit = 20,
): CauseCount[] {
  const map = new Map<string, { requests: Set<string>; matches: number }>();
  for (const { submissionId, evaluation } of evaluations) {
    if (evaluation.result !== "NEEDS_REVIEW") continue;
    for (const r of evaluation.reasons) {
      if (r.level !== "REVIEW") continue;
      const cause = r.code === "MATERIAL_UNKNOWN" && r.materialKey
        ? `acceptation inconnue : ${MATERIAL_LABELS[r.materialKey]}`
        : r.code === "MATERIAL_BROAD"
          ? "acceptation large non confirmée"
          : r.code === "SIZE_UNKNOWN"
            ? "calibre inconnu"
            : r.code === "NO_LOAD_MATERIAL"
              ? "chargement sans matériau identifié"
              : r.label;
      const cur = map.get(cause) ?? { requests: new Set<string>(), matches: 0 };
      cur.requests.add(submissionId);
      cur.matches += 1;
      map.set(cause, cur);
    }
  }
  return Array.from(map.entries())
    .map(([cause, v]) => ({ cause, requests: v.requests.size, potentialMatches: v.matches }))
    .sort((a, b) => b.requests - a.requests || b.potentialMatches - a.potentialMatches)
    .slice(0, limit);
}

// ---------------- 27. Comparaison de scénarios A / B / C ----------------

export interface ScenarioTotals { compatible: number; needsReview: number; incompatible: number }

export const emptyTotals = (): ScenarioTotals => ({ compatible: 0, needsReview: 0, incompatible: 0 });

export function tally(results: CompatibilityEvaluation[]): ScenarioTotals {
  const t = emptyTotals();
  for (const r of results) {
    if (r.result === "COMPATIBLE") t.compatible += 1;
    else if (r.result === "INCOMPATIBLE") t.incompatible += 1;
    else t.needsReview += 1;
  }
  return t;
}

/** Simulation seulement : aucune donnée n'est confirmée en base. */
export function simulateHighConfidenceConfirmation(
  profile: FillRequestProfile,
  proposal: QualificationProposal,
): FillRequestProfile {
  const materials = [...profile.materials];
  for (const d of proposal.detected) {
    if (d.confidence !== "high") continue;
    const existing = materials.find((m) => m.materialKey === d.materialKey);
    if (existing) { existing.status = d.status; continue; }
    materials.push({
      materialKey: d.materialKey, label: d.label, status: d.status,
      role: null, source: "historical", confidence: "high",
      confirmedAt: null, confirmedBy: null, originalExpression: d.originalExpression,
    });
  }
  return { ...profile, materials, scope: materials.length ? "explicit" : profile.scope };
}

// ---------------- 16/17/18/19/20. Référentiels d'interface ----------------

export const CAPACITY_KINDS: { value: CapacityKind; label: string }[] = [
  { value: "known", label: "Capacité connue" },
  { value: "approximate", label: "Capacité approximative" },
  { value: "unlimited", label: "Non précisée / illimitée" },
  { value: "unknown", label: "Inconnue" },
];

export const CAPACITY_UNITS: { value: CapacityUnit; label: string }[] = [
  { value: "voyages", label: "voyages" },
  { value: "tonnes", label: "tonnes" },
  { value: "verges3", label: "verges³" },
  { value: "m3", label: "m³" },
];

export const SIZE_UNITS = ["po", "pi", "mm", "cm", "m"] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];

const TO_INCHES: Record<SizeUnit, number> = { po: 1, pi: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 39.3701 };
export const toInches = (value: number, unit: SizeUnit) => value * TO_INCHES[unit];

export const CONDITION_OPTIONS = [
  { key: "sec", label: "Sec" },
  { key: "mouille", label: "Mouillé" },
  { key: "tres_mouille", label: "Très mouillé" },
  { key: "gele", label: "Gelé" },
  { key: "racines", label: "Avec racines" },
  { key: "organique", label: "Avec matière organique" },
  { key: "propre", label: "Propre — déclaration utilisateur (non vérifiée)" },
  { key: "autre", label: "Autre" },
] as const;

export const ENVIRONMENT_OPTIONS: { value: EnvironmentStatus; label: string }[] = [
  { value: "UNKNOWN", label: "Inconnu" },
  { value: "NOT_CHARACTERIZED", label: "Non caractérisé" },
  { value: "CHARACTERIZED", label: "Caractérisé" },
  { value: "OTHER", label: "Autre" },
];

export const TRUCK_OPTIONS = [
  { code: "10_roues", label: "10 roues" },
  { code: "12_roues", label: "12 roues" },
  { code: "semi_dompeur", label: "Semi-dompeur" },
  { code: "autre", label: "Autre" },
  { code: "inconnu", label: "Inconnu" },
] as const;

export const ACCESS_CONSTRAINTS = [
  "accès étroit", "pente", "fils bas", "branches basses",
  "sol mou / boueux", "recul limité", "autre",
] as const;

export const ACCEPTANCE_SCOPE_OPTIONS: { value: AcceptanceScope; label: string }[] = [
  { value: "explicit", label: "Seulement ce qui est confirmé" },
  { value: "broad", label: "Plusieurs types de matériaux / presque tout sauf exclusions" },
  { value: "unknown", label: "À confirmer" },
];

/** 8. Matériaux à afficher par défaut : jamais les 45 du catalogue. */
export function relevantMaterialKeys(p: QualificationProposal): MaterialKey[] {
  const keys = new Set<MaterialKey>();
  for (const d of p.detected) keys.add(d.materialKey);
  for (const d of p.toConfirm) keys.add(d.materialKey);
  for (const r of p.refusals) if (r.materialKey) keys.add(r.materialKey);
  return Array.from(keys);
}

/** 5. Une dimension inconnue non pertinente pour le chargement n'est pas bloquante. */
export const sizeMattersForLoad = (keys: MaterialKey[]) => keys.some(isSizeRelevant);
