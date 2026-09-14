// ============================================================
// LOT 15 — ENRICHISSEMENT PROGRESSIF DES DEMANDES DE REMBLAI
//          + MATCHING EXPLICABLE (INTERNE, LECTURE CALCULÉE)
// ------------------------------------------------------------
// Fonctions PURES. Aucun accès réseau, aucune écriture, aucune
// modification de données historiques, aucun matching public.
//
// Règle fondamentale (5 états, jamais confondus) :
//   ACCEPTE_CONFIRME · COMPATIBLE_PROBABLE · A_CONFIRMER
//   REFUSE_CONFIRME  · INCONNU
//   INCONNU ≠ REFUSÉ · absence de refus ≠ acceptation confirmée.
// Une compatibilité PROBABLE sert uniquement à prioriser en interne.
// ============================================================

import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import { interpretChantier, type ChantierInterpretation } from "@/lib/nlu/chantier";
import {
  isSizeRelevant,
  type CapacityUnit,
  type EnvironmentStatus,
  type LoadComposition,
} from "@/lib/matching/compatibility";
import type { AcceptanceProfile } from "@/lib/qualification/lot13";
import type { QualifiedProfile, ValueOrigin } from "@/lib/qualification/lot14";
import { buildQualifiedProfile } from "@/lib/qualification/lot14";

export const ENRICHMENT_VERSION = "enrichment-v1";

// ---------------- 1. Profil d'acceptation complet ----------------

export type MaterialStance =
  | "ACCEPTE_CONFIRME" | "COMPATIBLE_PROBABLE" | "A_CONFIRMER" | "REFUSE_CONFIRME" | "INCONNU";

export const STANCE_LABELS: Record<MaterialStance, string> = {
  ACCEPTE_CONFIRME: "Accepté confirmé",
  COMPATIBLE_PROBABLE: "Compatible probable",
  A_CONFIRMER: "À confirmer",
  REFUSE_CONFIRME: "Refusé confirmé",
  INCONNU: "Inconnu",
};

export interface EnrichedMaterial {
  materialKey: MaterialKey;
  label: string;
  stance: MaterialStance;
  origin: ValueOrigin;
  humanConfirmed: boolean;
  confidence: QualifiedProfile["materials"][number]["confidence"];
  maxInches: number | null;
}

export interface EnrichedProfile {
  version: string;
  submissionId: string;
  /** Texte original strictement inchangé. */
  originalText: string;
  acceptanceMode: "broad" | "explicit" | "unknown";
  materials: EnrichedMaterial[];
  /** Refus explicites : prioritaires même sur une acceptation large. */
  exclusions: MaterialKey[];
  granulometry: {
    accepted: { label: string; maxInches: number | null }[];
    maxInches: number | null;
    minInches: number | null;
    confirmed: boolean;
  };
  /** Les mélanges sont-ils permis ? null = jamais documenté. */
  mixturesAllowed: boolean | null;
  contaminants: string[];
  conditions: string[];
  environment: { status: EnvironmentStatus; declarations: string[]; humanConfirmed: boolean };
  trucks: { codes: string[]; humanConfirmed: boolean };
  accessConstraints: string[];
  capacity: { total: number | null; remaining: number | null; unit: CapacityUnit | null; known: boolean };
  availability: { available: boolean; freshness: AcceptanceProfile["freshness"] };
  /** Provenance et confiance, information par information. */
  provenance: { field: string; origin: ValueOrigin; humanConfirmed: boolean }[];
}

const stanceOf = (m: QualifiedProfile["materials"][number]): MaterialStance => {
  if (m.status === "UNKNOWN") return "INCONNU";
  if (m.humanConfirmed) return m.status === "ACCEPTED" ? "ACCEPTE_CONFIRME" : "REFUSE_CONFIRME";
  if (m.status === "REFUSED") return m.origin === "explicit_text" ? "REFUSE_CONFIRME" : "A_CONFIRMER";
  // Accepté sans confirmation humaine : probable, jamais confirmé.
  if (m.origin === "explicit_text" || m.origin === "historical" || m.origin === "nlu_high") {
    return "COMPATIBLE_PROBABLE";
  }
  return "A_CONFIRMER";
};

