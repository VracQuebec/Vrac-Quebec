-- Copilote SEO : priorisation explicable, groupes et cycle de vie des opportunités (additif).
ALTER TABLE public.seo_opportunities
  ADD COLUMN IF NOT EXISTS score_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_impact text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS data_quality text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.seo_opportunity_runs
  ADD COLUMN IF NOT EXISTS signals_detected integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signals_rejected integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS group_insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comparison jsonb,
  ADD COLUMN IF NOT EXISTS top_opportunities jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS seo_opportunities_status_score_idx
  ON public.seo_opportunities (status, score DESC);

CREATE OR REPLACE FUNCTION public.seo_copilot_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opps jsonb;
  _run jsonb;
  _hist jsonb;
  _counts jsonb;
  _facets jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.score DESC, o.effort_score ASC), '[]'::jsonb) INTO _opps
  FROM (
    SELECT id, type, category, title, rationale, reason, recommended_action, expected_impact,
           source, url, priority, score, score_factors, data_quality, data, suggested_action,
           impact_score, effort_score, potential_searches, potential_clicks, potential_leads,
           entity_slug, target_city_slug, target_material_slug, target_service_slug, page_id,
           status, detected_at, last_seen_at
    FROM public.seo_opportunities
    WHERE status IN ('open', 'in_progress')
    ORDER BY score DESC, effort_score ASC
    LIMIT 200
  ) o;

  SELECT to_jsonb(r) INTO _run
  FROM public.seo_opportunity_runs r
  ORDER BY started_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.started_at DESC), '[]'::jsonb) INTO _hist
  FROM (
    SELECT id, started_at, finished_at, duration_ms, status, pages_analyzed,
           gsc_rows_analyzed, conversions_analyzed, opportunities_detected,
           signals_detected, signals_rejected, resolved_count,
           new_count, updated_count, stale_count, comparison
    FROM public.seo_opportunity_runs ORDER BY started_at DESC LIMIT 10
  ) h;

  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE status = 'open'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'dismissed', COUNT(*) FILTER (WHERE status = 'dismissed'),
    'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
    'stale', COUNT(*) FILTER (WHERE status = 'stale'),
    'critical', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'critical'),
    'high', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'high'),
    'medium', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'medium'),
    'low', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'low'),
    'with_conversions', COUNT(*) FILTER (
      WHERE status IN ('open','in_progress')
        AND COALESCE((data->>'conversions')::numeric, 0) > 0),
    'high_potential', COUNT(*) FILTER (
      WHERE status IN ('open','in_progress') AND score >= 60)
  ) INTO _counts
  FROM public.seo_opportunities;

  SELECT jsonb_build_object(
    'cities', COALESCE((SELECT jsonb_agg(DISTINCT target_city_slug)
      FROM public.seo_opportunities
      WHERE status IN ('open','in_progress') AND target_city_slug IS NOT NULL), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(DISTINCT target_service_slug)
      FROM public.seo_opportunities
      WHERE status IN ('open','in_progress') AND target_service_slug IS NOT NULL), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(DISTINCT category)
      FROM public.seo_opportunities
      WHERE status IN ('open','in_progress') AND category IS NOT NULL), '[]'::jsonb)
  ) INTO _facets;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'opportunities', _opps,
    'last_run', COALESCE(_run, 'null'::jsonb),
    'history', _hist,
    'counts', _counts,
    'facets', _facets
  );
END;
$$;