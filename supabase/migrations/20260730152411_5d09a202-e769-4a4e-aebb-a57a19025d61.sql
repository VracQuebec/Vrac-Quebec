CREATE OR REPLACE FUNCTION public.seo_intelligence_pages(_filter text DEFAULT 'all'::text, _limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, slug text, title text, status text, published_at timestamp with time zone, discovered_at timestamp with time zone, indexed_at timestamp with time zone, impressions integer, clicks integer, ctr numeric, avg_position numeric, top_queries jsonb, backlinks_count integer, qa_last_score integer, intelligence_flags text[], diagnostic_report jsonb, intelligence_last_checked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (g.page_id)
           g.page_id      AS page_id,
           g.clicks       AS m_clicks,
           g.impressions  AS m_impressions,
           g.position     AS m_position,
           g.ctr          AS m_ctr,
           g.top_queries  AS m_top_queries
      FROM public.seo_gsc_metrics g
     WHERE g.period = '28d'
     ORDER BY g.page_id, g.fetched_at DESC
  )
  SELECT p.id, p.slug, p.title, p.status,
         p.published_at, p.discovered_at, p.indexed_at,
         COALESCE(l.m_impressions, 0)::int,
         COALESCE(l.m_clicks, 0)::int,
         COALESCE(l.m_ctr, 0)::numeric,
         COALESCE(l.m_position, 0)::numeric,
         COALESCE(l.m_top_queries, '[]'::jsonb),
         p.backlinks_count, p.qa_last_score,
         p.intelligence_flags, p.diagnostic_report,
         p.intelligence_last_checked_at
    FROM public.seo_pages p
    LEFT JOIN latest l ON l.page_id = p.id
   WHERE p.status = 'published'
     AND CASE _filter
       WHEN 'not_indexed_14d' THEN p.indexed_at IS NULL AND p.published_at < now() - INTERVAL '14 days'
       WHEN 'need_meta_rewrite' THEN l.m_impressions >= 100 AND l.m_clicks = 0
       WHEN 'boost' THEN l.m_position BETWEEN 8 AND 20
       WHEN 'top3' THEN l.m_position BETWEEN 1 AND 3 AND l.m_impressions > 0
       WHEN 'zero_impressions' THEN COALESCE(l.m_impressions, 0) = 0
       ELSE TRUE
     END
   ORDER BY COALESCE(l.m_impressions, 0) DESC, p.published_at DESC NULLS LAST
   LIMIT _limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seo_intelligence_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (g.page_id)
           g.page_id     AS page_id,
           g.clicks      AS m_clicks,
           g.impressions AS m_impressions,
           g.position    AS m_position,
           g.ctr         AS m_ctr
      FROM public.seo_gsc_metrics g
     WHERE g.period = '28d'
     ORDER BY g.page_id, g.fetched_at DESC
  ),
  agg AS (
    SELECT
      COUNT(*) FILTER (WHERE p.status = 'published') AS published,
      COUNT(*) FILTER (WHERE p.discovered_at IS NOT NULL) AS discovered,
      COUNT(*) FILTER (WHERE p.indexed_at IS NOT NULL) AS indexed,
      COUNT(*) FILTER (WHERE l.m_position BETWEEN 1 AND 3 AND l.m_impressions > 0) AS top3,
      COUNT(*) FILTER (WHERE l.m_position BETWEEN 1 AND 10 AND l.m_impressions > 0) AS top10,
      COUNT(*) FILTER (WHERE p.status = 'published' AND COALESCE(l.m_impressions, 0) = 0) AS zero_impressions,
      COUNT(*) FILTER (WHERE l.m_impressions >= 100 AND l.m_clicks = 0) AS need_meta_rewrite,
      COUNT(*) FILTER (WHERE l.m_position BETWEEN 8 AND 20) AS boost_candidates,
      COUNT(*) FILTER (WHERE p.status = 'published'
                          AND p.published_at < now() - INTERVAL '14 days'
                          AND p.indexed_at IS NULL) AS not_indexed_14d
    FROM public.seo_pages p
    LEFT JOIN latest l ON l.page_id = p.id
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'published', COALESCE(a.published, 0),
    'discovered', COALESCE(a.discovered, 0),
    'indexed', COALESCE(a.indexed, 0),
    'top3', COALESCE(a.top3, 0),
    'top10', COALESCE(a.top10, 0),
    'zero_impressions', COALESCE(a.zero_impressions, 0),
    'need_meta_rewrite', COALESCE(a.need_meta_rewrite, 0),
    'boost_candidates', COALESCE(a.boost_candidates, 0),
    'not_indexed_14d', COALESCE(a.not_indexed_14d, 0)
  ) INTO result FROM agg a;
  RETURN result;
END;
$function$;