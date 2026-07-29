-- 1. Backfill: repromote every page that has ever been published.
UPDATE public.seo_pages
   SET status = 'published'
 WHERE published_at IS NOT NULL
   AND status <> 'published';

-- 2. Executive dashboard: use published_at as the persistent published signal.
CREATE OR REPLACE FUNCTION public.seo_executive_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _kpi JSONB;
  _gains JSONB;
  _losses JSONB;
  _opps JSONB;
  _convs JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT jsonb_build_object(
    'pages_total', COUNT(*),
    'pages_published', COUNT(*) FILTER (WHERE published_at IS NOT NULL OR status = 'published'),
    'pages_indexed', COUNT(*) FILTER (WHERE google_index_status = 'indexed'),
    'pages_pending', COUNT(*) FILTER (WHERE published_at IS NULL AND status = 'draft'),
    'qa_avg', COALESCE(ROUND(AVG(qa_last_score)::numeric, 1), 0),
    'seo_avg', COALESCE(ROUND(AVG(seo_score)::numeric, 1), 0)
  ) INTO _kpi
  FROM public.seo_pages;

  SELECT jsonb_build_object(
    'gsc_clicks_28d', COALESCE(SUM(clicks), 0),
    'gsc_impressions_28d', COALESCE(SUM(impressions), 0),
    'gsc_position_avg', COALESCE(ROUND(AVG(position)::numeric, 2), 0)
  ) INTO _convs
  FROM public.seo_gsc_metrics WHERE period = '28d';

  _kpi := _kpi || _convs;

  SELECT jsonb_build_object(
    'submissions_30d', COALESCE(SUM(submissions), 0),
    'phone_30d', COALESCE(SUM(phone_clicks), 0),
    'whatsapp_30d', COALESCE(SUM(whatsapp_clicks), 0),
    'email_30d', COALESCE(SUM(email_clicks), 0),
    'conversions_30d', COALESCE(SUM(conversions), 0)
  ) INTO _convs
  FROM public.seo_page_conversions_30d;

  _kpi := _kpi || _convs;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.clicks_delta DESC), '[]'::jsonb) INTO _gains
  FROM (
    SELECT p.slug, p.title, d.clicks, d.impressions, d.position, d.clicks_delta, d.position_gain
    FROM public.seo_gsc_deltas_28d d
    JOIN public.seo_pages p ON p.id = d.page_id
    WHERE d.clicks_delta > 0
    ORDER BY d.clicks_delta DESC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.clicks_delta ASC), '[]'::jsonb) INTO _losses
  FROM (
    SELECT p.slug, p.title, d.clicks, d.impressions, d.position, d.clicks_delta, d.position_gain
    FROM public.seo_gsc_deltas_28d d
    JOIN public.seo_pages p ON p.id = d.page_id
    WHERE d.clicks_delta < 0
    ORDER BY d.clicks_delta ASC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.impact_score DESC), '[]'::jsonb) INTO _opps
  FROM (
    SELECT id, type, title, rationale, suggested_action, impact_score, effort_score,
           potential_searches, potential_clicks, potential_leads, entity_slug,
           target_city_slug, target_material_slug, target_service_slug, page_id
    FROM public.seo_opportunities
    WHERE status = 'open'
    ORDER BY impact_score DESC, effort_score ASC
    LIMIT 20
  ) o;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'kpi', _kpi,
    'top_gains_30d', _gains,
    'top_losses_30d', _losses,
    'top_opportunities', _opps
  );
END $function$;

-- 3. Publication dashboard: same persistent signal for "published" count.
CREATE OR REPLACE FUNCTION public.seo_publication_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _counts jsonb;
  _stuck jsonb;
  _recent jsonb;
  _target_total int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT (SELECT COUNT(*) FROM public.seo_cities WHERE active AND served)
       * ((SELECT COUNT(*) FROM public.seo_materials WHERE active)
        + (SELECT COUNT(*) FROM public.seo_services WHERE active) + 1)
    INTO _target_total;

  SELECT jsonb_build_object(
    'target_total',   _target_total,
    'in_db',          (SELECT COUNT(*) FROM public.seo_pages),
    'drafts',         (SELECT COUNT(*) FROM public.seo_pages WHERE published_at IS NULL AND status = 'draft'),
    'in_qa',          (SELECT COUNT(*) FROM public.seo_pages
                        WHERE published_at IS NULL AND status = 'draft'
                          AND qa_last_checked_at IS NOT NULL
                          AND qa_last_checked_at > now() - interval '10 minutes'),
    'published',      (SELECT COUNT(*) FROM public.seo_pages
                        WHERE published_at IS NOT NULL OR status = 'published'),
    'discovered',     (SELECT COUNT(*) FROM public.seo_pages
                        WHERE google_index_status IN ('discovered','crawled','submitted','partial')),
    'indexed',        (SELECT COUNT(*) FROM public.seo_pages
                        WHERE google_index_status = 'indexed'),
    'qa_avg',         COALESCE((SELECT ROUND(AVG(qa_last_score)::numeric, 1)
                                  FROM public.seo_pages WHERE qa_last_score IS NOT NULL), 0),
    'words_avg',      COALESCE((SELECT ROUND(AVG(word_count)::numeric, 0)
                                  FROM public.seo_pages WHERE word_count IS NOT NULL), 0),
    'last_published', (SELECT MAX(published_at) FROM public.seo_pages WHERE published_at IS NOT NULL)
  ) INTO _counts;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.stuck_minutes DESC), '[]'::jsonb) INTO _stuck
  FROM (
    SELECT p.slug, p.status, p.qa_last_score, p.word_count,
           p.qa_blockers,
           EXTRACT(EPOCH FROM (now() - p.updated_at))::int / 60 AS stuck_minutes,
           CASE
             WHEN p.word_count IS NULL OR p.word_count < 800
               THEN 'contenu < 800 mots — la pipeline doit regénérer'
             WHEN array_length(p.qa_blockers,1) > 0
               THEN 'blockers QA : ' || array_to_string(p.qa_blockers, ' · ')
             WHEN p.qa_last_score IS NULL
               THEN 'QA jamais exécuté — orchestrateur ne l''a pas encore vue'
             WHEN p.qa_last_score < 80
               THEN 'QA ' || p.qa_last_score || ' < 80 — nécessite optimisation'
             ELSE 'raison inconnue — inspecter la page'
           END AS reason
      FROM public.seo_pages p
     WHERE p.published_at IS NULL
       AND p.status = 'draft'
       AND p.updated_at < now() - interval '5 minutes'
     ORDER BY p.updated_at ASC
     LIMIT 25
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.published_at DESC), '[]'::jsonb) INTO _recent
  FROM (
    SELECT slug, title, published_at, updated_at, qa_last_score, word_count, google_index_status
      FROM public.seo_pages
     WHERE published_at IS NOT NULL OR status = 'published'
     ORDER BY COALESCE(published_at, updated_at) DESC
     LIMIT 25
  ) r;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'counts', _counts,
    'stuck', _stuck,
    'recent', _recent
  );
END $function$;