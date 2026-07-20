// Shared types + helpers for the DB-driven SEO Manager (single source of truth).

export interface SeoCity {
  id?: string;
  slug: string;
  name: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  intro: string | null;
  neighbors: string[];
  active: boolean;
  sort_order: number;
}

export interface SeoMaterial {
  id?: string;
  slug: string;
  name: string;
  short_name: string;
  keywords: string[];
  use_cases: string[];
  delivery_unit: string;
  related_materials: string[];
  description: string;
  active: boolean;
  sort_order: number;
}

export interface SeoMaterialUse {
  id?: string;
  slug: string;
  material_slug: string;
  name: string;
  description: string;
  active: boolean;
  sort_order: number;
}

/** Top-level slugs that must never be interpreted as a landing page slug. */
export const RESERVED_TOP_LEVEL_SLUGS = new Set([
  "", "index", "login", "forgot-password", "reset-password",
  "admin", "entrepreneur", "blog", "livraison",
  "sitemap.xml", "robots.txt", "favicon.ico",
  "not-found", "unsubscribe", "404",
]);

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

/**
 * Try to match a raw slug of the form `{material-slug}-{city-slug}` against
 * the provided material/city lists. Longest material slug wins because
 * material slugs can themselves contain dashes (e.g. `gravier-0-3-4`).
 */
export function matchMaterialCitySlug(
  raw: string,
  materials: Pick<SeoMaterial, "slug">[],
  cityMap: Record<string, SeoCity>,
): { materialSlug: string; citySlug: string } | null {
  if (!raw) return null;
  const slug = raw.toLowerCase();
  if (RESERVED_TOP_LEVEL_SLUGS.has(slug)) return null;
  const sorted = [...materials].sort((a, b) => b.slug.length - a.slug.length);
  for (const m of sorted) {
    const prefix = `${m.slug}-`;
    if (slug.startsWith(prefix)) {
      const citySlug = slug.slice(prefix.length);
      if (cityMap[citySlug]) return { materialSlug: m.slug, citySlug };
    }
  }
  return null;
}