/** Profil enrichi calculé (lecture seule) : historique + NLU + décisions humaines. */
export function buildEnrichedProfile(
  profile: AcceptanceProfile,
  qualified?: QualifiedProfile,
): EnrichedProfile {
  const q = qualified ?? buildQualifiedProfile(profile, []);
  const granulometry = profile.granulometry.map((g) => ({ label: g.label, maxInches: g.maxInches }));
  const maxes = [
    profile.dimensions.maxInches,
    ...q.materials.map((m) => m.maxInches),
    ...granulometry.map((g) => g.maxInches),
  ].filter((n): n is number => typeof n === "number");
  const mins = profile.interpretation.granulometries
    .map((g) => g.minInches)
    .filter((n): n is number => typeof n === "number");

  const contaminants = profile.interpretation.restrictions
    .filter((r) => r.kind === "ENVIRONNEMENT" || (r.kind === "MATERIAU" && !r.ambiguous))
    .map((r) => r.label);

  const materials: EnrichedMaterial[] = q.materials.map((m) => ({
    materialKey: m.materialKey,
    label: m.label,
    stance: stanceOf(m),
    origin: m.origin,
    humanConfirmed: m.humanConfirmed,
    confidence: m.confidence,
    maxInches: m.maxInches,
  }));

  const provenance: { field: string; origin: ValueOrigin; humanConfirmed: boolean }[] = [
    ...materials.map((m) => ({ field: `matériau: ${m.label}`, origin: m.origin, humanConfirmed: m.humanConfirmed })),
    { field: "environnement", origin: q.environment.humanConfirmed ? "human_recent" : "unknown", humanConfirmed: q.environment.humanConfirmed },
    { field: "camions", origin: q.trucks.humanConfirmed ? "human_recent" : q.trucks.codes.length ? "explicit_text" : "unknown", humanConfirmed: q.trucks.humanConfirmed },
    { field: "capacité", origin: q.capacity.humanConfirmed ? "human_recent" : q.capacity.total != null ? "explicit_text" : "unknown", humanConfirmed: q.capacity.humanConfirmed },
  ];

  return {
    version: ENRICHMENT_VERSION,
    submissionId: q.submissionId,
    originalText: q.originalText,
    acceptanceMode: q.acceptanceMode,
    materials,
    exclusions: q.exclusions,
    granulometry: {
      accepted: granulometry,
      maxInches: maxes.length ? Math.min(...maxes) : null,
      minInches: mins.length ? Math.min(...mins) : null,
      confirmed: q.materials.some((m) => m.humanConfirmed && m.maxInches != null) || profile.dimensions.maxInches != null,
    },
    mixturesAllowed: q.acceptanceMode === "broad" ? true : materials.filter((m) => m.stance !== "REFUSE_CONFIRME" && m.stance !== "INCONNU").length > 1 ? true : null,
    contaminants,
    conditions: q.conditions.map((c) => c.label),
    environment: { status: q.environment.status, declarations: q.environment.declarations, humanConfirmed: q.environment.humanConfirmed },
    trucks: { codes: q.trucks.codes, humanConfirmed: q.trucks.humanConfirmed },
    accessConstraints: q.accessConstraints.labels,
    capacity: {
      total: q.capacity.total,
      remaining: q.capacity.remaining,
      unit: q.capacity.unit,
      known: q.capacity.total != null || q.capacity.remaining != null,
    },
    availability: { available: q.available, freshness: q.freshness },
    provenance,
  };
}

/** État d'un matériau donné pour cette demande — jamais optimiste. */
export function stanceForMaterial(profile: EnrichedProfile, key: MaterialKey): MaterialStance {
  if (profile.exclusions.includes(key)) return "REFUSE_CONFIRME";
  const found = profile.materials.find((m) => m.materialKey === key);
  if (found) return found.stance;
  // Acceptation large NON confirmée : au mieux « probable », jamais confirmée.
  if (profile.acceptanceMode === "broad") return "COMPATIBLE_PROBABLE";
  return "INCONNU";
}

// ---------------- 2. Raisonnement par composants ----------------

/** Décompose un texte de chargement en composants (principal / secondaire / trace). */
export function decomposeLoad(text: string, id = "load"): LoadComposition {
  const i: ChantierInterpretation = interpretChantier(text, { direction: "EVACUATION" });
  return {
    id,
    materials: i.materials.map((m) => ({
      materialKey: m.key,
      label: m.label ?? MATERIAL_LABELS[m.key],
      role: m.role,
      // Aucun pourcentage inventé : uniquement celui exprimé par le client.
      sharePct: m.sharePct,
      maxInches: i.granulometries.find((g) => g.maxInches != null)?.maxInches ?? null,
    })),
    conditions: i.conditions.map((c) => c.label),
    originalText: text,
  };
}

