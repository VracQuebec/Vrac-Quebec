// ============================================================
// ASSISTANT IA MATÉRIAUX — INTERPRÉTATION DE TEXTE LIBRE (V1)
// ------------------------------------------------------------
// Règles absolues :
//  - INTERNE seulement : rien n'est branché sur le formulaire public.
//  - Interprétation, JAMAIS certification : aucune conformité
//    environnementale, contamination ou classification réglementaire
//    n'est déduite. « terre propre » reste une DÉCLARATION.
//  - Le texte original n'est jamais écrasé.
//  - Une donnée inconnue reste inconnue (jamais un « non »).
// ============================================================

import type { QuantityUnit } from "./engine";
import { VEHICLE_CONFIG_CODES } from "@/lib/transport/capacity";

export const INTERPRETER_VERSION = "ia-v1";

export type FieldConfidence = "ELEVEE" | "MOYENNE" | "FAIBLE";
export type Presence = "OUI" | "NON" | "INCONNU";

/** Clés de matériaux normalisées (couche parallèle, non publique). */
export type MaterialKey =
  | "terre"
  | "terre_excavation"
  | "sable"
  | "argile"
  | "pierre"
  | "roche"
  | "beton"
  | "asphalte"
  | "organique"
  | "materiel_inconnu";

export const MATERIAL_LABELS: Record<MaterialKey, string> = {
  terre: "terre",
  terre_excavation: "terre d'excavation",
  sable: "sable",
  argile: "glaise / argile",
  pierre: "pierre / cailloux",
  roche: "roche",
  beton: "béton",
  asphalte: "asphalte",
  organique: "matière organique",
  materiel_inconnu: "matériel non précisé",
};

export interface SynonymEntry {
  /** Expression telle qu'écrite sur le chantier. */
  expression: string;
  /** Matériaux normalisés produits par l'expression (plusieurs possibles). */
  materialKeys: MaterialKey[];
  confidence: FieldConfidence;
  /** Note interne (ex. « catégorie à valider »). */
  note?: string;
}

/**
 * Dictionnaire par défaut (langage de chantier québécois).
 * Il est complété/remplacé par la table administrable `material_synonyms`.
 */
