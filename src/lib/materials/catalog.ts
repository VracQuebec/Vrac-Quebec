// Référentiel matériaux — couche de lecture unique (mode simple ET mode détaillé).
// Aucune bascule : cette couche ne remplace pas encore le matching de production.
import { supabase } from "@/integrations/supabase/client";

export type Stance = "accepted" | "refused" | "unknown";

export interface MaterialItem {
  id: string;
  slug: string;
  name_fr: string;
  short_name: string | null;
  family: string;
  subfamily: string | null;
  display_order: number;
  visible_simple: boolean;
  visible_detailed: boolean;
  requires_granulometry: boolean;
  requires_dimensions: boolean;
  requires_qualification: boolean;
  regulatory_level: string;
  destination_types: string[] | null;
}

export interface Granulometry {
  id: string;
  code: string;
  label_fr: string;
  display_order: number;
}

export interface AliasItem {
  alias_norm: string;
  material_id: string;
  granulometry_id: string | null;
}

/** Familles internes regroupées en cartes client (mode simple). */
export const FAMILY_CARDS: { key: string; label: string; emoji: string; families: string[] }[] = [
  { key: "terre", label: "Terre", emoji: "🌱", families: ["TERRE"] },
  { key: "sable", label: "Sable", emoji: "🏖", families: ["SABLE"] },
  { key: "granulats", label: "Pierre / gravier", emoji: "🪨", families: ["GRANULATS"] },
  { key: "roche", label: "Roche", emoji: "⛰", families: ["ROCHE"] },
  { key: "recycle", label: "Béton / asphalte", emoji: "♻", families: ["BETON_MACONNERIE", "ASPHALTE"] },
  { key: "vegetaux", label: "Végétaux / compost", emoji: "🌳", families: ["ORGANIQUE"] },
  { key: "paillis", label: "Paillis / produits forestiers", emoji: "🪵", families: ["PAILLIS"] },
  { key: "decoratif", label: "Pierres décoratives", emoji: "💎", families: ["DECORATIF"] },
  { key: "hiver", label: "Hiver (sel, abrasifs)", emoji: "❄", families: ["HIVER"] },
  { key: "speciaux", label: "Matériaux spéciaux", emoji: "🧱", families: ["SPECIAUX"] },
  { key: "inconnu", label: "Autre / Je ne sais pas", emoji: "❓", families: ["INCONNU"] },
];

export const familyCardOf = (family: string) =>
  FAMILY_CARDS.find((c) => c.families.includes(family)) ?? FAMILY_CARDS[FAMILY_CARDS.length - 1];

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();
}

export interface CatalogData {
  materials: MaterialItem[];
  granulometries: Granulometry[];
  aliases: AliasItem[];
}

export async function loadCatalog(): Promise<CatalogData> {
  const [mat, gran, ali] = await Promise.all([
    supabase.from("material_catalog").select(
      "id,slug,name_fr,short_name,family,subfamily,display_order,visible_simple,visible_detailed,requires_granulometry,requires_dimensions,requires_qualification,regulatory_level,destination_types",
    ).eq("is_active", true).order("display_order"),
    supabase.from("material_granulometries").select("id,code,label_fr,display_order").eq("is_active", true).order("display_order"),
    supabase.from("material_aliases").select("alias_norm,material_id,granulometry_id").eq("is_active", true),
  ]);
  if (mat.error) throw mat.error;
  return {
    materials: (mat.data ?? []) as MaterialItem[],
    granulometries: (gran.data ?? []) as Granulometry[],
    aliases: (ali.data ?? []) as AliasItem[],
  };
}

/**
 * Recherche tolérante (casse, accents, pluriels simples, fautes connues, alias).
 * Une suggestion n'est JAMAIS une déclaration de compatibilité.
 */
export function searchMaterials(data: CatalogData, query: string, limit = 12): MaterialItem[] {
  const q = normalizeText(query);
  if (!q) return [];
  const singular = q.replace(/s\b/g, "");
  const score = (m: MaterialItem): number => {
    const name = normalizeText(m.name_fr);
    if (name === q) return 100;
    if (name.startsWith(q)) return 80;
    if (name.includes(q) || name.includes(singular)) return 60;
    const viaAlias = data.aliases.some(
      (a) => a.material_id === m.id && (a.alias_norm === q || a.alias_norm.includes(q) || q.includes(a.alias_norm)),
    );
    if (viaAlias) return 50;
    if (normalizeText(m.short_name ?? "").includes(q)) return 30;
    return 0;
  };
  return data.materials
    .map((m) => ({ m, s: score(m) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.m.display_order - b.m.display_order)
    .slice(0, limit)
    .map((r) => r.m);
}

/** Sélection courante : matériau + calibre facultatif + position accepté/refusé/inconnu. */
export interface MaterialSelection {
  materialId: string;
  granulometryId?: string | null;
  stance: Stance;
  percentage?: number | null;
}
