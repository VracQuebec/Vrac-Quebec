// ============================================================
// LOT 9 — COUCHE D'INTERPRÉTATION DU LANGAGE DE CHANTIER
// ------------------------------------------------------------
// Couche ADDITIVE au-dessus de l'interpréteur existant
// (src/lib/matching/interpreter.ts). Elle n'écrase rien, ne
// modifie aucune donnée et n'active aucun matching public.
//
// Règles absolues :
//  - Le texte original est TOUJOURS conservé intact.
//  - Matériau ≠ granulométrie ≠ condition ≠ restriction
//    ≠ qualité environnementale ≠ quantité ≠ camion ≠ accès.
//  - Une négation produit une RESTRICTION, jamais un matériau accepté.
//  - Aucune classification environnementale officielle n'est déduite :
//    « propre », « contaminé » restent des DÉCLARATIONS.
//  - Aucun pourcentage n'est inventé.
//  - L'inconnu reste inconnu : jamais transformé en certitude.
// ============================================================

import {
  DEFAULT_SYNONYMS, MATERIAL_LABELS, interpretDescription, normalize,
  type FieldConfidence, type Interpretation, type MaterialKey, type SynonymEntry,
} from "@/lib/matching/interpreter";
import type { QuantityUnit } from "@/lib/matching/engine";
import type { OfferInput, OfferMaterial, SizeSource } from "@/lib/matching/v2";

export const CHANTIER_NLU_VERSION = "nlu-chantier-v1";

export type Direction = "EVACUATION" | "RECEPTION";
export type CompositionRole = "PRINCIPAL" | "SECONDAIRE" | "TRACE" | "INCONNU";

export interface MaterialComponent {
  key: MaterialKey;
  label: string;
  role: CompositionRole;
  /** Confiance 0 → 1, à usage moteur (jamais affichée telle quelle au particulier). */
  confidence: number;
  matchedExpression: string;
  /** Pourcentage uniquement si l'utilisateur l'a exprimé. */
  sharePct: number | null;
  note?: string;
}

export type RestrictionKind = "MATERIAU" | "DIMENSION" | "ENVIRONNEMENT" | "AUTRE";

export interface Restriction {
  kind: RestrictionKind;
  label: string;
  materialKey?: MaterialKey;
  maxInches?: number | null;
  /** Extrait du texte original ayant produit la restriction. */
  originalExpression: string;
}

export interface GranulometryRead {
  /** Code canonique du référentiel lorsqu'il existe (ex. « 0-3/4 »). */
  code: string | null;
  label: string;
  canonical: boolean;
  minInches: number | null;
  maxInches: number | null;
  originalExpression: string;
}

export interface ConditionRead {
  key: string;
  label: string;
  /** Toujours vrai : une condition reste une déclaration de l'utilisateur. */
  declaration: boolean;
  originalExpression: string;
}

export interface ChantierInterpretation {
  version: string;
  direction: Direction;
  /** Jamais modifié, jamais écrasé. */
  originalText: string;
  normalizedText: string;
  materials: MaterialComponent[];
  granulometries: GranulometryRead[];
  conditions: ConditionRead[];
  restrictions: Restriction[];
  quantity: { value: number | null; unit: QuantityUnit | null; approximate: boolean };
  trips: number | null;
  truck: { code: string | null; label: string | null; axles: number | null };
  acceptsAlmostEverything: boolean;
  uncertainty: "FAIBLE" | "MOYENNE" | "ELEVEE";
  uncertaintyMarkers: string[];
  unrecognizedSegments: string[];
  needsHumanHelp: boolean;
  /** Une photo aiderait l'identification (aucune analyse d'image n'est faite ici). */
  photoSuggested: boolean;
  base: Interpretation;
}

// ---------------- Vocabulaire additionnel de chantier ----------------