export const DEFAULT_SYNONYMS: SynonymEntry[] = [
  { expression: "terre noire", materialKeys: ["terre", "organique"], confidence: "ELEVEE" },
  { expression: "terre brune", materialKeys: ["terre"], confidence: "ELEVEE" },
  { expression: "terre jaune", materialKeys: ["terre"], confidence: "ELEVEE" },
  { expression: "terre de remplissage", materialKeys: ["terre", "terre_excavation"], confidence: "ELEVEE" },
  { expression: "terre de remplissage", materialKeys: ["terre", "terre_excavation"], confidence: "ELEVEE" },
  { expression: "terre d excavation", materialKeys: ["terre", "terre_excavation"], confidence: "ELEVEE" },
  { expression: "terre dexcavation", materialKeys: ["terre", "terre_excavation"], confidence: "MOYENNE" },
  { expression: "terre sablonneuse", materialKeys: ["terre", "sable"], confidence: "ELEVEE" },
  { expression: "terre sableuse", materialKeys: ["terre", "sable"], confidence: "ELEVEE" },
  { expression: "sable terreux", materialKeys: ["sable", "terre"], confidence: "ELEVEE" },
  { expression: "terre glaiseuse", materialKeys: ["terre", "argile"], confidence: "ELEVEE" },
  { expression: "terre argileuse", materialKeys: ["terre", "argile"], confidence: "ELEVEE" },
  { expression: "glaise", materialKeys: ["argile"], confidence: "ELEVEE" },
  { expression: "glaize", materialKeys: ["argile"], confidence: "MOYENNE", note: "orthographe variante" },
  { expression: "argile", materialKeys: ["argile"], confidence: "ELEVEE" },
  { expression: "terre", materialKeys: ["terre"], confidence: "ELEVEE" },
  { expression: "sable", materialKeys: ["sable"], confidence: "ELEVEE" },
  { expression: "petite roche", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "petites roches", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "grosse roche", materialKeys: ["roche"], confidence: "MOYENNE" },
  { expression: "grosses roches", materialKeys: ["roche"], confidence: "MOYENNE" },
  { expression: "roche", materialKeys: ["roche"], confidence: "ELEVEE" },
  { expression: "roches", materialKeys: ["roche"], confidence: "ELEVEE" },
  { expression: "caillou", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "cailloux", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "pierre melangee", materialKeys: ["pierre"], confidence: "MOYENNE" },
  { expression: "pierre", materialKeys: ["pierre"], confidence: "ELEVEE" },
  { expression: "pierres", materialKeys: ["pierre"], confidence: "ELEVEE" },
  { expression: "gravier", materialKeys: ["pierre"], confidence: "ELEVEE" },
  { expression: "tuff", materialKeys: ["roche"], confidence: "FAIBLE", note: "catégorie à valider" },
  { expression: "tuf", materialKeys: ["roche"], confidence: "FAIBLE", note: "catégorie à valider" },
  { expression: "beton", materialKeys: ["beton"], confidence: "ELEVEE" },
  { expression: "ciment", materialKeys: ["beton"], confidence: "MOYENNE" },
  { expression: "asphalte", materialKeys: ["asphalte"], confidence: "ELEVEE" },
  { expression: "pavage", materialKeys: ["asphalte"], confidence: "MOYENNE" },
  { expression: "remblai", materialKeys: ["terre", "terre_excavation"], confidence: "MOYENNE" },
  { expression: "materiel d excavation", materialKeys: ["terre_excavation"], confidence: "MOYENNE" },
  { expression: "materiel dexcavation", materialKeys: ["terre_excavation"], confidence: "MOYENNE" },
  { expression: "materiel sorti d une excavation", materialKeys: ["terre_excavation"], confidence: "FAIBLE" },
  { expression: "excavation", materialKeys: ["terre_excavation"], confidence: "FAIBLE" },
  { expression: "materiel", materialKeys: ["materiel_inconnu"], confidence: "FAIBLE" },
  { expression: "materiaux", materialKeys: ["materiel_inconnu"], confidence: "FAIBLE" },
];

export interface DetectedMaterial {
  key: MaterialKey;
  label: string;
  confidence: FieldConfidence;
  /** Expression du texte qui a produit ce matériau. */
  matchedExpression: string;
  note?: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  options: string[];
  /** Champ visé par la question. */
  field: string;
}

export interface Interpretation {
  /** Jamais modifié, jamais écrasé. */
  originalText: string;
  normalizedText: string;
  materials: DetectedMaterial[];
  isMixture: boolean;
  quantity: number | null;
  unit: QuantityUnit | null;
  quantityIsApproximate: boolean;
  trips: number | null;
  truckConfigCode: string | null;
  truckLabel: string | null;
  axleCount: number | null;
  maxSizeInches: number | null;
  maxSizeLabel: string | null;
  granulometry: string | null;
  hasRock: Presence;
  hasSand: Presence;
  hasClay: Presence;
  hasConcrete: Presence;
  hasAsphalt: Presence;
  location: string | null;
  dates: string[];
  /** Déclaration utilisateur, jamais une certification. */
  declaredClean: boolean;
  declarations: string[];
  uncertainty: "FAIBLE" | "MOYENNE" | "ELEVEE";
  fieldConfidence: Record<string, FieldConfidence>;
  questions: ClarificationQuestion[];
  notes: string[];
  version: string;
}

// ---------- Normalisation tolérante (accents, casse, ponctuation) ----------

export function normalize(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9.,/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15, vingt: 20, trente: 30,
};

const toNumber = (raw: string): number | null => {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (Number.isFinite(n) && n > 0) return n;
  return NUMBER_WORDS[raw.trim()] ?? null;
};

