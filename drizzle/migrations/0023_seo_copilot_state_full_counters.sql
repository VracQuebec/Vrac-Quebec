CREATE OR REPLACE FUNCTION public.seo_copilot_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _opps jsonb;
  _run jsonb;
  _hist jsonb;
  _counts jsonb;
  _facets jsonb;
  _hidden jsonb;
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
    WHERE status IN ('open', 'in_progress', 'error')
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
    'total', COUNT(*),
    'open', COUNT(*) FILTER (WHERE status = 'open'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'error', COUNT(*) FILTER (WHERE status = 'error'),
    'completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'applied', COUNT(*) FILTER (WHERE status = 'applied'),
    'dismissed', COUNT(*) FILTER (WHERE status = 'dismissed'),
    'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
    'stale', COUNT(*) FILTER (WHERE status = 'stale'),
    'other', COUNT(*) FILTER (WHERE status NOT IN ('open','in_progress','error','completed','applied','dismissed','resolved','stale')),
    'active', COUNT(*) FILTER (WHERE status IN ('open','in_progress','error')),
    'critical', COUNT(*) FILTER (WHERE status IN ('open','in_progress','error') AND priority = 'critical'),
    'high', COUNT(*) FILTER (WHERE status IN ('open','in_progress','error') AND priority = 'high'),
    'medium', COUNT(*) FILTER (WHERE status IN ('open','in_progress','error') AND priority = 'medium'),
    'low', COUNT(*) FILTER (WHERE status IN ('open','in_progress','error') AND priority = 'low'),
    'with_conversions', COUNT(*) FILTER (
      WHERE status IN ('open','in_progress','error')
        AND COALESCE((data->>'conversions')::numeric, 0) > 0),
    'high_potential', COUNT(*) FILTER (
      WHERE status IN ('open','in_progress','error') AND score >= 60)
  ) INTO _counts
  FROM public.seo_opportunities;

  -- Opportunités conservées en base mais absentes de la vue active (jamais supprimées)
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC), '[]'::jsonb) INTO _hidden
  FROM (
    SELECT id, type, category, title, status, priority, score, page_id,
           dismiss_reason, last_error, resolved_at, applied_at, dismissed_at,
           COALESCE(updated_at, last_seen_at, detected_at) AS updated_at
    FROM public.seo_opportunities
    WHERE status NOT IN ('open','in_progress','error','stale')
    ORDER BY COALESCE(updated_at, last_seen_at, detected_at) DESC
    LIMIT 200
  ) x;

  SELECT jsonb_build_object(
    'cities', COALESCE((SELECT jsonb_agg(DISTINCT target_city_slug)
      FROM public.seo_opportunities
      WHERE status IN ('open','in_progress','error') AND target_city_slug IS NOT NULL), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(DISTINCT target_service_slug)
      FROM public.seo_opportunities
      WHERE status IN ('open','in_progress','error') AND target_service_slug IS NOT NULL), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(DISTINCT category)
      FROM public.seo_opportunities
      WHERE status IN ('open','in_progress','error') AND category IS NOT NULL), '[]'::jsonb)
  ) INTO _facets;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'opportunities', _opps,
    'last_run', COALESCE(_run, 'null'::jsonb),
    'history', _hist,
    'counts', _counts,
    'facets', _facets,
    'hidden', _hidden
  );
END;
$function$;