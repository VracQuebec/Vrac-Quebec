CREATE OR REPLACE FUNCTION public.seo_optimization_counts()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (g.page_id)
           g.page_id, g.clicks AS m_clicks, g.impressions AS m_impressions,
           g.position AS m_position, g.ctr AS m_ctr
      FROM public.seo_gsc_metrics g
     WHERE g.period = '28d'
     ORDER BY g.page_id, g.fetched_at DESC
  ),
  base AS (
    SELECT p.id,
      (COALESCE(l.m_impressions,0) >= 100 AND COALESCE(l.m_clicks,0) = 0) AS need_meta,
      (l.m_position BETWEEN 8 AND 20) AS boost,
      (p.indexed_at IS NULL AND p.published_at < now() - INTERVAL '14 days') AS not_indexed,
      (COALESCE(p.word_count,0) < 600) AS thin,
      (COALESCE(p.internal_link_count,0) < 3) AS weak_links,
      (p.meta_title IS NULL OR p.meta_description IS NULL
        OR length(p.meta_description) < 120 OR length(p.meta_description) > 175
        OR length(p.meta_title) < 30 OR length(p.meta_title) > 65) AS bad_meta,
      (COALESCE(l.m_impressions,0) = 0) AS zero_impr
    FROM public.seo_pages p
    LEFT JOIN latest l ON l.page_id = p.id
    WHERE p.status = 'published'
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'to_optimize', COUNT(*) FILTER (WHERE need_meta OR boost OR not_indexed OR thin OR weak_links OR bad_meta),
    'need_meta_rewrite', COUNT(*) FILTER (WHERE need_meta),
    'boost', COUNT(*) FILTER (WHERE boost),
    'not_indexed_14d', COUNT(*) FILTER (WHERE not_indexed),
    'thin_content', COUNT(*) FILTER (WHERE thin),
    'weak_internal_links', COUNT(*) FILTER (WHERE weak_links),
    'bad_meta', COUNT(*) FILTER (WHERE bad_meta),
    'zero_impressions', COUNT(*) FILTER (WHERE zero_impr)
  ) FROM base;
$$;

CREATE OR REPLACE FUNCTION public.seo_optimization_candidates(
  _scope text DEFAULT 'to_optimize', _limit int DEFAULT 200, _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, slug text, title text, meta_title text, meta_description text,
  google_index_status text, indexed_at timestamptz, published_at timestamptz,
  impressions int, clicks int, ctr numeric, avg_position numeric,
  primary_keyword text, top_queries jsonb,
  word_count int, internal_link_count int, seo_score int, qa_last_score int,
  backlinks_count int, intelligence_flags text[],
  reasons text[], priority_level text, priority_score int,
  last_improved_at timestamptz, improvements_applied int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (g.page_id)
           g.page_id, g.clicks AS m_clicks, g.impressions AS m_impressions,
           g.position AS m_position, g.ctr AS m_ctr, g.top_queries AS m_top_queries
      FROM public.seo_gsc_metrics g
     WHERE g.period = '28d'
     ORDER BY g.page_id, g.fetched_at DESC
  ),
  imp AS (
    SELECT i.page_id, MAX(i.applied_at) AS last_applied, COUNT(*) FILTER (WHERE i.applied) AS n_applied
      FROM public.seo_page_improvements i GROUP BY i.page_id
  ),
  base AS (
    SELECT p.*, l.m_clicks, l.m_impressions, l.m_position, l.m_ctr, l.m_top_queries,
           im.last_applied, COALESCE(im.n_applied,0)::int AS n_applied,
           (COALESCE(l.m_impressions,0) >= 100 AND COALESCE(l.m_clicks,0) = 0) AS r_meta,
           (l.m_position BETWEEN 8 AND 20) AS r_boost,
           (p.indexed_at IS NULL AND p.published_at < now() - INTERVAL '14 days') AS r_notidx,
           (COALESCE(p.word_count,0) < 600) AS r_thin,
           (COALESCE(p.internal_link_count,0) < 3) AS r_links,
           (p.meta_title IS NULL OR p.meta_description IS NULL
             OR length(p.meta_description) < 120 OR length(p.meta_description) > 175
             OR length(p.meta_title) < 30 OR length(p.meta_title) > 65) AS r_badmeta,
           (COALESCE(l.m_impressions,0) = 0) AS r_zero
      FROM public.seo_pages p
      LEFT JOIN latest l ON l.page_id = p.id
      LEFT JOIN imp im ON im.page_id = p.id
     WHERE p.status = 'published'
  ),
  scored AS (
    SELECT b.*,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN b.r_meta THEN 'need_meta_rewrite' END,
        CASE WHEN b.r_boost THEN 'boost_position' END,
        CASE WHEN b.r_notidx THEN 'not_indexed_14d' END,
        CASE WHEN b.r_thin THEN 'thin_content' END,
        CASE WHEN b.r_links THEN 'weak_internal_links' END,
        CASE WHEN b.r_badmeta THEN 'bad_meta' END,
        CASE WHEN b.r_zero THEN 'zero_impressions' END
      ], NULL) AS reasons_arr,
      (CASE WHEN b.r_meta THEN 40 ELSE 0 END
       + CASE WHEN b.r_boost THEN 35 ELSE 0 END
       + CASE WHEN b.r_notidx THEN 25 ELSE 0 END
       + CASE WHEN b.r_thin THEN 15 ELSE 0 END
       + CASE WHEN b.r_links THEN 10 ELSE 0 END
       + CASE WHEN b.r_badmeta THEN 12 ELSE 0 END
       + LEAST(COALESCE(b.m_impressions,0) / 20, 30))::int AS pscore
    FROM base b
  )
  SELECT s.id, s.slug, s.title, s.meta_title, s.meta_description,
         s.google_index_status, s.indexed_at, s.published_at,
         COALESCE(s.m_impressions,0)::int, COALESCE(s.m_clicks,0)::int,
         COALESCE(s.m_ctr,0)::numeric, COALESCE(s.m_position,0)::numeric,
         COALESCE(NULLIF(s.m_top_queries->0->>'query',''), (s.keywords)[1], s.title) AS primary_keyword,
         COALESCE(s.m_top_queries,'[]'::jsonb),
         COALESCE(s.word_count,0)::int, COALESCE(s.internal_link_count,0)::int,
         s.seo_score, s.qa_last_score, COALESCE(s.backlinks_count,0)::int,
         COALESCE(s.intelligence_flags, '{}'::text[]),
         s.reasons_arr,
         CASE WHEN s.pscore >= 55 THEN 'haute' WHEN s.pscore >= 25 THEN 'moyenne' ELSE 'basse' END,
         s.pscore, s.last_applied, s.n_applied
    FROM scored s
   WHERE CASE _scope
           WHEN 'zero_impressions' THEN s.r_zero
           WHEN 'need_meta_rewrite' THEN s.r_meta
           WHEN 'boost' THEN s.r_boost
           WHEN 'not_indexed_14d' THEN s.r_notidx
           ELSE cardinality(s.reasons_arr) > 0
         END
   ORDER BY s.pscore DESC, COALESCE(s.m_impressions,0) DESC, s.published_at DESC NULLS LAST
   LIMIT GREATEST(_limit,1) OFFSET GREATEST(_offset,0);
$$;

REVOKE ALL ON FUNCTION public.seo_optimization_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seo_optimization_candidates(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_optimization_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_optimization_candidates(text,int,int) TO authenticated;