// ---------- Camions ----------

interface TruckPattern { re: RegExp; code: string; label: string; axles: number | null }

const TRUCK_PATTERNS: TruckPattern[] = [
  { re: /semi\s*(?:remorque|dompeur|dompeuse)?\s*(?:a\s*)?4\s*essieux/, code: "semi_4_essieux", label: "semi-remorque 4 essieux", axles: 4 },
  { re: /semi\s*(?:remorque|dompeur|dompeuse)?\s*(?:a\s*)?3\s*essieux/, code: "semi_3_essieux", label: "semi-remorque 3 essieux", axles: 3 },
  { re: /semi\s*(?:remorque|dompeur|dompeuse)?\s*(?:a\s*)?2\s*essieux/, code: "semi_2_essieux", label: "semi-remorque 2 essieux", axles: 2 },
  { re: /\b12\s*roues?\b/, code: "porteur_12_roues", label: "camion 12 roues", axles: null },
  { re: /\b10\s*roues?\b/, code: "porteur_10_roues", label: "camion 10 roues", axles: null },
  { re: /\b6\s*roues?\b/, code: "porteur_6_roues", label: "camion 6 roues", axles: null },
  { re: /\bsemis?\b|\bsemi\s*remorque\b|\bsemi\s*dompeur\b|\bfardier\b/, code: "semi_3_essieux", label: "semi-remorque (nombre d'essieux à confirmer)", axles: null },
];

function detectTruck(text: string): { code: string | null; label: string | null; axles: number | null; confidence: FieldConfidence } {
  for (const p of TRUCK_PATTERNS) {
    if (p.re.test(text)) {
      const exact = p.axles != null || p.code.startsWith("porteur_");
      return {
        code: VEHICLE_CONFIG_CODES.includes(p.code as never) ? p.code : null,
        label: p.label,
        axles: p.axles,
        confidence: exact ? "ELEVEE" : "FAIBLE",
      };
    }
  }
  return { code: null, label: null, axles: null, confidence: "FAIBLE" };
}

// ---------- Quantité, voyages, grosseur ----------

function detectQuantity(text: string): { quantity: number | null; unit: QuantityUnit | null; approx: boolean; confidence: FieldConfidence } {
  const approx = /\benviron\b|\bapeu pres\b|\ba peu pres\b|\benv\b|\bautour de\b|\b~\b/.test(text);
  const m =
    text.match(/(\d+(?:[.,]\d+)?)\s*(tonnes?\s*metriques?|tonnes?|tm\b|t\b)/) ??
    text.match(/(\d+(?:[.,]\d+)?)\s*(verges?\s*(?:cubes?)?|vg3|yd3)/) ??
    text.match(/(\d+(?:[.,]\d+)?)\s*(metres?\s*cubes?|m3)/);
  if (!m) return { quantity: null, unit: null, approx, confidence: "FAIBLE" };
  const value = toNumber(m[1]);
  const u = m[2];
  const unit: QuantityUnit =
    /verge|vg3|yd3/.test(u) ? "verges3"
    : /m3|metre/.test(u) ? "m3"
    : /metrique|^tm/.test(u) ? "tonnes_metriques"
    : "tonnes";
  return { quantity: value, unit, approx, confidence: approx ? "MOYENNE" : "ELEVEE" };
}

function detectTrips(text: string): { trips: number | null; confidence: FieldConfidence } {
  const m =
    text.match(/(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt|trente)\s*(?:gros\s*|petits?\s*)?(voyages?|loads?|brouettes?\s*de\s*camion|camions?|trucks?)/);
  if (!m) return { trips: null, confidence: "FAIBLE" };
  const n = toNumber(m[1]);
  return { trips: n, confidence: n != null ? (/camions?|trucks?/.test(m[2]) ? "MOYENNE" : "ELEVEE") : "FAIBLE" };
}

