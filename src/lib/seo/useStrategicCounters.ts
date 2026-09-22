// Chargement LECTURE SEULE de toutes les pages SEO (pagination complète, jamais
// un échantillon de 1 000 lignes) pour alimenter les compteurs du Centre de pilotage.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeStrategicCounters, type CounterPage, type StrategicCounters } from "@/lib/seo/strategicCounters";

const PAGE_SIZE = 1000;

const COLUMNS =
  "id,slug,status,city_slug,material_slug,service_slug,title,h1,meta_title,meta_description,content_html,word_count,internal_link_count,internal_links,qa_last_score,noindex,google_index_status,last_generated_at,proc_status,proc_error";

export async function fetchAllSeoPages(): Promise<CounterPage[]> {
  const rows: CounterPage[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("seo_pages")
      .select(COLUMNS)
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as CounterPage[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
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
