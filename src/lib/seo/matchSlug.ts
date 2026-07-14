import { CITY_MAP, RESERVED_TOP_LEVEL_SLUGS, type City } from "./cities";
import { MATERIAL_MAP, MATERIALS, type Material } from "./materials";

export interface LocalMatch {
  material: Material;
  city: City;
}

/**
 * Match a slug of the form `{material-slug}-{city-slug}` to a whitelisted
 * (material, city) pair. Because material slugs contain dashes
 * (e.g. `gravier-0-3-4`), we try the longest possible material slug first.
 *
 * Returns null if the slug is reserved or does not match a whitelisted combo.
 */
export function matchLocalSlug(raw: string): LocalMatch | null {
  if (!raw) return null;
  const slug = raw.toLowerCase();
  if (RESERVED_TOP_LEVEL_SLUGS.has(slug)) return null;

  // Try each material (sorted by length desc so the longest match wins).
  const materials = [...MATERIALS].sort((a, b) => b.slug.length - a.slug.length);
  for (const m of materials) {
    const prefix = `${m.slug}-`;
    if (slug.startsWith(prefix)) {
      const citySlug = slug.slice(prefix.length);
      const city = CITY_MAP[citySlug];
      if (city) return { material: m, city };
    }
  }
  return null;
}

export function localSlugFor(materialSlug: string, citySlug: string): string {
  return `${materialSlug}-${citySlug}`;
}

export function isValidLocalCombo(materialSlug: string, citySlug: string): boolean {
  return !!MATERIAL_MAP[materialSlug] && !!CITY_MAP[citySlug];
}