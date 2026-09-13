// ============================================================
// SOURCE DE VÉRITÉ UNIQUE — DONNÉES DES PARCOURS REMBLAI
// ------------------------------------------------------------
// Clés internes stables (base de données, CRM, filtres, futur
// moteur de matching) séparées des libellés affichés.
// Aucune capacité de camion n'est codée ici : les capacités
// proviennent de l'administration (`jsc_trucks`).
// ============================================================

/* ---------------- Direction de la demande ---------------- */

export type ParcoursDirection = "reception" | "evacuation";

export const DIRECTION_LABELS: Record<ParcoursDirection, string> = {
  reception: "Recevoir du matériel de remplissage",
  evacuation: "Faire évacuer du remblai",
};

export const directionLabel = (v: string | null | undefined): string =>
  v === "reception" || v === "evacuation" ? DIRECTION_LABELS[v] : "Non renseigné";

/* ---------------- Quantité : valeur + unité ---------------- */

export type QuantityUnit = "tonnes" | "verges3" | "m3" | "voyages" | "inconnu";

export interface QuantityUnitDef {
  key: QuantityUnit;
  /** Libellé affiché dans les formulaires et le CRM. */
  label: string;
  /** Libellé court, utilisé à la suite d'un nombre. */
  short: string;
  selectable: boolean;
}

export const QUANTITY_UNITS: QuantityUnitDef[] = [
  { key: "voyages", label: "voyages de camion", short: "voyages", selectable: true },
  { key: "tonnes", label: "tonnes", short: "t", selectable: true },
  { key: "verges3", label: "verges³", short: "vg³", selectable: true },
  { key: "m3", label: "m³", short: "m³", selectable: true },
  { key: "inconnu", label: "Je ne sais pas", short: "", selectable: false },
];

export const SELECTABLE_QUANTITY_UNITS = QUANTITY_UNITS.filter((u) => u.selectable);

/** Accepte les clés actuelles, les anciennes clés et les libellés historiques. */
export function normalizeQuantityUnit(value: unknown): QuantityUnit {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "inconnu";
  if (raw.includes("voyage")) return "voyages";
  if (raw.includes("tonne") || raw === "t") return "tonnes";
  if (raw.includes("verge") || raw.startsWith("vg")) return "verges3";
  if (raw.includes("m3") || raw.includes("m³")) return "m3";
  return "inconnu";
}

export const quantityUnitLabel = (unit: string | null | undefined): string =>
  QUANTITY_UNITS.find((u) => u.key === normalizeQuantityUnit(unit))?.label ?? "Je ne sais pas";