export const CHANTIER_EXTRA_SYNONYMS: SynonymEntry[] = [
  { expression: "beton concasse", materialKeys: ["beton"], confidence: "ELEVEE" },
  { expression: "beton casse", materialKeys: ["beton"], confidence: "ELEVEE" },
  { expression: "planage d asphalte", materialKeys: ["asphalte"], confidence: "ELEVEE" },
  { expression: "planage", materialKeys: ["asphalte"], confidence: "MOYENNE" },
  { expression: "roche concassee", materialKeys: ["pierre"], confidence: "ELEVEE" },
  { expression: "pierre concassee", materialKeys: ["pierre"], confidence: "ELEVEE" },
  { expression: "souche", materialKeys: ["organique"], confidence: "ELEVEE" },
  { expression: "souches", materialKeys: ["organique"], confidence: "ELEVEE" },
  { expression: "racine", materialKeys: ["organique"], confidence: "MOYENNE" },
  { expression: "racines", materialKeys: ["organique"], confidence: "MOYENNE" },
  { expression: "remplissage", materialKeys: ["terre", "terre_excavation"], confidence: "MOYENNE" },
  { expression: "mg 20", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "mg-20", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "mg 56", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "mg-56", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "poussiere", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "poussiere de pierre", materialKeys: ["pierre"], confidence: "ELEVEE" },
];

export const chantierSynonyms = (extra: SynonymEntry[] = []): SynonymEntry[] => [
  ...DEFAULT_SYNONYMS, ...CHANTIER_EXTRA_SYNONYMS, ...extra,
];

// ---------------- Granulométrie ----------------

interface GranPattern { re: RegExp; code: string | null; label: string; min: number | null; max: number | null }

const FRACTION = "(?:0\\s*[-a]\\s*)?(?:\\d+\\s*)?(?:\\d\\/\\d)";

const GRAN_PATTERNS: GranPattern[] = [
  { re: /\bmg\s*-?\s*20\b/, code: "MG-20", label: "MG-20", min: 0, max: 0.8 },
  { re: /\bmg\s*-?\s*56\b/, code: "MG-56", label: "MG-56", min: 0, max: 2.25 },
  { re: /\b0\s*-\s*3\/4\b|\bzero\s*trois\s*quart\b/, code: "0-3/4", label: "0-3/4", min: 0, max: 0.75 },
  { re: /\btrois\s*quarts?\s*net\b|\b3\/4\s*net\b/, code: "3/4 net", label: "3/4 net", min: 0.75, max: 0.75 },
  { re: /\b0\s*-\s*2\s*1\/2\b/, code: "0-2 1/2", label: "0-2 1/2", min: 0, max: 2.5 },
  { re: /\b0\s*-\s*4\b/, code: "0-4", label: "0-4", min: 0, max: 4 },
  { re: /\b0\s*-\s*20\b/, code: "0-20", label: "0-20 mm", min: 0, max: 0.8 },
  { re: /\bpoussiere(?: de pierre)?\b/, code: "poussiere", label: "poussière de pierre", min: 0, max: 0.2 },
  { re: /\bblocs?\b/, code: null, label: "blocs", min: 24, max: null },
];

export function detectGranulometries(text: string): GranulometryRead[] {
  const out: GranulometryRead[] = [];
  for (const p of GRAN_PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    out.push({
      code: p.code, label: p.label, canonical: p.code != null,
      minInches: p.min, maxInches: p.max, originalExpression: m[0].trim(),
    });
  }
  // Dimension libre (non canonique) : « moins de 18 pouces », « 0 à 6 pouces ».
  const less = text.match(/(?:moins de|max(?:imum)?|jusqu a|sous|pas plus (?:gros |grand )?que)\s*(\d+(?:[.,]\d+)?)\s*(pouces?|po\b|pieds?|pi\b)/);
  if (less) {
    const n = Number(less[1].replace(",", "."));
    const inches = /pied|pi\b/.test(less[2]) ? n * 12 : n;
    out.push({
      code: null, label: `moins de ${inches} pouces`, canonical: false,
      minInches: null, maxInches: inches, originalExpression: less[0].trim(),
    });
  }
  if (!less) {
    const range = text.match(/(\d+(?:[.,]\d+)?)\s*(?:a|-)\s*(\d+(?:[.,]\d+)?)\s*(pouces?|po\b)/);
    if (range) {
      out.push({
        code: null, label: `${range[1]} à ${range[2]} pouces`, canonical: false,
        minInches: Number(range[1].replace(",", ".")), maxInches: Number(range[2].replace(",", ".")),
        originalExpression: range[0].trim(),
      });
    }
  }
  if (/petits? cailloux|petites? roches?|petites? pierres?/.test(text)) {
    out.push({ code: null, label: "petites pierres", canonical: false, minInches: null, maxInches: 6, originalExpression: "petites pierres" });
  }
  if (/grosses? roches?|gros cailloux|grosses? pierres?/.test(text)) {
    out.push({ code: null, label: "grosses roches", canonical: false, minInches: 12, maxInches: null, originalExpression: "grosses roches" });
  }
  return out;
}

