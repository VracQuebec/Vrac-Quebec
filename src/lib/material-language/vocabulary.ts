// ============================================================
// LOT 19 — VOCABULAIRE DE CHANTIER QUÉBÉCOIS (structure extensible)
// ------------------------------------------------------------
// Aucune logique dispersée : tout le vocabulaire vit dans des tables
// déclaratives, complétables plus tard par l'administration.
// ============================================================
import type { MaterialKey } from "@/lib/matching/interpreter";
import type { ParsedRole, ParsedUnit, VehicleType } from "./types";

/** Normalisation commune (minuscules, sans accents, ponctuation réduite). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9.,/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------- Véhicules ----------------

export interface VehicleEntry {
  expressions: string[];
  vehicle: VehicleType;
  label: string;
  /** Faux quand le nombre d'essieux reste à confirmer. */
  precise: boolean;
}

export const VEHICLE_VOCABULARY: VehicleEntry[] = [
  { expressions: ["semi 4 essieux", "semi remorque 4 essieux", "semi dompeur 4 essieux", "quad essieux"], vehicle: "semi_4_essieux", label: "Semi 4 essieux", precise: true },
  { expressions: ["semi 3 essieux", "semi remorque 3 essieux", "semi dompeur 3 essieux", "tri essieux", "tri axle", "tri-essieux"], vehicle: "semi_3_essieux", label: "Semi 3 essieux", precise: true },
  { expressions: ["semi 2 essieux", "semi remorque 2 essieux", "semi dompeur 2 essieux", "2 essieux"], vehicle: "semi_2_essieux", label: "Semi 2 essieux", precise: true },
  { expressions: ["12 roues", "12 wheel", "douze roues"], vehicle: "12_roues", label: "Camion 12 roues", precise: true },
  { expressions: ["10 roues", "10 wheel", "dix roues"], vehicle: "10_roues", label: "Camion 10 roues", precise: true },
  { expressions: ["6 roues", "6 wheel", "six roues", "petit camion"], vehicle: "6_roues", label: "Camion 6 roues", precise: true },
  { expressions: ["semi dompeur", "semi remorque", "semi", "trailer"], vehicle: "semi_3_essieux", label: "Semi (nombre d'essieux à confirmer)", precise: false },
];

/** Codes de configuration utilisés par le reste de la plateforme. */
export const VEHICLE_CONFIG_CODE: Record<VehicleType, string | null> = {
  "6_roues": "porteur_6_roues",
  "10_roues": "porteur_10_roues",
  "12_roues": "porteur_12_roues",
  semi_2_essieux: "semi_2_essieux",
  semi_3_essieux: "semi_3_essieux",
  semi_4_essieux: "semi_4_essieux",
  unknown: null,
};

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  "6_roues": "Camion 6 roues",
  "10_roues": "Camion 10 roues",
  "12_roues": "Camion 12 roues",
  semi_2_essieux: "Semi 2 essieux",
  semi_3_essieux: "Semi 3 essieux",
  semi_4_essieux: "Semi 4 essieux",
  unknown: "Type de camion à confirmer",
};

// ---------------- Matériaux (expressions composées d'abord) ----------------

export interface MaterialEntry {
  expression: string;
  /** Composants produits, dans l'ordre : le premier est le composant principal. */
  components: { key: MaterialKey; role: ParsedRole }[];
  confidence: number;
}

