
-- Add SEO Intelligence tracking columns to seo_pages
ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backlinks_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diagnostic_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS intelligence_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS intelligence_flags TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_seo_pages_indexed_at ON public.seo_pages(indexed_at);
CREATE INDEX IF NOT EXISTS idx_seo_pages_published_at ON public.seo_pages(published_at);

-- Auto-fill discovered_at on first non-zero impressions
CREATE OR REPLACE FUNCTION public.seo_intelligence_mark_discovery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.impressions > 0 THEN
    UPDATE public.seo_pages
      SET discovered_at = COALESCE(discovered_at, now()),
          indexed_at = CASE WHEN NEW.clicks > 0 OR NEW.position > 0 THEN COALESCE(indexed_at, now()) ELSE indexed_at END
      WHERE id = NEW.page_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_intelligence_mark_discovery ON public.seo_gsc_metrics;
CREATE TRIGGER trg_seo_intelligence_mark_discovery
AFTER INSERT OR UPDATE ON public.seo_gsc_metrics
FOR EACH ROW EXECUTE FUNCTION public.seo_intelligence_mark_discovery();

-- Dashboard RPC: aggregate KPIs for the SEO Intelligence module
CREATE OR REPLACE FUNCTION public.seo_intelligence_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (page_id) page_id, clicks, impressions, position, ctr, top_queries
      FROM public.seo_gsc_metrics
      WHERE period = '28d'
      ORDER BY page_id, fetched_at DESC
  ),
  agg AS (
    SELECT
      COUNT(*) FILTER (WHERE p.status = 'published') AS published,
      COUNT(*) FILTER (WHERE p.discovered_at IS NOT NULL) AS discovered,
      COUNT(*) FILTER (WHERE p.indexed_at IS NOT NULL) AS indexed,
      COUNT(*) FILTER (WHERE l.position BETWEEN 1 AND 3 AND l.impressions > 0) AS top3,
      COUNT(*) FILTER (WHERE l.position BETWEEN 1 AND 10 AND l.impressions > 0) AS top10,
      COUNT(*) FILTER (WHERE p.status = 'published' AND COALESCE(l.impressions, 0) = 0) AS zero_impressions,
      COUNT(*) FILTER (WHERE l.impressions >= 100 AND l.clicks = 0) AS need_meta_rewrite,
      COUNT(*) FILTER (WHERE l.position BETWEEN 8 AND 20) AS boost_candidates,
      COUNT(*) FILTER (WHERE p.status = 'published'
                          AND p.published_at < now() - INTERVAL '14 days'
                          AND p.indexed_at IS NULL) AS not_indexed_14d
    FROM public.seo_pages p
    LEFT JOIN latest l ON l.page_id = p.id
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'published', COALESCE(published, 0),
    'discovered', COALESCE(discovered, 0),
    'indexed', COALESCE(indexed, 0),
    'top3', COALESCE(top3, 0),
    'top10', COALESCE(top10, 0),
    'zero_impressions', COALESCE(zero_impressions, 0),
    'need_meta_rewrite', COALESCE(need_meta_rewrite, 0),
    'boost_candidates', COALESCE(boost_candidates, 0),
    'not_indexed_14d', COALESCE(not_indexed_14d, 0)
  ) INTO result FROM agg;
  RETURN result;
END;
$$;

-- Rich per-page listing with GSC 28d metrics + flags
CREATE OR REPLACE FUNCTION public.seo_intelligence_pages(
  _filter TEXT DEFAULT 'all',
  _limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  id UUID, slug TEXT, title TEXT, status TEXT,
  published_at TIMESTAMPTZ, discovered_at TIMESTAMPTZ, indexed_at TIMESTAMPTZ,
  impressions INTEGER, clicks INTEGER, ctr NUMERIC, avg_position NUMERIC,
  top_queries JSONB, backlinks_count INTEGER, qa_last_score INTEGER,
  intelligence_flags TEXT[], diagnostic_report JSONB,
  intelligence_last_checked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (page_id) page_id, clicks, impressions, position, ctr, top_queries
      FROM public.seo_gsc_metrics
      WHERE period = '28d'
      ORDER BY page_id, fetched_at DESC
  )
  SELECT p.id, p.slug, p.title, p.status,
         p.published_at, p.discovered_at, p.indexed_at,
         COALESCE(l.impressions, 0), COALESCE(l.clicks, 0),
         COALESCE(l.ctr, 0), COALESCE(l.position, 0),
         COALESCE(l.top_queries, '[]'::jsonb),
         p.backlinks_count, p.qa_last_score,
         p.intelligence_flags, p.diagnostic_report,
         p.intelligence_last_checked_at
    FROM public.seo_pages p
    LEFT JOIN latest l ON l.page_id = p.id
   WHERE p.status = 'published'
     AND CASE _filter
       WHEN 'not_indexed_14d' THEN p.indexed_at IS NULL AND p.published_at < now() - INTERVAL '14 days'
       WHEN 'need_meta_rewrite' THEN l.impressions >= 100 AND l.clicks = 0
       WHEN 'boost' THEN l.position BETWEEN 8 AND 20
       WHEN 'top3' THEN l.position BETWEEN 1 AND 3 AND l.impressions > 0
       WHEN 'zero_impressions' THEN COALESCE(l.impressions, 0) = 0
       ELSE TRUE
     END
   ORDER BY COALESCE(l.impressions, 0) DESC, p.published_at DESC NULLS LAST
   LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seo_intelligence_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_intelligence_pages(TEXT, INTEGER) TO authenticated;
