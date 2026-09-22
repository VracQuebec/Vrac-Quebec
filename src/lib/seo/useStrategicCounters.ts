// Chargement LECTURE SEULE de toutes les pages SEO (pagination complète, jamais
// un échantillon de 1 000 lignes) pour alimenter les compteurs du Centre de pilotage.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeStrategicCounters, type CounterPage, type StrategicCounters } from "@/lib/seo/strategicCounters";

// Lots volontairement petits : le contenu HTML des pages est volumineux, un lot
// de 1 000 lignes dépasse le délai maximal d'exécution côté base (statement timeout).
export const SEO_PAGE_BATCH = 200;

// Colonnes uniques partagées par tous les écrans du Centre de pilotage :
// une seule lecture sert les compteurs ET le contrôle qualité.
export const SEO_PAGE_COLUMNS =
  "id,slug,status,city_slug,material_slug,service_slug,title,h1,meta_title,meta_description,content_html,word_count,internal_link_count,internal_links,qa_last_score,qa_last_checked_at,noindex,google_index_status,last_generated_at,proc_status,proc_error";

const CACHE_TTL_MS = 60_000;
let cache: { at: number; rows: unknown[] } | null = null;
let inFlight: Promise<unknown[]> | null = null;

async function readAll(columns: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += SEO_PAGE_BATCH) {
    let batch: unknown[] | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 3 && batch === null; attempt++) {
      const { data, error } = await supabase
        .from("seo_pages")
        .select(columns)
        .order("id", { ascending: true })
        .range(from, from + SEO_PAGE_BATCH - 1);
      if (error) {
        lastError = error.message;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      batch = (data ?? []) as unknown[];
    }
    if (batch === null) throw new Error(lastError || "Lecture des pages impossible");
    rows.push(...batch);
    if (batch.length < SEO_PAGE_BATCH) break;
  }
  return rows;
}

/**
 * Lecture paginée COMPLÈTE de `seo_pages` (jamais tronquée silencieusement).
 * Tri sur la clé primaire (index), nouvelle tentative par lot, et lecture
 * mutualisée : deux écrans ouverts en même temps ne lisent pas la base deux fois.
 */
export async function fetchSeoPagesPaged<T>(force = false): Promise<T[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows as T[];
  if (!force && inFlight) return (await inFlight) as T[];
  const run = readAll(SEO_PAGE_COLUMNS)
    .then((rows) => { cache = { at: Date.now(), rows }; return rows; })
    .finally(() => { if (inFlight === run) inFlight = null; });
  inFlight = run;
  return (await run) as T[];
}

export async function fetchAllSeoPages(force = false): Promise<CounterPage[]> {
  return fetchSeoPagesPaged<CounterPage>(force);
}

export function useStrategicCounters() {
  const [counters, setCounters] = useState<StrategicCounters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pages, blog] = await Promise.all([
        fetchAllSeoPages(),
        supabase.from("blog_posts").select("id", { count: "exact", head: true }).in("status", ["draft", "scheduled"]),
      ]);
      setCounters(computeStrategicCounters(pages, { blogToPublish: blog.count ?? 0 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { counters, loading, error, reload };
}
