// ============================================================
// LOT 19 — MOTEUR DÉTERMINISTE D'INTERPRÉTATION DU LANGAGE DE CHANTIER
// ------------------------------------------------------------
// Étapes strictement séparées :
//   1. extraction  2. normalisation  3. confiance
//   4. ambiguïtés  5. questions de clarification  6. validation métier
// Aucune écriture, aucun appel réseau, aucune invention de donnée.
// Une hypothèse ne devient JAMAIS une certitude.
// ============================================================
import { MATERIAL_LABELS, type MaterialKey } from "@/lib/matching/interpreter";
import type { LoadComposition } from "@/lib/matching/compatibility";
import type { CompositionRole } from "@/lib/nlu/chantier";
import {
  APPROXIMATE_MARKERS, CLEAN_MARKERS, CONTAMINATED_MARKERS, DISPLAY_TERM,
  MATERIAL_VOCABULARY, PROPORTION_MARKERS, UNIT_VOCABULARY, VAGUE_SIZE_MARKERS,
  VEHICLE_LABELS, VEHICLE_VOCABULARY, VEHICLE_CONFIG_CODE, normalize,
} from "./vocabulary";
import {
  MATERIAL_LANGUAGE_VERSION,
  type Ambiguity, type ClarificationQuestion, type ParsedGranulometry,
  type ParsedMaterial, type ParsedMaterialDescription, type ParsedRole,
  type ParsedUnit, type VehicleType,
} from "./types";

// ---------------- Outils ----------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseRe = (expr: string) => new RegExp(`(?:^|[^a-z0-9])(${escape(expr).replace(/\s+/g, "\\s+")})(?![a-z])`, "g");