// ---------------- 4. Granulométrie ----------------

export type SizeVerdict = "OK" | "TROP_GROS" | "INCONNU" | "NON_APPLICABLE";

export function evaluateComponentSize(
  profile: EnrichedProfile, key: MaterialKey, maxInches: number | null,
): SizeVerdict {
  if (!isSizeRelevant(key)) return "NON_APPLICABLE";
  const limit = profile.granulometry.maxInches;
  if (limit == null) return "INCONNU";
  if (maxInches == null) return "INCONNU";
  return maxInches <= limit ? "OK" : "TROP_GROS";
}

// ---------------- 3. Tolérance aux mélanges ----------------

export type MixtureKind =
  | "MATERIAU_PUR" | "MELANGE_ACCEPTABLE" | "MELANGE_A_CONFIRMER" | "MELANGE_INCOMPATIBLE";

export interface ComponentVerdict {
  materialKey: MaterialKey;
  label: string;
  role: LoadComposition["materials"][number]["role"];
  sharePct: number | null;
  stance: MaterialStance;
  size: SizeVerdict;
  explanation: string;
}

export interface MixtureEvaluation {
  version: string;
  kind: MixtureKind;
  components: ComponentVerdict[];
  blockers: string[];
  toConfirm: string[];
  /** Vrai si la conclusion repose sur du « probable » et non du confirmé. */
  reliesOnProbable: boolean;
}

export function evaluateMixture(load: LoadComposition, profile: EnrichedProfile): MixtureEvaluation {
  const components: ComponentVerdict[] = load.materials.map((c) => {
    const stance = stanceForMaterial(profile, c.materialKey);
    const size = evaluateComponentSize(profile, c.materialKey, c.maxInches);
    const explanation =
      stance === "REFUSE_CONFIRME" ? `${c.label} : refus confirmé par la demande`
      : size === "TROP_GROS" ? `${c.label} : dépasse la grosseur maximale confirmée`
      : stance === "ACCEPTE_CONFIRME" ? `${c.label} : accepté confirmé`
      : stance === "COMPATIBLE_PROBABLE" ? `${c.label} : compatible probable, non confirmé`
      : stance === "A_CONFIRMER" ? `${c.label} : à confirmer`
      : `${c.label} : jamais documenté (inconnu, pas un refus)`;
    return { materialKey: c.materialKey, label: c.label, role: c.role, sharePct: c.sharePct, stance, size, explanation };
  });

  const blockers = components
    .filter((c) => c.stance === "REFUSE_CONFIRME" || c.size === "TROP_GROS")
    .map((c) => c.explanation);
  const toConfirm = components
    .filter((c) => !blockers.length && (c.stance === "A_CONFIRMER" || c.stance === "INCONNU" || c.size === "INCONNU"))
    .map((c) => c.explanation);

  let kind: MixtureKind;
  if (!components.length) kind = "MELANGE_A_CONFIRMER";
  else if (blockers.length) kind = "MELANGE_INCOMPATIBLE";
  else if (toConfirm.length) kind = "MELANGE_A_CONFIRMER";
  else kind = components.length === 1 ? "MATERIAU_PUR" : "MELANGE_ACCEPTABLE";

  return {
    version: ENRICHMENT_VERSION,
    kind,
    components,
    blockers,
    toConfirm,
    reliesOnProbable: kind !== "MELANGE_INCOMPATIBLE" && components.some((c) => c.stance === "COMPATIBLE_PROBABLE"),
  };
}

// ---------------- 5. Questions à forte valeur ----------------

export type QuestionCategory = "material" | "granulometry" | "truck" | "capacity";

export interface ValuedQuestion {
  id: string;
  category: QuestionCategory;
  subject: string;
  question: string;
  /** Nombre de chargements actuellement « à confirmer » qu'une réponse débloquerait. */
  unlocked: number;
  score: number;
  reason: string;
}

