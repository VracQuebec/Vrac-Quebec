// ============================================================
// LOT 13 — CENTRE DE CONTRÔLE INTELLIGENT DES DEMANDES DE REMBLAI
// ------------------------------------------------------------
// Couche PURE, ADDITIVE et EN LECTURE SEULE.
// Réutilise : nlu/chantier, matching/compatibility, matching/pipeline,
// qualification/lot12. N'écrit RIEN, ne confirme RIEN.
//
// Règles absolues reprises du Lot 12 :
//   - ABSENCE ≠ REFUS (matériau non mentionné = INCONNU);
//   - « remblai / remplissage » = USAGE, jamais un matériau;
//   - « je ne sais pas » = INCONNU, mais le reste du texte est analysé;
//   - HAUTE CONFIANCE ≠ CONFIRMÉ (seule une action humaine confirme);
//   - « n'importe quoi » ne contourne jamais un refus, une dimension
//     maximale ou une restriction environnementale.
// ============================================================

import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import { interpretChantier, negationSpans, type ChantierInterpretation } from "@/lib/nlu/chantier";
import {
  evaluateMaterialCompatibility, isSizeRelevant, maxAcceptedInches,
  type AcceptanceStatus, type CapacityKind, type CapacityUnit,
  type CompatibilityEvaluation, type EnvironmentStatus, type FillRequestProfile,
  type LoadComposition,
} from "@/lib/matching/compatibility";
import {
  buildQualificationProposal, type ProposalConfidence, type QualificationProposal,
  type QualificationSource,
} from "@/lib/qualification/lot12";

export const QUALIFICATION_CENTER_VERSION = "qualification-center-v1";

// ---------------- 3. Classification automatique de confiance ----------------

export type ConfidenceLevel = "CONFIRME" | "HAUTE" | "MOYENNE" | "FAIBLE" | "INCONNU";

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  CONFIRME: "Confirmé", HAUTE: "Haute confiance", MOYENNE: "Confiance moyenne",
  FAIBLE: "Faible confiance", INCONNU: "Inconnu",
};

/** Seule une action humaine explicite produit CONFIRME. */
export function confidenceOf(source: QualificationSource, humanConfirmed = false): ConfidenceLevel {
  if (humanConfirmed) return "CONFIRME";
  switch (source) {
    case "human_recent": case "human_historical": case "human_refusal": return "HAUTE";
    case "original_text": return "HAUTE";
    case "structured_historical": case "nlu_high": return "MOYENNE";
    case "nlu_medium": return "FAIBLE";
    default: return "INCONNU";
  }
}

// ---------------- 18/19. Usage et incertitude ne sont pas des matériaux ----------------

const USAGE_PATTERNS = [
  /\bremblai(?:s|er)?\b/, /\bremplissage\b/, /\bremplir\b/, /\bremplir (?:le )?terrain\b/,
  /\bremplir (?:un )?trou\b/, /\bcombler\b/, /\bniveler\b/, /\bnivelage\b/,
];

const UNKNOWN_PATTERNS = [
  /\bje ne sais pas\b/, /\bje sais pas\b/, /\bpas certain\b/, /\bpas sur\b/,
  /\baucune idee\b/, /\bje suis pas certain\b/, /\bsais pas exactement\b/,
];