function parseInches(raw: string): number | null {
  const t = raw.trim();
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------------- 1. Extraction : matériaux ----------------

interface Hit { start: number; end: number; entry: (typeof MATERIAL_VOCABULARY)[number]; text: string }

function findMaterialHits(text: string): Hit[] {
  const sorted = [...MATERIAL_VOCABULARY].sort((a, b) => b.expression.length - a.expression.length);
  const hits: Hit[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([ts, te]) => s < te && e > ts);

  for (const entry of sorted) {
    const re = phraseRe(entry.expression);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index + m[0].length - m[1].length;
      const end = start + m[1].length;
      if (!overlaps(start, end)) {
        taken.push([start, end]);
        hits.push({ start, end, entry, text: m[1] });
      }
      re.lastIndex = end;
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function roleFromContext(segment: string, fallback: ParsedRole): ParsedRole {
  let best: { role: ParsedRole; index: number } | null = null;
  for (const marker of PROPORTION_MARKERS) {
    for (const expr of marker.expressions) {
      const i = segment.lastIndexOf(expr);
      if (i >= 0 && (!best || i > best.index)) best = { role: marker.role, index: i };
    }
  }
  return best?.role ?? fallback;
}

function extractMaterials(text: string): ParsedMaterial[] {
  const hits = findMaterialHits(text);
  const out: ParsedMaterial[] = [];
  let cursor = 0;
  let first = true;

  for (const hit of hits) {
    const segment = text.slice(cursor, hit.start);
    cursor = hit.end;
    const contextRole = roleFromContext(segment, first ? "principal" : "secondary");

    hit.entry.components.forEach((c, i) => {
      // Le composant de tête hérite du rôle contextuel; les composants
      // implicites d'une expression composée restent secondaires.
      const role: ParsedRole = i === 0 ? (first && contextRole !== "trace" ? "principal" : contextRole) : c.role;
      const label = i === 0 ? (DISPLAY_TERM[hit.text] ?? MATERIAL_LABELS[c.key]) : MATERIAL_LABELS[c.key];
      const existing = out.find((m) => m.type === c.key);
      if (existing) return;
      out.push({
        type: c.key,
        label,
        role,
        confidence: i === 0 ? hit.entry.confidence : Math.max(0.5, hit.entry.confidence - 0.1),
        matchedExpression: hit.text,
        sharePct: null,
      });
    });
    first = false;
  }

  // Pourcentages explicitement exprimés par l'utilisateur uniquement.
  const pct = [...text.matchAll(/(\d{1,3})\s*(?:%|pour cent)/g)];
  if (pct.length === 1 && out.length) out[0].sharePct = Number(pct[0][1]);

  if (out.length > 1 && !out.some((m) => m.role === "principal")) out[0].role = "principal";
  return out;
}

// ---------------- 1. Extraction : quantité, transport ----------------

function extractQuantity(text: string) {
  const approximate = APPROXIMATE_MARKERS.some((m) => text.includes(m));
  for (const entry of UNIT_VOCABULARY) {
    for (const expr of [...entry.expressions].sort((a, b) => b.length - a.length)) {
      const m = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${escape(expr).replace(/\s+/g, "\\s+")}(?![a-z])`));
      if (m) {
        return {
          value: Number(m[1].replace(",", ".")),
          unit: entry.unit as ParsedUnit,
          approximate,
          confidence: approximate ? 0.7 : 0.9,
        };
      }
    }
  }
  return { approximate, confidence: 0.2 } as { value?: number; unit?: ParsedUnit; approximate: boolean; confidence: number };
}

function extractVehicle(text: string): { vehicleType: VehicleType; vehicleLabel: string | null; confidence: number; precise: boolean } {
  const sorted = [...VEHICLE_VOCABULARY].sort(
    (a, b) => Math.max(...b.expressions.map((e) => e.length)) - Math.max(...a.expressions.map((e) => e.length)),
  );
  for (const entry of sorted) {
    for (const expr of [...entry.expressions].sort((a, b) => b.length - a.length)) {
      if (new RegExp(`(?:^|[^a-z0-9])${escape(expr).replace(/\s+/g, "\\s+")}(?![a-z])`).test(text)) {
        return {
          vehicleType: entry.vehicle,
          vehicleLabel: entry.precise ? entry.label : VEHICLE_LABELS[entry.vehicle],
          confidence: entry.precise ? 0.9 : 0.4,
          precise: entry.precise,
        };
      }
    }
  }
  return { vehicleType: "unknown", vehicleLabel: null, confidence: 0.2, precise: false };
}

// ---------------- 1. Extraction : granulométrie ----------------

function extractGranulometry(text: string): { value: ParsedGranulometry | undefined; vague: string | null } {
  const vague = VAGUE_SIZE_MARKERS.find((m) => text.includes(m)) ?? null;

  const range = text.match(/(\d+)\s*-\s*(\d+(?:\s+\d\/\d)?|\d\/\d)\s*(?:po\b|pouces?\b)?/);
  if (range) {
    const min = parseInches(range[1]);
    const max = parseInches(range[2]);
    if (min != null && max != null && max > 0) {
      return {
        value: {
          code: `${range[1]}-${range[2]}`.replace(/\s+/g, " "),
          minInches: min, maxInches: max, approximate: false,
          originalExpression: range[0].trim(), confidence: 0.9,
        },
        vague,
      };
    }
  }

  const under = text.match(/(?:moins de|en dessous de|sous|maximum|max|jusqu a)\s*(\d+(?:\s+\d\/\d)?|\d\/\d)\s*(?:po\b|pouces?\b)/);
  if (under) {
    const max = parseInches(under[1]);
    if (max != null) {
      return {
        value: { code: null, maxInches: max, approximate: false, originalExpression: under[0].trim(), confidence: 0.85 },
        vague,
      };
    }
  }

  const plain = text.match(/(\d+(?:\s+\d\/\d)?|\d\/\d)\s*(?:po\b|pouces?\b)/);
  if (plain) {
    const max = parseInches(plain[1]);
    if (max != null) {
      return {
        value: { code: null, maxInches: max, approximate: true, originalExpression: plain[0].trim(), confidence: 0.6 },
        vague,
      };
    }
  }

  return { value: undefined, vague };
}

// ---------------- 1. Extraction : lieu, déclarations ----------------

const LOCATION_RE = /(?:^|\s)(?:à|a|au|aux|dans|secteur(?: de)?|proche de|près de|pres de)\s+([A-ZÀ-Ü][\wÀ-ÿ'’-]+(?:[-\s][A-ZÀ-Ü][\wÀ-ÿ'’-]+)*)/;

function extractLocation(rawText: string) {
  const m = rawText.match(LOCATION_RE);
  if (!m) return undefined;
  return { raw: m[1].trim(), confidence: 0.6 };
}

const STOPWORDS = new Set([
  "j", "ai", "je", "de", "du", "des", "la", "le", "les", "un", "une", "avec", "et", "pis", "dans",
  "en", "dessous", "moins", "plus", "a", "au", "aux", "sur", "pour", "mon", "ma", "mes", "c", "est",
  "environ", "quelques", "peu", "melange", "melangee", "beaucoup", "pas", "mal", "voyages", "voyage",
  "tonnes", "tonne", "loads", "load", "pouces", "pouce", "po", "roues", "semi", "essieux", "camion",
  "camions", "sortir", "materiel", "materiaux", "chantier", "secteur", "qui", "que", "sont", "il",
  "y", "ca", "cest", "grosse", "grosses", "petite", "petites", "petits", "gros", "propre", "propres",
]);

function unknownWords(text: string, consumed: string[]): string[] {
  const used = new Set(consumed.flatMap((c) => c.split(/\s+/)));
  return [...new Set(
    text.split(/[\s,.]+/)
      .filter((w) => w.length > 2 && !/^\d/.test(w) && !STOPWORDS.has(w) && !used.has(w)),
  )].slice(0, 10);
}

// ---------------- 2→6. Assemblage ----------------

export function parseMaterialDescription(rawText: string): ParsedMaterialDescription {
  const text = normalize(rawText);
  const materials = extractMaterials(text);
  const quantity = extractQuantity(text);
  const vehicle = extractVehicle(text);
  const { value: granulometry, vague } = extractGranulometry(text);
  const location = extractLocation(rawText);

  const trips = text.match(/(\d+)\s*(?:voyages?|loads?|trips?)(?![a-z])/);
  const transport = {
    vehicleType: vehicle.vehicleType,
    vehicleLabel: vehicle.vehicleLabel,
    tripCount: trips ? Number(trips[1]) : undefined,
    confidence: vehicle.confidence,
  };

  const declarations: string[] = [];
  const statedClean = CLEAN_MARKERS.some((m) => new RegExp(`(?:^|[^a-z])${escape(m)}(?![a-z])`).test(text));
  const statedContaminated = CONTAMINATED_MARKERS.some(
    (m) => new RegExp(`(?:^|[^a-z])${escape(m)}(?![a-z])`).test(text),
  ) && !/non contamine|pas contamine/.test(text);
  if (statedClean) declarations.push("« Propre » : déclaration de l'utilisateur, non vérifiée, aucune certification environnementale.");
  if (statedContaminated) declarations.push("Contamination mentionnée par l'utilisateur : à faire caractériser.");

  const ambiguities: Ambiguity[] = [];
  const questions: ClarificationQuestion[] = [];

  // Grosseur évoquée vaguement : ne JAMAIS convertir « petites pierres » en pouces.
  const hasStony = materials.some((m) => m.type === "pierre" || m.type === "roche");
  if ((vague || hasStony) && !granulometry) {
    ambiguities.push({
      kind: "GRANULOMETRIE_IMPRECISE",
      field: "granulometry",
      message: "La grosseur des pierres n'est pas précisée; aucune valeur n'est supposée.",
      originalExpression: vague,
    });
    questions.push({
      id: "granulometry_max",
      field: "granulometry",
      text: "Quelle est environ la grosseur maximale des pierres ?",
      options: ["moins de 4 po", "4 à 12 po", "12 à 18 po", "plus de 18 po", "je ne sais pas"],
      priority: 90,
    });
  }

  // Proportion des composants secondaires : jamais inventée.
  const secondary = materials.filter((m) => m.role !== "principal" && m.sharePct == null);
  if (secondary.length) {
    ambiguities.push({
      kind: "PROPORTION_INCONNUE",
      field: "materials",
      message: `Proportion inconnue pour : ${secondary.map((m) => m.label).join(", ")}.`,
      originalExpression: null,
    });
    questions.push({
      id: "secondary_share",
      field: "materials",
      text: `Est-ce que ${secondary[0].label} représente seulement une petite proportion du chargement ?`,
      options: ["Oui", "Non", "Je ne sais pas"],
      priority: 70,
    });
  }

  if (!vehicle.precise && /semi|camion|voyage|load/.test(text)) {
    ambiguities.push({
      kind: "VEHICULE_IMPRECIS",
      field: "transport",
      message: "Le type exact de camion n'est pas confirmé.",
      originalExpression: null,
    });
    questions.push({
      id: "vehicle_type",
      field: "transport",
      text: "Quel type de camion est utilisé ?",
      options: ["10 roues", "12 roues", "semi 2 essieux", "semi 3 essieux", "je ne sais pas"],
      priority: 50,
    });
  }

  if (quantity.value == null) {
    ambiguities.push({
      kind: "QUANTITE_MANQUANTE", field: "quantity",
      message: "Aucune quantité exploitable dans la description.",
      originalExpression: null,
    });
    questions.push({
      id: "quantity", field: "quantity",
      text: "Environ combien de matériel avez-vous ?",
      options: ["en tonnes", "en voyages", "je ne sais pas"],
      priority: 60,
    });
  }

  if (!materials.length) {
    ambiguities.push({
      kind: "MATERIAU_INCONNU", field: "materials",
      message: "Aucun matériau reconnu dans la description.",
      originalExpression: null,
    });
    questions.push({
      id: "material", field: "materials",
      text: "De quel type de matériel s'agit-il principalement ?",
      options: ["terre", "sable", "pierre", "roche", "béton", "je ne sais pas"],
      priority: 100,
    });
  }

  if (statedClean && statedContaminated) {
    ambiguities.push({
      kind: "CONTRADICTION", field: "contamination",
      message: "Le texte dit à la fois « propre » et « contaminé » : à valider avec la personne.",
      originalExpression: null,
    });
  }
  if (granulometry?.minInches != null && granulometry.maxInches != null && granulometry.minInches > granulometry.maxInches) {
    ambiguities.push({
      kind: "CONTRADICTION", field: "granulometry",
      message: "Les dimensions lues se contredisent.",
      originalExpression: granulometry.originalExpression,
    });
  }

  const consumed = [
    ...materials.map((m) => m.matchedExpression),
    granulometry?.originalExpression ?? "",
    transport.vehicleLabel ? normalize(transport.vehicleLabel) : "",
  ].filter(Boolean);
  const unrecognized = unknownWords(text, consumed);
  if (unrecognized.length) {
    ambiguities.push({
      kind: "MOT_INCONNU", field: "rawText",
      message: `Mots non interprétés : ${unrecognized.join(", ")}.`,
      originalExpression: null,
    });
  }

  const parts = [
    materials.length ? Math.max(...materials.map((m) => m.confidence)) : 0.1,
    quantity.confidence,
    transport.confidence,
    granulometry?.confidence ?? 0.3,
  ];
  const confidence = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) / 100;

  return {
    version: MATERIAL_LANGUAGE_VERSION,
    rawText,
    normalizedText: text,
    quantity,
    transport,
    materials,
    granulometry,
    contamination: {
      statedClean: statedClean || undefined,
      statedContaminated: statedContaminated || undefined,
      unknown: !statedClean && !statedContaminated,
      declarations,
    },
    location,
    confidence,
    ambiguities,
    clarificationQuestions: questions.sort((a, b) => b.priority - a.priority),
    unrecognizedWords: unrecognized,
    engine: "dictionary+rules",
  };
}

// ---------------- PARTIE I — correction manuelle ----------------

export interface ManualCorrection {
  principalMaterial?: MaterialKey;
  removeMaterial?: MaterialKey;
  addMaterial?: { type: MaterialKey; role: ParsedRole };
  vehicleType?: VehicleType;
  tripCount?: number;
  quantity?: { value: number; unit: ParsedUnit };
  maxInches?: number | null;
}

/** Applique une correction humaine : le texte original reste intact. */
export function applyManualCorrection(
  parsed: ParsedMaterialDescription,
  correction: ManualCorrection,
): ParsedMaterialDescription {
  let materials = parsed.materials.map((m) => ({ ...m }));

  if (correction.removeMaterial) materials = materials.filter((m) => m.type !== correction.removeMaterial);
  if (correction.addMaterial && !materials.some((m) => m.type === correction.addMaterial!.type)) {
    materials.push({
      type: correction.addMaterial.type,
      label: MATERIAL_LABELS[correction.addMaterial.type],
      role: correction.addMaterial.role,
      confidence: 1,
      matchedExpression: "correction manuelle",
      sharePct: null,
    });
  }
  if (correction.principalMaterial) {
    materials = materials.map((m) => ({
      ...m,
      role: m.type === correction.principalMaterial ? "principal" : m.role === "principal" ? "secondary" : m.role,
      confidence: m.type === correction.principalMaterial ? 1 : m.confidence,
    }));
    if (!materials.some((m) => m.type === correction.principalMaterial)) {
      materials.unshift({
        type: correction.principalMaterial,
        label: MATERIAL_LABELS[correction.principalMaterial],
        role: "principal", confidence: 1, matchedExpression: "correction manuelle", sharePct: null,
      });
    }
  }

  const transport = correction.vehicleType || correction.tripCount != null
    ? {
        vehicleType: correction.vehicleType ?? parsed.transport?.vehicleType ?? "unknown",
        vehicleLabel: VEHICLE_LABELS[correction.vehicleType ?? parsed.transport?.vehicleType ?? "unknown"],
        tripCount: correction.tripCount ?? parsed.transport?.tripCount,
        confidence: 1,
      }
    : parsed.transport;

  const quantity = correction.quantity
    ? { value: correction.quantity.value, unit: correction.quantity.unit, approximate: false, confidence: 1 }
    : parsed.quantity;

  const granulometry =
    correction.maxInches === undefined
      ? parsed.granulometry
      : correction.maxInches === null
        ? undefined
        : {
            code: parsed.granulometry?.code ?? null,
            minInches: parsed.granulometry?.minInches,
            maxInches: correction.maxInches,
            approximate: false,
            originalExpression: "correction manuelle",
            confidence: 1,
          };

  const corrected: ParsedMaterialDescription = {
    ...parsed, materials, transport, quantity, granulometry,
  };
  // Les ambiguïtés/questions sont recalculées à partir de l'état corrigé.
  return refreshQuestions(corrected);
}

/** Recalcule ambiguïtés et questions sans retoucher au texte original. */
export function refreshQuestions(parsed: ParsedMaterialDescription): ParsedMaterialDescription {
  const ambiguities = parsed.ambiguities.filter((a) => {
    if (a.kind === "GRANULOMETRIE_IMPRECISE") return parsed.granulometry?.maxInches == null;
    if (a.kind === "QUANTITE_MANQUANTE") return parsed.quantity?.value == null;
    if (a.kind === "VEHICULE_IMPRECIS") return (parsed.transport?.vehicleType ?? "unknown") === "unknown" || (parsed.transport?.confidence ?? 0) < 0.9;
    if (a.kind === "MATERIAU_INCONNU") return parsed.materials.length === 0;
    if (a.kind === "PROPORTION_INCONNUE") return parsed.materials.some((m) => m.role !== "principal" && m.sharePct == null);
    return true;
  });
  const fields = new Set(ambiguities.map((a) => a.field));
  return {
    ...parsed,
    ambiguities,
    clarificationQuestions: parsed.clarificationQuestions.filter((q) => fields.has(q.field)),
  };
}

// ---------------- PARTIE J — passerelle vers le moteur de matching ----------------

const ROLE_TO_COMPOSITION: Record<ParsedRole, CompositionRole> = {
  principal: "PRINCIPAL", secondary: "SECONDAIRE", trace: "TRACE",
};

/** Convertit l'interprétation en chargement compréhensible par impact.ts. */
export function toLoadComposition(parsed: ParsedMaterialDescription, id = "interpretation"): LoadComposition {
  return {
    id,
    materials: parsed.materials.map((m) => ({
      materialKey: m.type,
      label: m.label,
      role: ROLE_TO_COMPOSITION[m.role],
      sharePct: m.sharePct,
      maxInches: parsed.granulometry?.maxInches ?? null,
    })),
    conditions: parsed.contamination.declarations,
    originalText: parsed.rawText,
  };
}

/** Contexte de match (quantité, lieu) issu de l'interprétation. */
export function toMatchContext(parsed: ParsedMaterialDescription) {
  const unitMap: Record<ParsedUnit, "tonnes" | "voyages" | "m3" | "verges3"> = {
    tonne: "tonnes", voyage: "voyages", m3: "m3", verge3: "verges3",
  };
  return {
    quantity: parsed.quantity?.value != null && parsed.quantity.unit
      ? { value: parsed.quantity.value, unit: unitMap[parsed.quantity.unit] }
      : null,
    label: parsed.location?.raw ?? null,
  };
}

export const vehicleConfigCode = (v: VehicleType) => VEHICLE_CONFIG_CODE[v];