function detectSize(text: string): { inches: number | null; label: string | null; confidence: FieldConfidence } {
  const m = text.match(/(?:moins de|max(?:imum)?|jusqu a|sous)\s*(\d+(?:[.,]\d+)?)\s*(pouces?|po\b|pi\b|pieds?)/);
  if (m) {
    const n = toNumber(m[1]);
    const feet = /pi\b|pied/.test(m[2]);
    const inches = n == null ? null : feet ? n * 12 : n;
    return { inches, label: inches == null ? null : `moins de ${inches} pouces`, confidence: "ELEVEE" };
  }
  const m2 = text.match(/(\d+(?:[.,]\d+)?)\s*(?:a|-)\s*(\d+(?:[.,]\d+)?)\s*(pouces?|po\b)/);
  if (m2) {
    const hi = toNumber(m2[2]);
    return { inches: hi, label: `${m2[1]} à ${m2[2]} pouces`, confidence: "ELEVEE" };
  }
  if (/petits? cailloux|petites? roches?|petites? pierres?|petit caillou/.test(text)) {
    return { inches: null, label: "petites pierres", confidence: "MOYENNE" };
  }
  if (/grosses? roches?|gros cailloux|grosses? pierres?/.test(text)) {
    return { inches: null, label: "grosses roches", confidence: "MOYENNE" };
  }
  return { inches: null, label: null, confidence: "FAIBLE" };
}

// ---------- Interprétation complète ----------

export function interpretDescription(
  originalText: string,
  synonyms: SynonymEntry[] = DEFAULT_SYNONYMS,
): Interpretation {
  const text = normalize(originalText);
  const notes: string[] = [];

  // Matériaux : toutes les expressions présentes, les plus longues d'abord,
  // sans jamais forcer un matériau principal unique.
  const sorted = [...synonyms].sort((a, b) => normalize(b.expression).length - normalize(a.expression).length);
  const found = new Map<MaterialKey, DetectedMaterial>();
  const consumed: Array<[number, number]> = [];
  for (const entry of sorted) {
    const expr = normalize(entry.expression);
    if (!expr) continue;
    const idx = text.indexOf(expr);
    if (idx < 0) continue;
    const overlapped = consumed.some(([s, e]) => idx < e && idx + expr.length > s);
    if (overlapped && entry.materialKeys.every((k) => found.has(k))) continue;
    consumed.push([idx, idx + expr.length]);
    for (const key of entry.materialKeys) {
      const existing = found.get(key);
      if (!existing || rank(entry.confidence) > rank(existing.confidence)) {
        found.set(key, {
          key,
          label: MATERIAL_LABELS[key],
          confidence: entry.confidence,
          matchedExpression: entry.expression,
          note: entry.note,
        });
      }
    }
    if (entry.note) notes.push(`« ${entry.expression} » : ${entry.note}`);
  }

  let materials = [...found.values()];
  // « matériel » seul n'est retenu que s'il n'y a rien d'autre.
  if (materials.length > 1) materials = materials.filter((m) => m.key !== "materiel_inconnu");

  const quantity = detectQuantity(text);
  const trips = detectTrips(text);
  const truck = detectTruck(text);
  const size = detectSize(text);

  const hasKey = (k: MaterialKey): Presence => (materials.some((m) => m.key === k) ? "OUI" : "INCONNU");
  const hasRock: Presence = materials.some((m) => m.key === "roche" || m.key === "pierre") ? "OUI" : "INCONNU";

  const mixtureWords = /\bmelange|melangee?s?\b|\bavec\b|\bpis\b|\bet\b|\bdedans\b|\bun peu de\b|\bpas mal de\b/.test(text);
  const isMixture = materials.length > 1 && mixtureWords;

  const declaredClean = /\bterre propre\b|\bmateriel propre\b|\bpropre\b/.test(text);
  const declarations = declaredClean
    ? ["déclaré comme propre par l'utilisateur — non vérifié"]
    : [];

  const location = detectLocation(originalText);
  const dates = detectDates(text);

  const fieldConfidence: Record<string, FieldConfidence> = {
    quantite: quantity.quantity != null ? quantity.confidence : "FAIBLE",
    voyages: trips.trips != null ? trips.confidence : "FAIBLE",
    camion: truck.code ? truck.confidence : "FAIBLE",
    grosseur: size.label ? size.confidence : "FAIBLE",
  };
  for (const m of materials) fieldConfidence[m.label] = m.confidence;

  const questions = buildQuestions({ materials, hasRock, sizeLabel: size.label, truckCode: truck.code, trips: trips.trips, quantity: quantity.quantity, text });

  const unknowns = [
    quantity.quantity == null && trips.trips == null,
    materials.length === 0,
    Object.values(fieldConfidence).filter((c) => c === "FAIBLE").length >= 2,
  ].filter(Boolean).length;
  const uncertainty = unknowns >= 2 ? "ELEVEE" : unknowns === 1 ? "MOYENNE" : "FAIBLE";

  return {
    originalText,
    normalizedText: text,
    materials,
    isMixture,
    quantity: quantity.quantity,
    unit: quantity.unit,
    quantityIsApproximate: quantity.approx,
    trips: trips.trips,
    truckConfigCode: truck.code,
    truckLabel: truck.label,
    axleCount: truck.axles,
    maxSizeInches: size.inches,
    maxSizeLabel: size.label,
    granulometry: size.label,
    hasRock,
    hasSand: hasKey("sable"),
    hasClay: hasKey("argile"),
    hasConcrete: hasKey("beton"),
    hasAsphalt: hasKey("asphalte"),
    location,
    dates,
    declaredClean,
    declarations,
    uncertainty,
    fieldConfidence,
    questions,
    notes,
    version: INTERPRETER_VERSION,
  };
}