// ---------------- Conditions (jamais des matériaux) ----------------

const CONDITION_PATTERNS: { re: RegExp; key: string; label: string }[] = [
  { re: /\bs\s*egoutte bien\b|\begoutte bien\b|\bdrainant\b|\bse draine bien\b/, key: "drainant", label: "s'égoutte bien (déclaré)" },
  { re: /\bmouille\b|\btrempe\b|\bdetrempe\b/, key: "mouille", label: "mouillé (déclaré)" },
  { re: /\bhumide\b/, key: "humide", label: "humide (déclaré)" },
  { re: /\bsecs?\b|\bseche?s?\b|\bbien sec\b/, key: "sec", label: "sec (déclaré)" },
  { re: /\bgele\b/, key: "gele", label: "gelé (déclaré)" },
  { re: /\bcompacte\b/, key: "compacte", label: "compacté (déclaré)" },
  { re: /\bpropre\b|\bclean\b/, key: "propre", label: "déclaré propre — non vérifié" },
  { re: /\bmelange\b|\bmelangee?s?\b|\bmixte\b/, key: "melange", label: "mélange (déclaré)" },
];

export function detectConditions(text: string, negatedSpans: Array<[number, number]>): ConditionRead[] {
  const out: ConditionRead[] = [];
  for (const p of CONDITION_PATTERNS) {
    const m = p.re.exec(text);
    if (!m) continue;
    const idx = m.index;
    if (negatedSpans.some(([s, e]) => idx >= s && idx < e)) continue;
    out.push({ key: p.key, label: p.label, declaration: true, originalExpression: m[0].trim() });
  }
  return out;
}

// ---------------- Négations / restrictions ----------------

const NEGATION_CUES = [
  "pas de", "pas d", "mais pas", "sans", "aucune", "aucun", "rien de", "rien d", "sauf",
  "excepte", "a part", "pas mal de rien", "exclu", "exclus", "refuse", "je ne prends pas",
];

/** Spans négatifs du texte normalisé. « pas mal de » n'est PAS une négation. */
export function negationSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const cue of NEGATION_CUES) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(cue, from);
      if (idx < 0) break;
      from = idx + cue.length;
      const before = text.slice(Math.max(0, idx - 2), idx);
      const after = text.slice(idx, idx + cue.length + 10);
      const isWordStart = idx === 0 || /[\s,.;]/.test(before.slice(-1));
      if (!isWordStart) continue;
      if (/^pas mal/.test(after)) continue; // « pas mal de terre » = beaucoup
      const rest = text.slice(from);
      const stop = rest.search(/(?:\bmais\b|\.|;|\bpar contre\b)/);
      spans.push([from, stop < 0 ? text.length : from + stop]);
    }
  }
  return spans;
}

const ENV_TERMS: { re: RegExp; label: string }[] = [
  { re: /\bcontamine\w*\b/, label: "rien de contaminé (déclaration de l'utilisateur)" },
  { re: /\bhydrocarbures?\b/, label: "aucun hydrocarbure (déclaration de l'utilisateur)" },
  { re: /\bamiante\b/, label: "aucune amiante (déclaration de l'utilisateur)" },
  { re: /\bdechets?\b|\bvidange\b|\bordures?\b/, label: "aucun déchet (déclaration de l'utilisateur)" },
];

// ---------------- Dominance / composition ----------------

const TRACE_CUES = /\b(un peu de|une trace de|quelques|legerement|un petit peu de|une couple de)\b/;
const MAIN_CUES = /\b(surtout|principalement|majoritairement|en majorite|beaucoup de|pas mal de)\b/;
const HALF_CUES = /\bmoitie\b/;