const norm = (t: string) =>
  (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export const isUsageOnlyTerm = (text: string) => USAGE_PATTERNS.some((r) => r.test(norm(text)));

/** 18. Une expression d'usage (« remplissage ») ne devient jamais un matériau. */
export const isUsageExpression = (expression: string) => {
  const t = norm(expression);
  return t.length > 0 && USAGE_PATTERNS.some((r) => r.test(t));
};

/** Matériaux réellement exploitables : usage et « matériel inconnu » exclus. */
export const usableMaterials = (i: ChantierInterpretation) =>
  i.materials.filter((m) => m.key !== "materiel_inconnu" && !isUsageExpression(m.matchedExpression));
export const hasUnknownCue = (text: string) => UNKNOWN_PATTERNS.some((r) => r.test(norm(text)));

// ---------------- 6. Acceptation large ----------------

const BROAD_PATTERNS = [
  /\bpas mal (?:de )?(?:tout|n importe quoi)\b/,
  /\bpresque n importe quoi\b/,
  /\bn importe quoi\b/,
  /\baccepte de tout\b/,
  /\bprend de tout\b/,
  /\btout (?:est )?accepte\b/,
  /\bplusieurs materiaux? acceptes?\b/,
  /\btout sauf\b/,
];

export function detectBroadAcceptance(text: string): { broad: boolean; expression: string | null } {
  const t = norm(text).replace(/['’]/g, " ");
  for (const re of BROAD_PATTERNS) {
    const m = re.exec(t);
    if (m) return { broad: true, expression: m[0] };
  }
  return { broad: false, expression: null };
}

// ---------------- 7. AcceptanceProfile ----------------

export interface ProfiledMaterial {
  materialKey: MaterialKey;
  label: string;
  status: AcceptanceStatus;
  confidence: ConfidenceLevel;
  source: QualificationSource;
  originalExpression: string;
}

export interface FreshnessInfo {
  state: "CONFIRMEE" | "A_REVALIDER" | "JAMAIS_CONFIRMEE";
  lastConfirmedAt: string | null;
  ageDays: number | null;
}

export interface Contradiction {
  code: "MATERIAL_ACCEPT_AND_REFUSE" | "SIZE_CONFLICT" | "TRUCK_CONFLICT";
  label: string;
  materialKey?: MaterialKey;
}

export interface AcceptanceProfile {
  version: string;
  submissionId: string;
  reference: string | null;
  /** Jamais modifié. */
  originalText: string;
  broadAcceptance: boolean;
  broadExpression: string | null;
  accepted: ProfiledMaterial[];
  refused: ProfiledMaterial[];
  unknown: ProfiledMaterial[];
  conditions: string[];
  granulometry: { label: string; maxInches: number | null }[];
  dimensions: { maxInches: number | null; appliesTo: MaterialKey[] };
  environmental: { status: EnvironmentStatus; declarations: string[]; inferred: false };
  truckConstraints: string[];
  capacity: { kind: CapacityKind; value: number | null; unit: CapacityUnit | null };
  freshness: FreshnessInfo;
  usageOnly: boolean;
  unknownStated: boolean;
  contradictions: Contradiction[];
  /** 2. Qualité globale de la fiche (0-100), sans pénaliser l'inutile. */
  globalScore: number;
  scoreBreakdown: { key: string; applicable: boolean; earned: number; max: number }[];
  summary: string;
  proposal: QualificationProposal;
  interpretation: ChantierInterpretation;
  fillProfile: FillRequestProfile;
  available: boolean;
}

export interface ProfileInput {
  submissionId: string;
  reference?: string | null;
  text: string;
  historicalMaterials?: MaterialKey[];
  trips?: number | null;
  available?: boolean;
  lastConfirmedAt?: string | null;
  now?: Date;
}

function freshnessOf(lastConfirmedAt: string | null | undefined, now: Date): FreshnessInfo {
  if (!lastConfirmedAt) return { state: "JAMAIS_CONFIRMEE", lastConfirmedAt: null, ageDays: null };
  const days = Math.floor((now.getTime() - new Date(lastConfirmedAt).getTime()) / 86_400_000);
  return { state: days > 180 ? "A_REVALIDER" : "CONFIRMEE", lastConfirmedAt, ageDays: days };
}

// ---------------- 11. Contradictions ----------------

export function detectContradictions(
  i: ChantierInterpretation,
  profile: FillRequestProfile,
): Contradiction[] {
  const out: Contradiction[] = [];
  const t = norm(i.originalText);

  // Un matériau à la fois affirmé et nié dans le même texte.
  const nt = i.normalizedText;
  const spans = negationSpans(nt);
  const seen = new Set<MaterialKey>();
  for (const m of i.materials) {
    const refusedRule = profile.materials.some((r) => r.materialKey === m.key && r.status === "REFUSED");
    const expr = norm(m.matchedExpression);
    let positive = false, negative = false;
    if (expr) {
      let idx = nt.indexOf(expr);
      while (idx >= 0) {
        if (spans.some(([s, e]) => idx >= s && idx < e)) negative = true; else positive = true;
        idx = nt.indexOf(expr, idx + expr.length);
      }
    }
    if ((refusedRule || negative) && positive && !seen.has(m.key)) {
      seen.add(m.key);
      out.push({
        code: "MATERIAL_ACCEPT_AND_REFUSE",
        label: `${MATERIAL_LABELS[m.key]} semble à la fois accepté et refusé`,
        materialKey: m.key,
      });
    }
  }

  const limit = maxAcceptedInches(profile);
  const stated = Array.from(t.matchAll(/(\d{1,3})\s*(?:po\b|pouces?)/g)).map((m) => Number(m[1]));
  if (limit != null && stated.some((s) => s > limit)) {
    out.push({ code: "SIZE_CONFLICT", label: `Une dimension supérieure à la limite de ${limit} po est mentionnée` });
  }

  const semiOk = /\bsemi(?:[- ]remorque)?\b/.test(t) && !/\b(?:pas|aucun|sans)\b[^.]{0,20}semi/.test(t);
  const semiNo = /\b(?:aucun acces semi|pas d acces semi|pas de semi|aucun semi|semi impossible)\b/.test(t.replace(/['’]/g, " "));
  if (semiOk && semiNo) out.push({ code: "TRUCK_CONFLICT", label: "Semi à la fois accepté et impossible" });

  return out;
}

// ---------------- 8. Résumé en français simple ----------------

export function buildSummary(p: Omit<AcceptanceProfile, "summary">): string {
  const parts: string[] = [];
  if (p.accepted.length) {
    parts.push(`Cette demande semble accepter principalement ${p.accepted.map((m) => m.label.toLowerCase()).join(", ")}.`);
  } else if (p.broadAcceptance) {
    parts.push("Le texte évoque une acceptation large, sans matériau nommé précisément.");
  } else if (p.usageOnly) {
    parts.push("Le texte décrit un besoin de remplissage, sans matériau identifié.");
  } else {
    parts.push("Aucun matériau n'est identifiable avec fiabilité dans le texte.");
  }
  if (p.refused.length) {
    parts.push(`Le texte indique explicitement qu'aucun ${p.refused.map((m) => m.label.toLowerCase()).join(", ")} n'est souhaité.`);
  }
  if (p.dimensions.maxInches != null) parts.push(`Une dimension maximale de ${p.dimensions.maxInches} po est mentionnée.`);
  if (p.unknown.length) {
    parts.push(`Aucune information fiable n'indique si ${p.unknown.map((m) => m.label.toLowerCase()).join(", ")} est accepté.`);
  }
  if (p.contradictions.length) parts.push("Le texte contient une contradiction : une validation humaine est requise.");
  parts.push(
    p.freshness.state === "JAMAIS_CONFIRMEE"
      ? "La demande n'a jamais été reconfirmée."
      : p.freshness.state === "A_REVALIDER"
        ? "La dernière confirmation est ancienne : à revalider."
        : "La demande a été confirmée récemment.",
  );
  return parts.join("\n\n");
}

// ---------------- 2. Score global (aucune pénalité pour l'inutile) ----------------

function computeGlobalScore(p: Omit<AcceptanceProfile, "globalScore" | "scoreBreakdown" | "summary">) {
  const sizeRelevant = p.accepted.some((m) => isSizeRelevant(m.materialKey));
  const rows: { key: string; applicable: boolean; earned: number; max: number }[] = [
    { key: "materiaux", applicable: true, earned: p.accepted.length ? (p.accepted.length >= 2 ? 45 : 35) : p.broadAcceptance ? 20 : 0, max: 45 },
    { key: "clarte_refus", applicable: true, earned: p.refused.length || p.accepted.length ? 10 : 0, max: 10 },
    { key: "calibre", applicable: sizeRelevant, earned: p.dimensions.maxInches != null || p.granulometry.length ? 10 : 0, max: 10 },
    { key: "capacite", applicable: true, earned: p.capacity.kind === "known" ? 10 : p.capacity.kind === "approximate" ? 6 : 0, max: 10 },
    { key: "camion", applicable: p.truckConstraints.length > 0 || false, earned: p.truckConstraints.length ? 5 : 0, max: 5 },
    { key: "fraicheur", applicable: true, earned: p.freshness.state === "CONFIRMEE" ? 15 : p.freshness.state === "A_REVALIDER" ? 7 : 0, max: 15 },
    { key: "coherence", applicable: true, earned: p.contradictions.length ? 0 : 10, max: 10 },
  ];
  const applicable = rows.filter((r) => r.applicable);
  const maxTotal = applicable.reduce((s, r) => s + r.max, 0) || 1;
  const earned = applicable.reduce((s, r) => s + r.earned, 0);
  return { score: Math.round((earned / maxTotal) * 100), rows };
}

export function buildAcceptanceProfile(input: ProfileInput): AcceptanceProfile {
  const now = input.now ?? new Date();
  const text = input.text || "";
  const proposal = buildQualificationProposal({
    submissionId: input.submissionId,
    text,
    historicalMaterials: input.historicalMaterials,
    trips: input.trips ?? null,
  });
  const i = proposal.interpretation;
  const fillProfile = proposal.profile;
  const broad = detectBroadAcceptance(text);

  const toProfiled = (
    key: MaterialKey, status: AcceptanceStatus, source: QualificationSource,
    conf: ProposalConfidence | ConfidenceLevel, expr: string,
  ): ProfiledMaterial => ({
    materialKey: key,
    label: MATERIAL_LABELS[key],
    status,
    confidence: typeof conf === "string" && ["CONFIRME", "HAUTE", "MOYENNE", "FAIBLE", "INCONNU"].includes(conf)
      ? (conf as ConfidenceLevel)
      : confidenceOf(source),
    source,
    originalExpression: expr,
  });

  const accepted: ProfiledMaterial[] = [];
  const refused: ProfiledMaterial[] = [];
  const unknown: ProfiledMaterial[] = [];

  for (const d of proposal.detected) {
    const item = toProfiled(d.materialKey, d.status, d.source, d.confidence, d.originalExpression);
    if (d.status === "REFUSED") refused.push(item);
    else if (d.status === "ACCEPTED") accepted.push(item);
    else unknown.push(item);
  }
  for (const d of proposal.toConfirm) {
    unknown.push(toProfiled(d.materialKey, "UNKNOWN", d.source, d.confidence, d.originalExpression));
  }

  const maxInches = maxAcceptedInches(fillProfile);
  const contradictions = detectContradictions(i, fillProfile);

  const base = {
    version: QUALIFICATION_CENTER_VERSION,
    submissionId: input.submissionId,
    reference: input.reference ?? null,
    originalText: text,
    broadAcceptance: broad.broad || i.acceptsAlmostEverything,
    broadExpression: broad.expression,
    accepted, refused, unknown,
    conditions: i.conditions.map((c) => c.label),
    granulometry: i.granulometries.map((g) => ({ label: g.label, maxInches: g.maxInches })),
    dimensions: { maxInches, appliesTo: accepted.filter((m) => isSizeRelevant(m.materialKey)).map((m) => m.materialKey) },
    // 19/8 — aucune déduction environnementale.
    environmental: { status: "UNKNOWN" as EnvironmentStatus, declarations: i.conditions.map((c) => c.label), inferred: false as const },
    truckConstraints: i.truck.code ? [i.truck.label ?? i.truck.code] : [],
    capacity: proposal.capacity,
    freshness: freshnessOf(input.lastConfirmedAt, now),
    usageOnly: accepted.length === 0 && isUsageOnlyTerm(text),
    unknownStated: hasUnknownCue(text),
    contradictions,
    proposal,
    interpretation: i,
    fillProfile,
    available: input.available ?? true,
  };

  const { score, rows } = computeGlobalScore(base);
  const withScore = { ...base, globalScore: score, scoreBreakdown: rows };
  return { ...withScore, summary: buildSummary(withScore) };
}

// ---------------- 2b. Qualité POUR CE MATCH ----------------

export interface MatchQuality { score: number; missing: string[]; evaluation: CompatibilityEvaluation }

/** Ne juge que les informations nécessaires à CE chargement précis. */
export function matchQuality(profile: AcceptanceProfile, load: LoadComposition): MatchQuality {
  const evaluation = evaluateMaterialCompatibility(load, profile.fillProfile);
  const missing: string[] = [];
  const keys = load.materials.map((m) => m.materialKey);
  const total = keys.length || 1;
  let known = 0;
  for (const k of keys) {
    if (evaluation.acceptedMaterials.includes(k)) known += 1;
    else if (evaluation.refusedMaterials.includes(k)) known += 1;
    else missing.push(`acceptation de ${MATERIAL_LABELS[k]} inconnue`);
  }
  let score = Math.round((known / total) * 80);
  const needSize = keys.some(isSizeRelevant);
  if (needSize) {
    if (profile.dimensions.maxInches != null || load.materials.every((m) => m.maxInches != null)) score += 20;
    else missing.push("calibre maximal inconnu");
  } else score += 20;
  if (evaluation.result === "INCOMPATIBLE") score = 0;
  return { score: Math.max(0, Math.min(100, score)), missing, evaluation };
}

// ---------------- 1. Compteurs du centre ----------------

export interface CenterCounters {
  active: number;
  sufficient: number;
  toConfirm: number;
  missingInfo: number;
  toRevalidate: number;
  noMaterial: number;
  withRestrictions: number;
  highMatchPotential: number;
  contradictions: number;
}

export function computeCounters(profiles: AcceptanceProfile[], potential: Map<string, number> = new Map()): CenterCounters {
  const c: CenterCounters = {
    active: 0, sufficient: 0, toConfirm: 0, missingInfo: 0, toRevalidate: 0,
    noMaterial: 0, withRestrictions: 0, highMatchPotential: 0, contradictions: 0,
  };
  for (const p of profiles) {
    if (p.available) c.active += 1;
    if (p.accepted.length > 0 && p.contradictions.length === 0 && p.globalScore >= 60) c.sufficient += 1;
    if (p.unknown.length > 0 || p.contradictions.length > 0) c.toConfirm += 1;
    if (p.capacity.kind === "unknown" || p.accepted.length === 0) c.missingInfo += 1;
    if (p.freshness.state !== "CONFIRMEE") c.toRevalidate += 1;
    if (p.accepted.length === 0 && !p.broadAcceptance) c.noMaterial += 1;
    if (p.refused.length > 0 || p.dimensions.maxInches != null) c.withRestrictions += 1;
    if ((potential.get(p.submissionId) ?? 0) >= 5) c.highMatchPotential += 1;
    if (p.contradictions.length) c.contradictions += 1;
  }
  return c;
}

// ---------------- 13. Priorité dynamique ----------------

export type PriorityLevel = "P1" | "P2" | "P3" | "P4";

export interface PriorityResult { level: PriorityLevel; score: number; reasons: string[] }

export function computePriority(
  p: AcceptanceProfile,
  ctx: { potentialMatches?: number; hasLocation?: boolean; recentActivity?: boolean } = {},
): PriorityResult {
  const reasons: string[] = [];
  let s = 0;
  if (p.available) { s += 20; reasons.push("demande active"); }
  const pm = ctx.potentialMatches ?? 0;
  if (pm > 0) { s += Math.min(30, pm * 3); reasons.push(`${pm} correspondance(s) potentielle(s)`); }
  if (p.contradictions.length) { s += 25; reasons.push("contradiction à trancher"); }
  if (p.unknown.length) { s += Math.min(15, p.unknown.length * 5); reasons.push(`${p.unknown.length} information(s) inconnue(s)`); }
  if (p.freshness.state !== "CONFIRMEE") { s += 10; reasons.push("à revalider"); }
  if (p.capacity.kind === "known" || p.capacity.kind === "approximate") { s += 5; reasons.push("capacité renseignée"); }
  if (ctx.hasLocation) { s += 5; reasons.push("emplacement connu"); }
  if (ctx.recentActivity) { s += 5; reasons.push("activité récente"); }
  const level: PriorityLevel = s >= 70 ? "P1" : s >= 50 ? "P2" : s >= 30 ? "P3" : "P4";
  return { level, score: s, reasons };
}

// ---------------- 10. Confirmation en masse (SIMULATION, jamais activée) ----------------

export interface BulkEligibility { eligible: boolean; blockers: string[] }

export function bulkConfirmEligibility(p: AcceptanceProfile): BulkEligibility {
  const blockers: string[] = [];
  if (p.contradictions.length) blockers.push("contradiction détectée");
  if (!p.accepted.length) blockers.push("aucun matériau identifié");
  if (p.accepted.some((m) => m.confidence !== "HAUTE" && m.confidence !== "CONFIRME")) blockers.push("confiance insuffisante");
  if (p.proposal.ambiguityReasons.length) blockers.push("ambiguïté critique");
  if (!p.originalText.trim()) blockers.push("texte source absent");
  if (p.environmental.status !== "UNKNOWN") blockers.push("déduction environnementale interdite");
  return { eligible: blockers.length === 0, blockers };
}

/** Simulation seulement : aucune écriture n'est effectuée. */
export type QuickAction = "CONFIRMER" | "CORRIGER" | "PLUS_TARD" | "IMPOSSIBLE";

export interface SimulatedAction {
  submissionId: string;
  action: QuickAction;
  wouldWrite: false;
  description: string;
}

export function simulateQuickAction(p: AcceptanceProfile, action: QuickAction): SimulatedAction {
  const description =
    action === "CONFIRMER" ? `Confirmerait ${p.accepted.length} matériau(x) et ${p.refused.length} refus.`
      : action === "CORRIGER" ? "Ouvrirait la correction manuelle (aucune écriture en Lot 13)."
        : action === "PLUS_TARD" ? "Replacerait la demande en fin de file."
          : "Marquerait la demande comme impossible à déterminer sans contact humain.";
  return { submissionId: p.submissionId, action, wouldWrite: false, description };
}

// ---------------- 14. Mode « 30 secondes » ----------------

export interface ThirtySecondCard {
  submissionId: string;
  reference: string | null;
  available: boolean;
  freshness: FreshnessInfo["state"];
  lines: { symbol: "✓" | "?" | "✕"; label: string }[];
  sizeLimit: string;
  capacity: string;
  actions: QuickAction[];
  simulationOnly: true;
}

export function thirtySecondCard(p: AcceptanceProfile): ThirtySecondCard {
  return {
    submissionId: p.submissionId,
    reference: p.reference,
    available: p.available,
    freshness: p.freshness.state,
    lines: [
      ...p.accepted.map((m) => ({ symbol: "✓" as const, label: m.label })),
      ...p.unknown.map((m) => ({ symbol: "?" as const, label: m.label })),
      ...p.refused.map((m) => ({ symbol: "✕" as const, label: m.label })),
    ],
    sizeLimit: p.dimensions.maxInches != null ? `max ${p.dimensions.maxInches} po` : "non précisée",
    capacity: p.capacity.value != null ? `${p.capacity.value} ${p.capacity.unit ?? ""}`.trim() : "inconnue",
    actions: ["CONFIRMER", "CORRIGER", "PLUS_TARD", "IMPOSSIBLE"],
    simulationOnly: true,
  };
}

export function thirtySecondQueue(profiles: AcceptanceProfile[], potential: Map<string, number> = new Map()): AcceptanceProfile[] {
  return [...profiles].sort((a, b) => {
    const pa = computePriority(a, { potentialMatches: potential.get(a.submissionId) ?? 0 }).score;
    const pb = computePriority(b, { potentialMatches: potential.get(b.submissionId) ?? 0 }).score;
    return pb - pa || a.submissionId.localeCompare(b.submissionId);
  });
}

// ---------------- 15. Recherche intelligente ----------------

const SEARCH_ALIASES: { re: RegExp; keys: MaterialKey[] }[] = [
  { re: /glaise|argile|glaize/, keys: ["argile"] },
  { re: /beton|ciment/, keys: ["beton"] },
  { re: /asphalte|pavage|planage/, keys: ["asphalte"] },
  { re: /roche|roc|caillou|pierre|gravier/, keys: ["roche", "pierre"] },
  { re: /terre|topsoil|top soil/, keys: ["terre"] },
  { re: /sable/, keys: ["sable"] },
];

export function searchProfiles(profiles: AcceptanceProfile[], query: string): AcceptanceProfile[] {
  const q = norm(query).replace(/['’]/g, " ");
  if (!q) return profiles;

  const negative = /\b(pas de|sans|aucun|refuse|refus)\b/.test(q);
  const aliasKeys = SEARCH_ALIASES.filter((a) => a.re.test(q)).flatMap((a) => a.keys);
  const inchMatch = /(\d{1,3})\s*(?:po|pouces?)/.exec(q);
  const wantsSemi = /\bsemi\b/.test(q);
  const wantsUnknownCapacity = /capacite inconnue/.test(q);
  const wantsNeverConfirmed = /jamais confirmee?/.test(q);
  const wantsNoMaterial = /sans materiau/.test(q);
  const wantsHighPotential = /fort potentiel/.test(q);

  return profiles.filter((p) => {
    if (aliasKeys.length) {
      const pool = negative ? p.refused : [...p.accepted, ...p.unknown];
      if (!pool.some((m) => aliasKeys.includes(m.materialKey))) return false;
    }
    if (inchMatch && p.dimensions.maxInches !== Number(inchMatch[1])) return false;
    if (wantsSemi && !p.truckConstraints.some((t) => norm(t).includes("semi")) && !norm(p.originalText).includes("semi")) return false;
    if (wantsUnknownCapacity && p.capacity.kind !== "unknown") return false;
    if (wantsNeverConfirmed && p.freshness.state !== "JAMAIS_CONFIRMEE") return false;
    if (wantsNoMaterial && p.accepted.length > 0) return false;
    if (wantsHighPotential && p.globalScore < 70) return false;
    if (!aliasKeys.length && !inchMatch && !wantsSemi && !wantsUnknownCapacity &&
        !wantsNeverConfirmed && !wantsNoMaterial && !wantsHighPotential) {
      return norm(p.originalText).includes(q) || norm(p.reference ?? "").includes(q);
    }
    return true;
  });
}

// ---------------- 16. Filtres ----------------

export interface CenterFilters {
  qualificationStatus?: "suffisante" | "a_confirmer" | "sans_materiau";
  freshness?: FreshnessInfo["state"];
  available?: boolean;
  material?: MaterialKey;
  refusedMaterial?: MaterialKey;
  hasRestriction?: boolean;
  hasGranulometry?: boolean;
  truckKnown?: boolean;
  capacityKnown?: boolean;
  environment?: EnvironmentStatus;
  confidence?: ConfidenceLevel;
  priority?: PriorityLevel;
  minPotentialMatches?: number;
}

export function applyFilters(
  profiles: AcceptanceProfile[],
  f: CenterFilters,
  potential: Map<string, number> = new Map(),
): AcceptanceProfile[] {
  return profiles.filter((p) => {
    const pm = potential.get(p.submissionId) ?? 0;
    if (f.qualificationStatus === "suffisante" && !(p.accepted.length && p.globalScore >= 60 && !p.contradictions.length)) return false;
    if (f.qualificationStatus === "a_confirmer" && !(p.unknown.length || p.contradictions.length)) return false;
    if (f.qualificationStatus === "sans_materiau" && p.accepted.length > 0) return false;
    if (f.freshness && p.freshness.state !== f.freshness) return false;
    if (f.available != null && p.available !== f.available) return false;
    if (f.material && !p.accepted.some((m) => m.materialKey === f.material)) return false;
    if (f.refusedMaterial && !p.refused.some((m) => m.materialKey === f.refusedMaterial)) return false;
    if (f.hasRestriction != null && (p.refused.length > 0 || p.dimensions.maxInches != null) !== f.hasRestriction) return false;
    if (f.hasGranulometry != null && (p.granulometry.length > 0) !== f.hasGranulometry) return false;
    if (f.truckKnown != null && (p.truckConstraints.length > 0) !== f.truckKnown) return false;
    if (f.capacityKnown != null && (p.capacity.kind !== "unknown") !== f.capacityKnown) return false;
    if (f.environment && p.environmental.status !== f.environment) return false;
    if (f.confidence && ![...p.accepted, ...p.refused, ...p.unknown].some((m) => m.confidence === f.confidence)) return false;
    if (f.priority && computePriority(p, { potentialMatches: pm }).level !== f.priority) return false;
    if (f.minPotentialMatches != null && pm < f.minPotentialMatches) return false;
    return true;
  });
}

// ---------------- 17. Classement des demandes sans relation ----------------

export type NoRelationClass = "A" | "B" | "C" | "D" | "E";

export const NO_RELATION_LABELS: Record<NoRelationClass, string> = {
  A: "Matériau identifiable avec haute confiance",
  B: "Matériau probablement identifiable",
  C: "Usage seulement (remplissage)",
  D: "Incertitude déclarée (« je ne sais pas »)",
  E: "Information insuffisante",
};

export function classifyNoRelation(text: string): NoRelationClass {
  const t = (text || "").trim();
  if (!t) return "E";
  const i = interpretChantier(t, { direction: "RECEPTION" });
  const mats = i.materials.filter((m) => m.key !== "materiel_inconnu");
  if (mats.length) {
    const best = Math.max(...mats.map((m) => m.confidence));
    if (best >= 0.9 && !hasUnknownCue(t)) return "A";
    return "B";
  }
  if (hasUnknownCue(t)) return "D";
  if (isUsageOnlyTerm(t)) return "C";
  return "E";
}

export function classifyNoRelationBatch(rows: { id: string; text: string }[]) {
  const counts: Record<NoRelationClass, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const items = rows.map((r) => {
    const cls = classifyNoRelation(r.text);
    counts[cls] += 1;
    return { id: r.id, cls, text: r.text };
  });
  return { counts, items };
}

// ---------------- 20. File des termes non reconnus ----------------

export interface UnknownTerm {
  term: string;
  frequency: number;
  submissionIds: string[];
  contexts: string[];
  proposedClassification: "MATERIAU_POSSIBLE" | "CONDITION_POSSIBLE" | "USAGE" | "INCONNU";
  potentialImpact: number;
}

export function buildUnknownTermsQueue(
  profiles: AcceptanceProfile[],
  limit = 50,
): UnknownTerm[] {
  const map = new Map<string, { ids: Set<string>; contexts: string[] }>();
  for (const p of profiles) {
    for (const seg of p.interpretation.unrecognizedSegments) {
      const term = norm(seg);
      if (term.length < 3 || /^\d+$/.test(term)) continue;
      const cur = map.get(term) ?? { ids: new Set<string>(), contexts: [] };
      cur.ids.add(p.submissionId);
      if (cur.contexts.length < 3) cur.contexts.push(p.originalText.slice(0, 120));
      map.set(term, cur);
    }
  }
  return Array.from(map.entries())
    .map(([term, v]) => ({
      term,
      frequency: v.ids.size,
      submissionIds: Array.from(v.ids).slice(0, 20),
      contexts: v.contexts,
      proposedClassification: isUsageOnlyTerm(term)
        ? ("USAGE" as const)
        : /sec|mouille|gele|propre|humide/.test(term)
          ? ("CONDITION_POSSIBLE" as const)
          : /terre|sable|pierre|roche|beton|asphalte|gravier|remblai/.test(term)
            ? ("MATERIAU_POSSIBLE" as const)
            : ("INCONNU" as const),
      potentialImpact: v.ids.size,
    }))
    .sort((a, b) => b.frequency - a.frequency || a.term.localeCompare(b.term))
    .slice(0, limit);
}

// ---------------- 21/22. Statistiques et matrice matériaux ----------------

export interface CorpusStats {
  total: number;
  atLeastOne: number; twoPlus: number; threePlus: number;
  explicitRefusal: number; restriction: number; granulometry: number; dimension: number;
  condition: number; capacity: number; truck: number; environment: number;
  broadAcceptance: number; contradiction: number; noUsableInfo: number;
}

export function corpusStats(profiles: AcceptanceProfile[]): CorpusStats {
  const s: CorpusStats = {
    total: profiles.length, atLeastOne: 0, twoPlus: 0, threePlus: 0, explicitRefusal: 0,
    restriction: 0, granulometry: 0, dimension: 0, condition: 0, capacity: 0, truck: 0,
    environment: 0, broadAcceptance: 0, contradiction: 0, noUsableInfo: 0,
  };
  for (const p of profiles) {
    const n = p.accepted.length;
    if (n >= 1) s.atLeastOne += 1;
    if (n >= 2) s.twoPlus += 1;
    if (n >= 3) s.threePlus += 1;
    if (p.refused.length) s.explicitRefusal += 1;
    if (p.refused.length || p.dimensions.maxInches != null) s.restriction += 1;
    if (p.granulometry.length) s.granulometry += 1;
    if (p.dimensions.maxInches != null) s.dimension += 1;
    if (p.conditions.length) s.condition += 1;
    if (p.capacity.kind !== "unknown") s.capacity += 1;
    if (p.truckConstraints.length) s.truck += 1;
    if (p.environmental.status !== "UNKNOWN") s.environment += 1;
    if (p.broadAcceptance) s.broadAcceptance += 1;
    if (p.contradictions.length) s.contradiction += 1;
    if (!n && !p.refused.length && !p.granulometry.length && !p.broadAcceptance) s.noUsableInfo += 1;
  }
  return s;
}

export interface MatrixRow { materialKey: MaterialKey; label: string; accepted: number; refused: number; unknown: number; requests: number }

export function materialMatrix(profiles: AcceptanceProfile[], keys?: MaterialKey[]): MatrixRow[] {
  const pool = keys ?? (["terre", "sable", "pierre", "roche", "argile", "beton", "asphalte", "organique"] as MaterialKey[]);
  return pool.map((k) => {
    let a = 0, r = 0, u = 0;
    for (const p of profiles) {
      if (p.accepted.some((m) => m.materialKey === k)) a += 1;
      else if (p.refused.some((m) => m.materialKey === k)) r += 1;
      else u += 1;
    }
    return { materialKey: k, label: MATERIAL_LABELS[k], accepted: a, refused: r, unknown: u, requests: profiles.length };
  });
}

// ---------------- 12/23. Impact et potentiel du réseau ----------------

export interface NetworkPotential {
  certain: number; potential: number; blockedByUncertainty: number; incompatible: number;
}

export function networkPotential(
  profiles: AcceptanceProfile[],
  loads: LoadComposition[],
): NetworkPotential {
  const out: NetworkPotential = { certain: 0, potential: 0, blockedByUncertainty: 0, incompatible: 0 };
  for (const p of profiles) {
    for (const l of loads) {
      const ev = evaluateMaterialCompatibility(l, p.fillProfile);
      if (ev.result === "COMPATIBLE") { out.certain += 1; out.potential += 1; }
      else if (ev.result === "NEEDS_REVIEW") { out.blockedByUncertainty += 1; out.potential += 1; }
      else out.incompatible += 1;
    }
  }
  return out;
}

export interface ImpactItem {
  submissionId: string;
  reference: string | null;
  materialKey: MaterialKey;
  label: string;
  matchesIfAccepted: number;
  matchesIfRefused: number;
  impact: number;
  level: "ÉLEVÉ" | "MOYEN" | "FAIBLE";
  sentence: string;
}

/** Impact réel mesuré sur les chargements fournis : jamais une estimation inventée. */
export function impactRanking(
  profiles: AcceptanceProfile[],
  loads: LoadComposition[],
  limit = 20,
): ImpactItem[] {
  const items: ImpactItem[] = [];
  for (const p of profiles) {
    for (const u of p.unknown) {
      const concerned = loads.filter((l) => l.materials.some((m) => m.materialKey === u.materialKey));
      const gain = concerned.length;
      if (!gain) continue;
      items.push({
        submissionId: p.submissionId,
        reference: p.reference,
        materialKey: u.materialKey,
        label: u.label,
        matchesIfAccepted: gain,
        matchesIfRefused: 0,
        impact: gain,
        level: gain >= 20 ? "ÉLEVÉ" : gain >= 5 ? "MOYEN" : "FAIBLE",
        sentence: `${u.label} : si accepté, +${gain} correspondance(s); si refusé, ${gain} éliminée(s).`,
      });
    }
  }
  return items.sort((a, b) => b.impact - a.impact || a.submissionId.localeCompare(b.submissionId)).slice(0, limit);
}