/** Nombre saisi librement (« 3 », « 3,5 ») → numérique, sinon null. */
export function parseQuantityValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = typeof value === "string" ? value.replace(/\s/g, "").replace(",", ".") : "";
  const match = raw.match(/[0-9]+(\.[0-9]+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Compatibilité : relit une ancienne chaîne « 3 voyages de camion ». */
export function parseLegacyQuantity(label: string | null | undefined): {
  value: number | null;
  unit: QuantityUnit;
} {
  if (!label) return { value: null, unit: "inconnu" };
  return { value: parseQuantityValue(label), unit: normalizeQuantityUnit(label) };
}

/** Représentation lisible, toujours reconstruite à partir des champs normalisés. */
export function formatQuantity(
  value: number | string | null | undefined,
  unit: string | null | undefined,
): string {
  const n = parseQuantityValue(value);
  const u = normalizeQuantityUnit(unit);
  if (n == null || u === "inconnu") return "Je ne sais pas";
  const def = QUANTITY_UNITS.find((x) => x.key === u)!;
  return `${n} ${def.label}`;
}

/* ---------------- Critères d'accessibilité ---------------- */

export interface AccessCriterionDef {
  key: string;
  label: string;
}

/** Clés stables réutilisables par le futur moteur de matching. */
export const ACCESS_CRITERIA: AccessCriterionDef[] = [
  { key: "pente_prononcee", label: "Pente prononcée" },
  { key: "fils_electriques_bas", label: "Fils électriques bas" },
  { key: "branches_basses", label: "Branches d'arbres basses" },
  { key: "sol_mou", label: "Sol mou ou boueux" },
  { key: "recul_limite", label: "Espace de recul limité" },
  { key: "demi_tour_possible", label: "Demi-tour possible sur le terrain" },
  { key: "entree_asphaltee", label: "Entrée asphaltée ou pavée" },
  { key: "voisinage_rapproche", label: "Voisinage rapproché" },
];

const ACCESS_BY_LABEL = new Map(
  ACCESS_CRITERIA.map((c) => [c.label.toLowerCase(), c.key] as const),
);

/** Accepte une clé stable ou un libellé historique. */
export function normalizeAccessCriterion(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (ACCESS_CRITERIA.some((c) => c.key === raw)) return raw;
  return ACCESS_BY_LABEL.get(raw.toLowerCase()) ?? null;
}

export const accessCriterionLabel = (value: string): string =>
  ACCESS_CRITERIA.find((c) => c.key === normalizeAccessCriterion(value))?.label ?? value;

/** Réponse simple sur la possibilité d'accès d'un camion lourd. */
export const HEAVY_TRUCK_ACCESS = [
  { key: "oui", label: "Oui" },
  { key: "probablement", label: "Probablement" },
  { key: "inconnu", label: "Je ne sais pas" },
  { key: "non", label: "Accès difficile / non" },
];

export function normalizeHeavyTruckAccess(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return null;
  const direct = HEAVY_TRUCK_ACCESS.find((o) => o.key === raw || o.label.toLowerCase() === raw);
  if (direct) return direct.key;
  if (raw.startsWith("oui")) return "oui";
  if (raw.startsWith("probable")) return "probablement";
  if (raw.includes("difficile") || raw.startsWith("non")) return "non";
  return "inconnu";
}

export const heavyTruckAccessLabel = (value: string | null | undefined): string => {
  const key = normalizeHeavyTruckAccess(value);
  return HEAVY_TRUCK_ACCESS.find((o) => o.key === key)?.label ?? "Non renseigné";
};

/* ---------------- Photos ---------------- */

export type PhotoCategoryKey = "materiau" | "acces" | "chantier" | "autre";

export const PHOTO_CATEGORY_DEFS: { key: PhotoCategoryKey; label: string }[] = [
  { key: "materiau", label: "Matériau" },
  { key: "acces", label: "Accès" },
  { key: "chantier", label: "Chantier" },
  { key: "autre", label: "Autre" },
];

export function normalizePhotoCategory(value: unknown): PhotoCategoryKey {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "autre";
  if (PHOTO_CATEGORY_DEFS.some((c) => c.key === raw)) return raw as PhotoCategoryKey;
  if (raw.includes("matéri") || raw.includes("materi")) return "materiau";
  if (raw.includes("accès") || raw.includes("acces") || raw.includes("entrée") || raw.includes("chemin") || raw.includes("recul") || raw.includes("manœuvre")) return "acces";
  if (raw.includes("chantier") || raw.includes("déchargement") || raw.includes("dechargement") || raw.includes("terrain")) return "chantier";
  return "autre";
}

export const photoCategoryLabel = (value: unknown): string =>
  PHOTO_CATEGORY_DEFS.find((c) => c.key === normalizePhotoCategory(value))!.label;

export interface ParcoursPhoto {
  url: string;
  category: PhotoCategoryKey;
}

/**
 * Relit les photos quelle que soit la génération d'enregistrement :
 * `photos_meta`, `access_details.photos` (historique) ou `photos` (URLs seules).
 */
export function readPhotos(source: {
  photos_meta?: unknown;
  access_details?: unknown;
  photos?: unknown;
}): ParcoursPhoto[] {
  const out: ParcoursPhoto[] = [];
  const push = (url: unknown, category: unknown) => {
    if (typeof url !== "string" || !url) return;
    if (out.some((p) => p.url === url)) return;
    out.push({ url, category: normalizePhotoCategory(category) });
  };
  const meta = source.photos_meta;
  if (Array.isArray(meta)) {
    meta.forEach((p) => push((p as { url?: unknown })?.url, (p as { category?: unknown })?.category));
  }
  const legacy = (source.access_details as { photos?: unknown } | null)?.photos;
  if (Array.isArray(legacy)) {
    legacy.forEach((p) => push((p as { url?: unknown })?.url, (p as { category?: unknown })?.category));
  }
  if (Array.isArray(source.photos)) {
    source.photos.forEach((u) => push(u, "autre"));
  }
  return out;
}

/**
 * Relit les critères d'accès quelle que soit la génération :
 * colonne `access_criteria`, `access_details.criteres` ou clés booléennes.
 */
export function readAccessCriteria(source: {
  access_criteria?: unknown;
  access_details?: unknown;
}): string[] {
  const keys = new Set<string>();
  if (Array.isArray(source.access_criteria)) {
    source.access_criteria.forEach((v) => {
      const k = normalizeAccessCriterion(v);
      if (k) keys.add(k);
    });
  }
  const details = source.access_details as Record<string, unknown> | null;
  if (details && typeof details === "object") {
    if (Array.isArray(details.criteres)) {
      details.criteres.forEach((v) => {
        const k = normalizeAccessCriterion(v);
        if (k) keys.add(k);
      });
    }
    Object.entries(details).forEach(([k, v]) => {
      if (v === true) {
        const norm = normalizeAccessCriterion(k);
        if (norm) keys.add(norm);
      }
    });
  }
  return Array.from(keys);
}