function roleFor(text: string, expression: string, index: number, position: number, total: number, half: boolean): CompositionRole {
  if (half) return "PRINCIPAL";
  const before = text.slice(Math.max(0, index - 28), index);
  if (TRACE_CUES.test(before)) return "TRACE";
  if (MAIN_CUES.test(before)) return "PRINCIPAL";
  if (total === 1) return "PRINCIPAL";
  return position === 0 ? "PRINCIPAL" : "SECONDAIRE";
}

const NUM_CONF: Record<FieldConfidence, number> = { ELEVEE: 0.95, MOYENNE: 0.78, FAIBLE: 0.55 };

// ---------------- Incertitude ----------------

const UNCERTAINTY_CUES = [
  "je pense", "probablement", "peut etre", "je ne sais pas", "je sais pas",
  "pas certain", "pas sur", "ressemble a", "possiblement", "environ", "genre", "mettons",
];

// ---------------- Segments non compris ----------------

const STOPWORDS = new Set([
  "avec", "dans", "dedans", "pour", "mais", "puis", "pis", "des", "une", "les", "que", "qui",
  "sur", "sous", "plus", "moins", "tout", "tous", "cest", "est", "sont", "dun", "une", "aussi",
  "voyage", "voyages", "load", "loads", "tonnes", "tonne", "pouces", "pouce", "roues", "semi",
  "essieux", "camion", "camions", "prendre", "prend", "prends", "recevoir", "besoin", "cherche",
  "accepte", "environ", "beaucoup", "peu", "quelques", "melange", "melangee", "melanges",
]);

