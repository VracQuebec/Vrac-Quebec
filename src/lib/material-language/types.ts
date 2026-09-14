// ============================================================
// LOT 19 — INTERPRÉTEUR DE LANGAGE DE CHANTIER V1 (types)
// ------------------------------------------------------------
// Structure de sortie unique, réutilisable plus tard pour d'autres
// domaines (excavation, pavage, livraison…). Aucune écriture, aucune
// certification : une hypothèse ne devient JAMAIS une certitude.
// ============================================================
import type { MaterialKey } from "@/lib/matching/interpreter";

export const MATERIAL_LANGUAGE_VERSION = "material-language-v1";

export type ParsedUnit = "tonne" | "voyage" | "m3" | "verge3";

export type VehicleType =
  | "6_roues" | "10_roues" | "12_roues"
  | "semi_2_essieux" | "semi_3_essieux" | "semi_4_essieux"
  | "unknown";

/** Rôle d'un composant dans le chargement (jamais un pourcentage inventé). */
export type ParsedRole = "principal" | "secondary" | "trace";

export interface ParsedMaterial {
  type: MaterialKey;
  label: string;
  role: ParsedRole;
  /** 0 → 1. Confiance d'extraction, jamais une preuve. */
  confidence: number;
  matchedExpression: string;
  /** Uniquement si l'utilisateur l'a exprimé lui-même. */
  sharePct: number | null;
}

export interface ParsedQuantity {
  value?: number;
  unit?: ParsedUnit;
  approximate: boolean;
  confidence: number;
}

export interface ParsedTransport {
  vehicleType: VehicleType;
  vehicleLabel: string | null;
  tripCount?: number;
  confidence: number;
}

export interface ParsedGranulometry {
  code: string | null;
  minInches?: number;
  maxInches?: number;
  approximate: boolean;
  /** Expression du texte ayant produit la lecture. */
  originalExpression: string | null;
  confidence: number;
}

export interface ParsedContamination {
  /** Déclaration de l'utilisateur — JAMAIS une certification environnementale. */
  statedClean?: boolean;
  statedContaminated?: boolean;
  unknown: boolean;
  declarations: string[];
}

export interface ParsedLocation {
  raw?: string;
  confidence: number;
}

export type AmbiguityKind =
  | "GRANULOMETRIE_IMPRECISE"
  | "PROPORTION_INCONNUE"
  | "VEHICULE_IMPRECIS"
  | "QUANTITE_MANQUANTE"
  | "MATERIAU_INCONNU"
  | "CONTRADICTION"
  | "MOT_INCONNU";

export interface Ambiguity {
  kind: AmbiguityKind;
  field: string;
  message: string;
  originalExpression: string | null;
}

export interface ClarificationQuestion {
  id: string;
  field: string;
  text: string;
  options: string[];
  /** Renseigné par le moteur d'impact (LOT 18) quand il est utilisé. */
  matchImpact?: number;
  priority: number;
}

export interface ParsedMaterialDescription {
  version: string;
  /** Texte original strictement conservé. */
  rawText: string;
  normalizedText: string;
  quantity?: ParsedQuantity;
  transport?: ParsedTransport;
  materials: ParsedMaterial[];
  granulometry?: ParsedGranulometry;
  contamination: ParsedContamination;
  location?: ParsedLocation;
  /** Confiance globale 0 → 1. */
  confidence: number;
  ambiguities: Ambiguity[];
  clarificationQuestions: ClarificationQuestion[];
  unrecognizedWords: string[];
  /** Provenance du parsing : préparation d'une future couche IA. */
  engine: ParserEngine;
}

export type ParserEngine = "rules" | "dictionary+rules" | "llm+rules";

/**
 * Contrat d'un futur analyseur (LLM ou autre) : sa sortie DOIT
 * repasser par la normalisation, la validation et la confiance.
 * Le moteur déterministe reste l'autorité métier.
 */
export interface LanguageParserAdapter {
  name: string;
  engine: ParserEngine;
  parse(text: string): Partial<ParsedMaterialDescription>;
}