/** Réponse hypothétique favorable, uniquement en simulation interne. */
function withHypothesis(
  profile: EnrichedProfile, q: { category: QuestionCategory; subject: string },
): EnrichedProfile {
  if (q.category === "material") {
    const key = q.subject as MaterialKey;
    const others = profile.materials.filter((m) => m.materialKey !== key);
    return {
      ...profile,
      acceptanceMode: profile.acceptanceMode,
      materials: [...others, {
        materialKey: key,
        label: MATERIAL_LABELS[key] ?? key,
        stance: "ACCEPTE_CONFIRME",
        origin: "human_recent",
        humanConfirmed: true,
        confidence: "CONFIRME",
        maxInches: null,
      }],
    };
  }
  if (q.category === "granulometry") {
    return { ...profile, granulometry: { ...profile.granulometry, maxInches: Number.POSITIVE_INFINITY, confirmed: true } };
  }
  return profile;
}

const countBlocked = (profile: EnrichedProfile, loads: LoadComposition[]) =>
  loads.filter((l) => evaluateMixture(l, profile).kind === "MELANGE_A_CONFIRMER").length;

/**
 * « Quelle prochaine question humaine débloquerait le plus de matchs fiables ? »
 * Le score est calculé sur des chargements réels fournis, jamais inventé.
 */
export function questionValue(profile: EnrichedProfile, loads: LoadComposition[]): ValuedQuestion[] {
  const base = countBlocked(profile, loads);
  const candidates: { category: QuestionCategory; subject: string; question: string; reason: string }[] = [];

  const seen = new Set<string>();
  for (const load of loads) {
    for (const c of load.materials) {
      const stance = stanceForMaterial(profile, c.materialKey);
      if ((stance === "INCONNU" || stance === "A_CONFIRMER") && !seen.has(c.materialKey)) {
        seen.add(c.materialKey);
        candidates.push({
          category: "material",
          subject: c.materialKey,
          question: `Acceptez-vous ${c.label} ?`,
          reason: "acceptation jamais documentée",
        });
      }
    }
  }
  if (profile.granulometry.maxInches == null && loads.some((l) => l.materials.some((c) => isSizeRelevant(c.materialKey)))) {
    candidates.push({
      category: "granulometry",
      subject: "max_inches",
      question: "Quelle grosseur maximale de roche acceptez-vous ?",
      reason: "aucune limite de grosseur confirmée",
    });
  }
  if (!profile.trucks.codes.length) {
    candidates.push({
      category: "truck", subject: "trucks",
      question: "Acceptez-vous les semi-remorques ?",
      reason: "types de camions inconnus",
    });
  }
  if (!profile.capacity.known) {
    candidates.push({
      category: "capacity", subject: "capacity",
      question: "Combien de voyages pouvez-vous encore recevoir ?",
      reason: "capacité restante inconnue",
    });
  }

  return candidates
    .map((c) => {
      const after = countBlocked(withHypothesis(profile, c), loads);
      const unlocked = Math.max(0, base - after);
      const weight = c.category === "material" ? 10 : c.category === "granulometry" ? 8 : 3;
      return { id: `${c.category}:${c.subject}`, ...c, unlocked, score: unlocked * weight + (unlocked ? 0 : 1) };
    })
    .sort((a, b) => b.score - a.score || a.question.localeCompare(b.question));
}

// ---------------- Synthèse interne ----------------

export interface EnrichmentSummary {
  submissionId: string;
  confirmed: number;
  probable: number;
  toConfirm: number;
  refused: number;
  unknown: number;
  /** Matchs réellement fiables (confirmés ou purs) sur les chargements fournis. */
  reliableMatches: number;
  potentialMatches: number;
  incompatible: number;
  topQuestion: ValuedQuestion | null;
}

export function summarizeEnrichment(profile: EnrichedProfile, loads: LoadComposition[]): EnrichmentSummary {
  const count = (s: MaterialStance) => profile.materials.filter((m) => m.stance === s).length;
  let reliable = 0, potential = 0, incompatible = 0;
  for (const l of loads) {
    const k = evaluateMixture(l, profile).kind;
    if (k === "MELANGE_INCOMPATIBLE") incompatible += 1;
    else if (k === "MELANGE_A_CONFIRMER") potential += 1;
    else reliable += 1;
  }
  const questions = questionValue(profile, loads);
  return {
    submissionId: profile.submissionId,
    confirmed: count("ACCEPTE_CONFIRME"),
    probable: count("COMPATIBLE_PROBABLE"),
    toConfirm: count("A_CONFIRMER"),
    refused: count("REFUSE_CONFIRME"),
    unknown: count("INCONNU"),
    reliableMatches: reliable,
    potentialMatches: potential,
    incompatible,
    topQuestion: questions[0] ?? null,
  };
}
