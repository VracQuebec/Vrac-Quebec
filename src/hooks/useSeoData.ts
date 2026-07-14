import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CITIES as STATIC_CITIES, RESERVED_TOP_LEVEL_SLUGS, type City } from "@/lib/seo/cities";
import { MATERIALS as STATIC_MATERIALS, type Material } from "@/lib/seo/materials";

export interface MaterialUse {
  id: string;
  slug: string;
  material_slug: string;
  name: string;
  description: string;
  active: boolean;
  sort_order: number;
}

let _cache: {
  cities: City[];
  materials: Material[];
  uses: MaterialUse[];
  ready: boolean;
} = {
  cities: STATIC_CITIES,
  materials: STATIC_MATERIALS,
  uses: [],
  ready: false,
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function mapCityRow(r: any): City {
  return {
    slug: r.slug,
    name: r.name,
    region: r.region ?? "",
    lat: r.latitude ?? 0,
    lng: r.longitude ?? 0,
    population: r.population ?? undefined,
    intro: r.intro ?? undefined,
    neighbors: Array.isArray(r.neighbors) ? r.neighbors : [],
  };
}

function mapMaterialRow(r: any): Material {
  return {
    slug: r.slug,
    name: r.name,
    shortName: r.short_name || r.name,
    keywords: r.keywords ?? [],
    useCases: r.use_cases ?? [],
    pricingHint: r.pricing_hint ?? "",
    deliveryUnit: (r.delivery_unit as "verge cube" | "tonne") ?? "verge cube",
    relatedMaterials: r.related_materials ?? [],
    description: r.description ?? "",
  };
}

export async function loadSeoData(): Promise<void> {
  const [citiesRes, materialsRes, usesRes] = await Promise.all([
    supabase.from("seo_cities").select("*").eq("active", true).order("sort_order"),
    supabase.from("seo_materials").select("*").eq("active", true).order("sort_order"),
    supabase.from("seo_material_uses").select("*").eq("active", true).order("sort_order"),
  ]);
  if (citiesRes.data?.length) _cache.cities = citiesRes.data.map(mapCityRow);
  if (materialsRes.data?.length) _cache.materials = materialsRes.data.map(mapMaterialRow);
  _cache.uses = (usesRes.data ?? []) as MaterialUse[];
  _cache.ready = true;
  notify();
}

// Kick off initial load (once per app session)
let _loadPromise: Promise<void> | null = null;
function ensureLoaded() {
  if (!_loadPromise) _loadPromise = loadSeoData().catch((e) => { console.warn("useSeoData: load failed", e); });
  return _loadPromise;
}

export function useSeoData() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    ensureLoaded();
    return () => { listeners.delete(l); };
  }, []);

  return useMemo(() => {
    const cityMap: Record<string, City> = Object.fromEntries(_cache.cities.map((c) => [c.slug, c]));
    const materialMap: Record<string, Material> = Object.fromEntries(_cache.materials.map((m) => [m.slug, m]));
    return {
      cities: _cache.cities,
      materials: _cache.materials,
      uses: _cache.uses,
      cityMap,
      materialMap,
      ready: _cache.ready,
      resolveLocalSlug: (raw: string) => resolveLocalSlug(raw, _cache.materials, cityMap),
    };
  }, [_cache.ready, _cache.cities, _cache.materials, _cache.uses]);
}

export function resolveLocalSlug(
  raw: string,
  materials: Material[],
  cityMap: Record<string, City>
): { material: Material; city: City } | null {
  if (!raw) return null;
  const slug = raw.toLowerCase();
  if (RESERVED_TOP_LEVEL_SLUGS.has(slug)) return null;
  const sorted = [...materials].sort((a, b) => b.slug.length - a.slug.length);
  for (const m of sorted) {
    const prefix = `${m.slug}-`;
    if (slug.startsWith(prefix)) {
      const citySlug = slug.slice(prefix.length);
      const city = cityMap[citySlug];
      if (city) return { material: m, city };
    }
  }
  return null;
}

/** Force re-fetch after admin edits so all consumers refresh. */
export function refreshSeoData() {
  _loadPromise = null;
  return ensureLoaded();
}