const rank = (c: FieldConfidence) => (c === "ELEVEE" ? 3 : c === "MOYENNE" ? 2 : 1);

function detectLocation(original: string): string | null {
  const m = original.match(/\b(?:a|à|dans|secteur|proche de|pres de|près de)\s+([A-ZÉÈÊÀÂÎÔÛ][\wÀ-ÿ'’-]+(?:\s+[A-ZÉÈÊÀÂÎÔÛ][\wÀ-ÿ'’-]+)*)/);
  return m ? m[1].trim() : null;
}

function detectDates(text: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{1,2}\s*(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)|\d{4}-\d{2}-\d{2}|semaine prochaine|la semaine prochaine|demain|des que possible)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

interface QuestionInput {
  materials: DetectedMaterial[];
  hasRock: Presence;
  sizeLabel: string | null;
  truckCode: string | null;
  trips: number | null;
  quantity: number | null;
  text: string;
}

/** Maximum 2 questions : uniquement celles qui améliorent vraiment le matching. */
export function buildQuestions(input: QuestionInput): ClarificationQuestion[] {
  const qs: ClarificationQuestion[] = [];

  if (input.hasRock === "OUI" && !input.sizeLabel) {
    qs.push({
      id: "rock_size",
      field: "grosseur",
      question: "Les morceaux de roche font environ quelle grosseur ?",
      options: ["moins de 4 po", "4 à 12 po", "12 à 18 po", "plus de 18 po", "je ne sais pas"],
    });
  }

  const mentionsBetonAsphalte = input.materials.some((m) => m.key === "beton" || m.key === "asphalte");
  if (!mentionsBetonAsphalte && input.materials.length > 0) {
    qs.push({
      id: "beton_asphalte",
      field: "contaminants_visibles",
      question: "Y a-t-il du béton ou de l'asphalte mélangé ?",
      options: ["Oui", "Non", "Je ne sais pas"],
    });
  }

  if (input.trips != null && !input.truckCode) {
    qs.push({
      id: "truck_type",
      field: "camion",
      question: "Savez-vous quel genre de camion ?",
      options: ["6 roues", "10 roues", "12 roues", "semi", "je ne sais pas"],
    });
  }

  if (input.quantity == null && input.trips == null) {
    qs.push({
      id: "volume",
      field: "quantite",
      question: "Environ combien de matériel avez-vous à sortir ?",
      options: ["quelques camions", "moins de 100 tonnes", "100 à 500 tonnes", "plus de 500 tonnes", "je ne sais pas"],
    });
  }

  return qs.slice(0, 2);
}

