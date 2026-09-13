// ============================================================
// Pont entre l'interpréteur de langage de chantier (lib/nlu/chantier)
// et le parcours utilisateur existant (ParcoursForm).
//
// Règle centrale : les DEUX chemins (cartes cliquées OU texte libre)
// produisent la MÊME structure interne (`AssistantSelection`), dont la
// liste `materials` utilise exactement les libellés déjà en production
// (REMBLAI_MATERIAL_CATEGORIES). Aucun second système.
//
// Rien ici n'écrit en base, n'active le matching V2, ni ne classe
// automatiquement l'environnement.
// ============================================================
import {
  interpretChantier,
  friendlySummary,
  type ChantierInterpretation,
  type Direction,
  type FriendlySummary,
} from "@/lib/nlu/chantier";
import type { MaterialKey } from "@/lib/matching/interpreter";

export type AcceptanceState = "ACCEPTE" | "REFUSE" | "INCONNU";

/** Correspondance vers les libellés déjà utilisés par le formulaire public. */
const LABEL_BY_KEY: Record<MaterialKey, string> = {
  terre: "Terre",
  terre_excavation: "Terre mélangée",
  argile: "Terre mélangée",
  sable: "Sable",
  pierre: "Gravier",
  roche: "Roches",
  beton: "Béton",
  asphalte: "Asphalte",
  organique: "Souches",
  materiel_inconnu: "Je ne suis pas certain",
};

/** Précision de la pierre lorsque l'utilisateur a nommé une granulométrie connue. */
const STONE_BY_GRAN: Record<string, string> = {
  "0-3/4": "Pierre concassée 0-3/4",
  "3/4 net": "Pierre concassée 3/4 net",
  poussiere: "Poussière de pierre",
};

export interface AssistantMaterialLine {
  /** Libellé du formulaire existant. */
  label: string;
  /** Phrase simple affichée au client (« un peu de », « surtout »...). */
  display: string;
  state: AcceptanceState;
}

export interface AssistantSelection {
  /** Libellés compatibles avec `Draft.materials` du formulaire actuel. */
  materials: string[];
  lines: AssistantMaterialLine[];
  refused: string[];
  quantityText: string | null;
  granulometry: string[];
  conditions: string[];
  truck: string | null;
  needsHelp: boolean;
  summary: FriendlySummary;
  interpretation: ChantierInterpretation;
}

const ROLE_TEXT: Record<string, string> = {
  PRINCIPAL: "Principal",
  SECONDAIRE: "",
  TRACE: "Petite quantité",
  INCONNU: "",
};

function stoneLabel(i: ChantierInterpretation): string {
  const code = i.granulometries.find((g) => g.code && STONE_BY_GRAN[g.code])?.code;
  return code ? STONE_BY_GRAN[code] : LABEL_BY_KEY.pierre;
}

/** Texte libre → structure identique à celle des cartes du formulaire. */
export function interpretForParcours(
  text: string,
  direction: Direction,
): AssistantSelection {
  const interpretation = interpretChantier(text, { direction });
  const summary = friendlySummary(interpretation);

  const lines: AssistantMaterialLine[] = [];
  const seen = new Set<string>();
  for (const m of interpretation.materials) {
    const label = m.key === "pierre" ? stoneLabel(interpretation) : LABEL_BY_KEY[m.key];
    if (seen.has(label)) continue;
    seen.add(label);
    lines.push({
      label,
      display: ROLE_TEXT[m.role] || "",
      state: m.key === "materiel_inconnu" ? "INCONNU" : "ACCEPTE",
    });
  }

  const refused: string[] = [];
  for (const r of interpretation.restrictions) {
    if (r.kind === "MATERIAU" && r.materialKey) {
      const label = LABEL_BY_KEY[r.materialKey];
      if (!refused.includes(label)) refused.push(label);
      const idx = lines.findIndex((l) => l.label === label);
      if (idx >= 0) lines[idx] = { ...lines[idx], state: "REFUSE" };
    }
  }

  return {
    materials: lines.filter((l) => l.state === "ACCEPTE").map((l) => l.label),
    lines,
    refused,
    quantityText: summary.quantity,
    granulometry: summary.granulometry,
    conditions: summary.conditions,
    truck: summary.truck,
    // « Peu importe » / « je ne sais pas » ne devient jamais une acceptation.
    needsHelp:
      interpretation.needsHumanHelp ||
      lines.length === 0 ||
      lines.every((l) => l.state !== "ACCEPTE"),
    summary,
    interpretation,
  };
}

/** Chemin manuel (cartes) → même structure. */
export function selectionFromManual(labels: string[]): Pick<
  AssistantSelection,
  "materials" | "lines" | "refused"
> {
  return {
    materials: labels.filter((l) => l !== "Je ne suis pas certain"),
    lines: labels.map((label) => ({
      label,
      display: "",
      state: (label === "Je ne suis pas certain" ? "INCONNU" : "ACCEPTE") as AcceptanceState,
    })),
    refused: [],
  };
}

/** Raccourci « je peux recevoir plusieurs types » (demande de remblai). */
export const RECEPTION_FAMILIES: { label: string; materials: string[] }[] = [
  { label: "Terre", materials: ["Terre"] },
  { label: "Terre mélangée", materials: ["Terre mélangée"] },
  { label: "Sable", materials: ["Sable"] },
  { label: "Pierre / gravier", materials: ["Gravier"] },
  { label: "Roche", materials: ["Roches"] },
  { label: "Béton / matériaux recyclables", materials: ["Béton", "Asphalte"] },
  { label: "Matières végétales", materials: ["Souches"] },
  { label: "Autre", materials: ["Autre"] },
];

/** Grandes familles simples pour le mode particulier (jamais 45 choix). */
export const SIMPLE_FAMILIES: { label: string; materials: string[] }[] = [
  { label: "Terre", materials: ["Terre"] },
  { label: "Terre mélangée", materials: ["Terre mélangée"] },
  { label: "Sable", materials: ["Sable"] },
  { label: "Pierre / gravier", materials: ["Gravier"] },
  { label: "Roche", materials: ["Roches"] },
  { label: "Béton / asphalte", materials: ["Béton"] },
  { label: "Je ne suis pas certain", materials: ["Je ne suis pas certain"] },
];

/** Restrictions proposées — ce sont des CONDITIONS, jamais des matériaux. */
export const RESTRICTION_OPTIONS = [
  "Glaise",
  "Souches / racines",
  "Béton",
  "Asphalte",
  "Matériaux mouillés",
  "Grosses roches",
  "Matériaux contaminés ou suspects",
  "Autre",
] as const;

export type EnvironmentAnswer = "oui" | "non" | "je ne sais pas" | "";

/** Résumé lisible ajouté aux précisions — aucune donnée technique. */
export function assistantNotes(input: {
  description: string;
  materials: string[];
  refused: string[];
  environment: EnvironmentAnswer;
  environmentDetails?: string;
}): string {
  const parts: string[] = [];
  if (input.description.trim()) parts.push(`Description du client : « ${input.description.trim()} »`);
  if (input.materials.length) parts.push(`Matériaux retenus : ${input.materials.join(", ")}`);
  if (input.refused.length) parts.push(`N'accepte pas : ${input.refused.join(", ")}`);
  if (input.environment) parts.push(`Sol caractérisé : ${input.environment}`);
  if (input.environmentDetails?.trim()) parts.push(`Info environnement : ${input.environmentDetails.trim()}`);
  return parts.join("\n");
}