export function interpretChantier(
  originalText: string,
  opts: { direction?: Direction; synonyms?: SynonymEntry[] } = {},
): ChantierInterpretation {
  const direction = opts.direction ?? "EVACUATION";
  const synonyms = opts.synonyms ?? chantierSynonyms();
  const base = interpretDescription(originalText, synonyms);
  const text = base.normalizedText;
  const spans = negationSpans(text);
  const half = HALF_CUES.test(text);

  // --- Matériaux acceptés vs refusés (les négations deviennent des restrictions) ---
  const restrictions: Restriction[] = [];
  const accepted: MaterialComponent[] = [];
  const positioned = base.materials
    .map((m) => ({ m, idx: text.indexOf(normalize(m.matchedExpression)) }))
    .sort((a, b) => (a.idx < 0 ? 1 : b.idx < 0 ? -1 : a.idx - b.idx));

  positioned.forEach(({ m, idx }, i) => {
    const negated = idx >= 0 && spans.some(([s, e]) => idx >= s && idx < e);
    if (negated) {
      restrictions.push({
        kind: "MATERIAU",
        label: `pas de ${MATERIAL_LABELS[m.key]}`,
        materialKey: m.key,
        originalExpression: m.matchedExpression,
      });
      return;
    }
    const role = roleFor(text, m.matchedExpression, idx < 0 ? 0 : idx, i, base.materials.length, half);
    let confidence = NUM_CONF[m.confidence];
    if (role === "TRACE") confidence = Math.max(0.4, confidence - 0.1);
    accepted.push({
      key: m.key, label: MATERIAL_LABELS[m.key], role,
      confidence: Number(confidence.toFixed(2)),
      matchedExpression: m.matchedExpression,
      sharePct: null,
      note: m.note,
    });
  });

  // --- Pourcentages uniquement s'ils sont écrits (lus sur le texte d'origine) ---
  const pctText = originalText
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%]+/g, " ").trim();
  for (const c of accepted) {
    const expr = normalize(c.matchedExpression);
    const re = new RegExp(`(\\d{1,3})\\s*%[^a-z%]{0,8}${expr}|${expr}[^a-z%]{0,8}(\\d{1,3})\\s*%`);
    const m = pctText.match(re);
    const pct = m ? Number(m[1] ?? m[2]) : null;
    if (pct != null && pct > 0 && pct <= 100) c.sharePct = pct;
  }


  // --- Restrictions environnementales et dimensionnelles ---
  for (const [s, e] of spans) {
    const seg = text.slice(s, e);
    for (const t of ENV_TERMS) {
      if (t.re.test(seg) && !restrictions.some((r) => r.label === t.label)) {
        restrictions.push({ kind: "ENVIRONNEMENT", label: t.label, originalExpression: seg.trim() });
      }
    }
  }
  const bigger = text.match(/(?:pas de|aucun|rien)\s*(?:morceaux?|roches?|blocs?|pierres?)?\s*(?:plus (?:gros|grand)s? que|de plus de|au dessus de)\s*(\d+(?:[.,]\d+)?)\s*(pouces?|po\b|pieds?|pi\b)/);
  if (bigger) {
    const n = Number(bigger[1].replace(",", "."));
    const inches = /pied|pi\b/.test(bigger[2]) ? n * 12 : n;
    restrictions.push({
      kind: "DIMENSION", label: `rien de plus gros que ${inches} pouces`,
      maxInches: inches, originalExpression: bigger[0].trim(),
    });
  }

  const granulometries = detectGranulometries(text).filter(
    (g) => !spans.some(([s, e]) => { const i = text.indexOf(g.originalExpression); return i >= s && i < e; }),
  );
  const conditions = detectConditions(text, spans);

  const uncertaintyMarkers = UNCERTAINTY_CUES.filter((c) => text.includes(c));
  const acceptsAlmostEverything =
    /\bn importe quoi\b|\bnimporte quoi\b|\btout ce que tu veux\b|\btout rentre\b|\bpas mal tout\b|\bpas mal n importe\b|\btout sauf\b|\bn importe quelle?\b/.test(text);

  const known = new Set<string>();
  for (const c of accepted) normalize(c.matchedExpression).split(" ").forEach((w) => known.add(w));
  for (const r of restrictions) normalize(r.originalExpression).split(" ").forEach((w) => known.add(w));
  for (const g of granulometries) normalize(g.originalExpression).split(" ").forEach((w) => known.add(w));
  for (const c of conditions) normalize(c.originalExpression).split(" ").forEach((w) => known.add(w));
  const unrecognizedSegments = Array.from(
    new Set(
      text.split(/[\s,]+/)
        .filter((w) => w.length > 3 && !/\d/.test(w) && !STOPWORDS.has(w) && !known.has(w)),
    ),
  ).slice(0, 8);

  const lowConfidence = accepted.length > 0 && accepted.every((m) => m.confidence < 0.7);
  const uncertainty: ChantierInterpretation["uncertainty"] =
    accepted.length === 0 || (uncertaintyMarkers.length > 0 && lowConfidence)
      ? "ELEVEE"
      : uncertaintyMarkers.length > 0 || lowConfidence || base.uncertainty === "ELEVEE"
        ? "MOYENNE"
        : base.uncertainty;

  const needsHumanHelp =
    accepted.length === 0 ||
    accepted.every((m) => m.key === "materiel_inconnu") ||
    uncertainty === "ELEVEE";

  return {
    version: CHANTIER_NLU_VERSION,
    direction,
    originalText,
    normalizedText: text,
    materials: accepted,
    granulometries,
    conditions,
    restrictions,
    quantity: { value: base.quantity, unit: base.unit, approximate: base.quantityIsApproximate },
    trips: base.trips,
    truck: { code: base.truckConfigCode, label: base.truckLabel, axles: base.axleCount },
    acceptsAlmostEverything,
    uncertainty,
    uncertaintyMarkers,
    unrecognizedSegments,
    needsHumanHelp,
    photoSuggested: needsHumanHelp,
    base,
  };
}

// ---------------- Confirmation « user friendly » ----------------

export interface FriendlySummary {
  materials: string[];
  quantity: string | null;
  granulometry: string[];
  conditions: string[];
  restrictions: string[];
  truck: string | null;
  warning: string | null;
}

const ROLE_PREFIX: Record<CompositionRole, string> = {
  PRINCIPAL: "", SECONDAIRE: "", TRACE: "un peu de ", INCONNU: "",
};

/** Résumé sans identifiant, sans JSON, sans score technique. */
export function friendlySummary(i: ChantierInterpretation): FriendlySummary {
  const qty = i.quantity.value != null && i.quantity.unit
    ? `${i.quantity.approximate ? "≈ " : ""}${i.quantity.value} ${i.quantity.unit === "verges3" ? "verges³" : i.quantity.unit === "m3" ? "m³" : i.quantity.unit.replace("_", " ")}`
    : i.trips != null
      ? `${i.trips} voyage${i.trips > 1 ? "s" : ""}`
      : null;
  return {
    materials: i.materials.map((m) => `${ROLE_PREFIX[m.role]}${m.label}`),
    quantity: qty,
    granulometry: i.granulometries.map((g) => g.label),
    conditions: i.conditions.map((c) => c.label),
    restrictions: i.restrictions.map((r) => r.label),
    truck: i.truck.label,
    warning: i.needsHumanHelp
      ? "Je ne suis pas certain d'avoir bien identifié ce matériau."
      : null,
  };
}

