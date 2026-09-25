// ============================================================
// Catalogue central partagé (material_catalog) côté parcours Vrac.
// Aucun prix, coût ni marge : uniquement « Prix disponible » / « Sur demande ».
// ============================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CatalogVariant = {
  granulometry_id: string | null;
  label: string | null;
  jsc_material_id: string;
  jsc_name: string;
  price_available: boolean;
};

export type CatalogItem = {
  material_id: string;
  slug: string;
  name: string;
  family: string;
  family_label: string;
  requires_granulometry: boolean;
  search_terms: string[];
  variants: CatalogVariant[];
  price_status: "prix_disponible" | "sur_demande";
};

export type Granulometry = { id: string; code: string; label: string };

/** Normalise : casse, accents, fractions usuelles (¾ → 3/4, « 3 4 » → 3/4). */
export function normalizeSearch(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/¼/g, "1/4").replace(/½/g, "1/2").replace(/¾/g, "3/4")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`"]/g, " ")
    .replace(/(\d)\s*[-–]\s*(\d)/g, "$1-$2")
    .replace(/(\d)\s+(\d)(?!\d)/g, "$1/$2")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** Recherche par nom, famille et synonymes. Tous les mots doivent correspondre. */
export function searchCatalog(items: CatalogItem[], query: string): CatalogItem[] {
  const q = normalizeSearch(query);
  if (!q) return items;
  const words = q.split(" ").filter(Boolean);
  return items.filter((it) => {
    const hay = normalizeSearch([it.name, it.family_label, ...(it.search_terms ?? []), ...it.variants.map((v) => v.label ?? "")].join(" | "));
    return words.every((w) => hay.includes(w));
  });
}

export function groupByFamily(items: CatalogItem[]): [string, CatalogItem[]][] {
  const map = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const k = it.family_label || it.family;
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()];
}

export function useSharedCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [granulometries, setGranulometries] = useState<Granulometry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.rpc("vrac_public_catalog" as never),
      supabase.rpc("vrac_public_granulometries" as never),
    ]).then(([c, g]) => {
      if (!alive) return;
      if (c.error) setError(c.error.message);
      setItems(((c.data ?? []) as unknown) as CatalogItem[]);
      setGranulometries(((g.data ?? []) as unknown) as Granulometry[]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);
  return { items, granulometries, loading, error };
}