export const MATERIAL_VOCABULARY: MaterialEntry[] = [
  // Expressions composées : « sable terreux » = du sable QUI CONTIENT de la terre.
  { expression: "sable terreux", components: [{ key: "sable", role: "principal" }, { key: "terre", role: "secondary" }], confidence: 0.9 },
  { expression: "sable terreu", components: [{ key: "sable", role: "principal" }, { key: "terre", role: "secondary" }], confidence: 0.8 },
  { expression: "terre sablonneuse", components: [{ key: "terre", role: "principal" }, { key: "sable", role: "secondary" }], confidence: 0.9 },
  { expression: "terre sableuse", components: [{ key: "terre", role: "principal" }, { key: "sable", role: "secondary" }], confidence: 0.9 },
  { expression: "terre argileuse", components: [{ key: "terre", role: "principal" }, { key: "argile", role: "secondary" }], confidence: 0.9 },
  { expression: "terre glaiseuse", components: [{ key: "terre", role: "principal" }, { key: "argile", role: "secondary" }], confidence: 0.9 },
  { expression: "terre vegetale", components: [{ key: "terre", role: "principal" }, { key: "organique", role: "secondary" }], confidence: 0.85 },
  { expression: "top soil", components: [{ key: "terre", role: "principal" }, { key: "organique", role: "secondary" }], confidence: 0.8 },
  { expression: "terre noire", components: [{ key: "terre", role: "principal" }, { key: "organique", role: "secondary" }], confidence: 0.85 },
  { expression: "terre d excavation", components: [{ key: "terre_excavation", role: "principal" }], confidence: 0.9 },
  { expression: "terre de remplissage", components: [{ key: "terre", role: "principal" }], confidence: 0.85 },
  { expression: "beton concasse", components: [{ key: "beton", role: "principal" }], confidence: 0.9 },
  { expression: "beton casse", components: [{ key: "beton", role: "principal" }], confidence: 0.9 },
  { expression: "pierre concassee", components: [{ key: "pierre", role: "principal" }], confidence: 0.9 },

  // Termes simples.
  { expression: "terre", components: [{ key: "terre", role: "principal" }], confidence: 0.9 },
  { expression: "sable", components: [{ key: "sable", role: "principal" }], confidence: 0.9 },
  { expression: "glaise", components: [{ key: "argile", role: "principal" }], confidence: 0.9 },
  { expression: "glaize", components: [{ key: "argile", role: "principal" }], confidence: 0.7 },
  { expression: "argile", components: [{ key: "argile", role: "principal" }], confidence: 0.9 },
  { expression: "pierre", components: [{ key: "pierre", role: "principal" }], confidence: 0.9 },
  { expression: "pierres", components: [{ key: "pierre", role: "principal" }], confidence: 0.9 },
  { expression: "caillou", components: [{ key: "pierre", role: "principal" }], confidence: 0.85 },
  { expression: "cailloux", components: [{ key: "pierre", role: "principal" }], confidence: 0.85 },
  { expression: "gravier", components: [{ key: "pierre", role: "principal" }], confidence: 0.85 },
  { expression: "roche", components: [{ key: "roche", role: "principal" }], confidence: 0.9 },
  { expression: "roches", components: [{ key: "roche", role: "principal" }], confidence: 0.9 },
  { expression: "roc", components: [{ key: "roche", role: "principal" }], confidence: 0.85 },
  { expression: "tuff", components: [{ key: "roche", role: "principal" }], confidence: 0.75 },
  { expression: "tuf", components: [{ key: "roche", role: "principal" }], confidence: 0.75 },
  { expression: "beton", components: [{ key: "beton", role: "principal" }], confidence: 0.9 },
  { expression: "asphalte", components: [{ key: "asphalte", role: "principal" }], confidence: 0.9 },
  { expression: "planage", components: [{ key: "asphalte", role: "principal" }], confidence: 0.8 },
  { expression: "souche", components: [{ key: "organique", role: "principal" }], confidence: 0.85 },
  { expression: "branches", components: [{ key: "organique", role: "principal" }], confidence: 0.85 },
];

/** Étiquette affichée pour un terme du texte (ex. « tuff » reste « tuff »). */
export const DISPLAY_TERM: Record<string, string> = {
  tuff: "Tuff", tuf: "Tuff", glaise: "Glaise", glaize: "Glaise",
};

// ---------------- Marqueurs de proportion ----------------

export interface ProportionMarker { expressions: string[]; role: ParsedRole }

export const PROPORTION_MARKERS: ProportionMarker[] = [
  { expressions: ["un peu de", "une trace de", "quelques", "une couple de", "un brin de", "legerement"], role: "trace" },
  { expressions: ["melange avec", "melangee avec", "melange a", "avec du", "avec de la", "avec des", "avec"], role: "secondary" },
  { expressions: ["beaucoup de", "pas mal de", "plein de", "majoritairement", "surtout"], role: "principal" },
];

// ---------------- Quantités ----------------

export interface UnitEntry { expressions: string[]; unit: ParsedUnit }

export const UNIT_VOCABULARY: UnitEntry[] = [
  { expressions: ["tonnes", "tonne", "tm", "tonnes metriques"], unit: "tonne" },
  { expressions: ["voyages", "voyage", "loads", "load", "trips"], unit: "voyage" },
  { expressions: ["verges cubes", "verges", "verge", "vg3", "yd3"], unit: "verge3" },
  { expressions: ["metres cubes", "m3", "metre cube"], unit: "m3" },
];

export const APPROXIMATE_MARKERS = [
  "environ", "a peu pres", "apeu pres", "autour de", "env", "~", "peut etre", "grosso modo", "plus ou moins",
];

// ---------------- Déclarations (jamais des certifications) ----------------

export const CLEAN_MARKERS = ["propre", "propres", "clean", "non contamine", "pas contamine"];
export const CONTAMINATED_MARKERS = ["contamine", "contaminee", "contamination", "ab", "bc", "criteres b c"];

// ---------------- Granulométrie ----------------

export const VAGUE_SIZE_MARKERS = [
  "petite roche", "petites roches", "petites pierres", "petite pierre", "petits cailloux",
  "grosse roche", "grosses roches", "grosses pierres", "gros cailloux",
];