export const HELP_ACTIONS = [
  "Ajouter une photo",
  "Écrire une précision",
  "Choisir manuellement",
  "Continuer quand même",
] as const;

/** Emplacements photo préparés pour une future couche d'analyse (aucune analyse ici). */
export interface PhotoSlot { id: string; storagePath: string | null; analyzed: false }

export const buildPhotoSlots = (paths: string[]): PhotoSlot[] =>
  paths.map((p, i) => ({ id: `photo-${i + 1}`, storagePath: p, analyzed: false }));

// ---------------- Sortie compatible Matching V2 ----------------

const SLUG_BY_KEY: Record<MaterialKey, string> = {
  terre: "terre", terre_excavation: "terre_excavation", sable: "sable", argile: "argile",
  pierre: "pierre", roche: "roche", beton: "beton", asphalte: "asphalte",
  organique: "organique", materiel_inconnu: "materiel_inconnu",
};

export interface MatchingV2Payload {
  offer: OfferInput;
  /** Matériaux explicitement refusés (restrictions), pour la direction réception. */
  refusedSlugs: string[];
  maxSizeInches: number | null;
  sizeSource: SizeSource;
  trips: number | null;
  direction: Direction;
}

export function toMatchingV2Payload(
  i: ChantierInterpretation,
  opts: { id?: string; origin?: { lat: number; lng: number } | null; quantityTonnes?: number | null } = {},
): MatchingV2Payload {
  const sizes = [
    ...i.granulometries.map((g) => g.maxInches),
    ...i.restrictions.map((r) => r.maxInches ?? null),
  ].filter((n): n is number => typeof n === "number");
  const maxSizeInches = sizes.length ? Math.min(...sizes) : null;
  const materials: OfferMaterial[] = i.materials.map((m) => ({
    slug: SLUG_BY_KEY[m.key],
    label: m.label,
    maxSizeInches,
    sizeSource: maxSizeInches == null ? "INCONNU" : "DECLARE",
    sharePct: m.sharePct,
  }));
  return {
    offer: {
      id: opts.id ?? "simulation",
      label: i.originalText.slice(0, 120),
      materials,
      quantityTonnes: opts.quantityTonnes ?? (i.quantity.unit === "tonnes" ? i.quantity.value : null),
      origin: opts.origin ?? null,
      configCode: i.truck.code,
      maxSizeInches,
      sizeSource: maxSizeInches == null ? "INCONNU" : "DECLARE",
    },
    refusedSlugs: i.restrictions
      .filter((r) => r.kind === "MATERIAU" && r.materialKey)
      .map((r) => SLUG_BY_KEY[r.materialKey as MaterialKey]),
    maxSizeInches,
    sizeSource: maxSizeInches == null ? "INCONNU" : "DECLARE",
    trips: i.trips,
    direction: i.direction,
  };
}

// ---------------- Apprentissage (structure, sans entraînement auto) ----------------

export interface InterpretationRecord {
  originalText: string;
  direction: Direction;
  proposed: ChantierInterpretation;
  /** Correction humaine facultative (admin). Le texte original n'est jamais écrasé. */
  correction?: Partial<Pick<ChantierInterpretation, "materials" | "restrictions" | "granulometries" | "conditions">> | null;
}

export function buildLearningPayload(rec: InterpretationRecord) {
  const finalInterpretation = rec.correction
    ? { ...rec.proposed, ...rec.correction, correctedByHuman: true }
    : { ...rec.proposed, correctedByHuman: false };
  return {
    original_text: rec.originalText,
    direction: rec.direction,
    interpreter_version: CHANTIER_NLU_VERSION,
    proposed_interpretation: JSON.parse(JSON.stringify(rec.proposed)),
    human_correction: rec.correction ? JSON.parse(JSON.stringify(rec.correction)) : null,
    final_interpretation: JSON.parse(JSON.stringify(finalInterpretation)),
  };
}