/** Étiquette publique simple (aucun score technique n'est montré au public). */
export function publicMatchLabel(score: number, confidence: string): string {
  if (confidence === "A_VALIDER") return "À CONFIRMER";
  if (score >= 80) return "MEILLEUR MATCH";
  if (score >= 65) return "TRÈS BON MATCH";
  if (score >= 45) return "MATCH POSSIBLE";
  return "À CONFIRMER";
}

/** Données structurées confirmées par l'utilisateur (jamais silencieuses). */
export interface ConfirmedStructuredData {
  original_user_description: string;
  normalized_structured_data: {
    materials: MaterialKey[];
    material_labels: string[];
    is_mixture: boolean;
    quantity: number | null;
    unit: QuantityUnit | null;
    trips: number | null;
    truck_config_code: string | null;
    max_size_inches: number | null;
    max_size_label: string | null;
    has_rock: Presence;
    has_sand: Presence;
    has_clay: Presence;
    has_concrete: Presence;
    has_asphalt: Presence;
    location: string | null;
    dates: string[];
    declarations: string[];
    field_confidence: Record<string, FieldConfidence>;
    answers: Record<string, string>;
  };
  interpreter_version: string;
}

export function toStructuredData(
  interpretation: Interpretation,
  answers: Record<string, string> = {},
): ConfirmedStructuredData {
  const tri = (base: Presence, answer?: string): Presence => {
    if (!answer) return base;
    const a = normalize(answer);
    if (a.startsWith("oui")) return "OUI";
    if (a.startsWith("non")) return "NON";
    return base === "OUI" ? "OUI" : "INCONNU";
  };
  const betonAnswer = answers["beton_asphalte"];
  return {
    original_user_description: interpretation.originalText,
    normalized_structured_data: {
      materials: interpretation.materials.map((m) => m.key),
      material_labels: interpretation.materials.map((m) => m.label),
      is_mixture: interpretation.isMixture,
      quantity: interpretation.quantity,
      unit: interpretation.unit,
      trips: interpretation.trips,
      truck_config_code: interpretation.truckConfigCode,
      max_size_inches: interpretation.maxSizeInches,
      max_size_label: interpretation.maxSizeLabel,
      has_rock: interpretation.hasRock,
      has_sand: interpretation.hasSand,
      has_clay: interpretation.hasClay,
      has_concrete: tri(interpretation.hasConcrete, betonAnswer),
      has_asphalt: tri(interpretation.hasAsphalt, betonAnswer),
      location: interpretation.location,
      dates: interpretation.dates,
      declarations: interpretation.declarations,
      field_confidence: interpretation.fieldConfidence,
      answers,
    },
    interpreter_version: INTERPRETER_VERSION,
  };
}

/**
 * Quantité estimée à partir du nombre de voyages.
 * Renvoie null si la capacité opérationnelle du véhicule est inconnue :
 * aucune capacité n'est inventée.
 */
export function estimateTonnesFromTrips(
  trips: number | null,
  capacityTonnes: number | null,
): { tonnes: number | null; isEstimate: true; note: string } {
  if (trips == null || capacityTonnes == null) {
    return {
      tonnes: null,
      isEstimate: true,
      note: "Quantité non estimable : capacité opérationnelle du véhicule inconnue.",
    };
  }
  return {
    tonnes: trips * capacityTonnes,
    isEstimate: true,
    note: `Estimation : ${trips} voyage(s) × ${capacityTonnes} t de capacité opérationnelle.`,
  };
}
