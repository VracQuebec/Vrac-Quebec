// Centralized material → color mapping shared by Admin map & Entrepreneur map.
// Keeps the legend, markers and clusters in sync everywhere.

export type MaterialColorKey =
  | "terre"
  | "sable"
  | "gravier"
  | "beton"
  | "asphalte"
  | "remblai"
  | "autre";

export const MATERIAL_COLORS: Record<MaterialColorKey, { color: string; label: string }> = {
  terre:    { color: "#8B4513", label: "Terre" },     // brun
  sable:    { color: "#eab308", label: "Sable" },     // jaune
  gravier:  { color: "#6b7280", label: "Gravier" },   // gris
  beton:    { color: "#2563eb", label: "Béton" },     // bleu
  asphalte: { color: "#0a0a0a", label: "Asphalte" },  // noir
  remblai:  { color: "#16a34a", label: "Remblai" },   // vert
  autre:    { color: "#f97316", label: "Autre" },     // orange (fallback)
};

export const MATERIAL_LEGEND: MaterialColorKey[] = [
  "terre",
  "sable",
  "gravier",
  "beton",
  "asphalte",
  "remblai",
];

export const colorForMaterials = (
  mats: string[] | null | undefined,
  requestType?: string | null,
): string => {
  const s = (mats || []).join("|").toLowerCase();
  const rt = (requestType || "").toLowerCase();
  if (rt.includes("remblai") || rt.includes("depot") || rt.includes("dépôt") || s.includes("remplissage"))
    return MATERIAL_COLORS.remblai.color;
  if (s.includes("béton") || s.includes("beton")) return MATERIAL_COLORS.beton.color;
  if (s.includes("asphalte")) return MATERIAL_COLORS.asphalte.color;
  if (s.includes("gravier") || s.includes("roche") || s.includes("pierre") || s.includes("concass"))
    return MATERIAL_COLORS.gravier.color;
  if (s.includes("sable")) return MATERIAL_COLORS.sable.color;
  if (s.includes("terre")) return MATERIAL_COLORS.terre.color;
  return MATERIAL_COLORS.autre.color;
};

// Map a single material id (from MATERIAL_TYPES or free text) to a color key.
export const materialKeyForId = (id: string): MaterialColorKey => {
  const v = (id || "").toLowerCase();
  if (v.includes("remplissage") || v.includes("remblai")) return "remblai";
  if (v.includes("béton") || v.includes("beton")) return "beton";
  if (v.includes("asphalte")) return "asphalte";
  if (v.includes("roche") || v.includes("gravier") || v.includes("pierre") || v.includes("concass")) return "gravier";
  if (v.includes("sable")) return "sable";
  if (v.includes("terre")) return "terre";
  return "autre";
};