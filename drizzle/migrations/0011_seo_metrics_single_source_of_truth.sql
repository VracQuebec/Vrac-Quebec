UPDATE public.seo_pages p
SET meta_title = sub.new_title,
    qa_blockers = ARRAY(SELECT b FROM unnest(coalesce(p.qa_blockers, '{}')) b WHERE b NOT LIKE 'Meta title%')
FROM (
  SELECT p2.id,
    CASE
      WHEN p2.material_slug IS NOT NULL THEN
        coalesce(m.name, initcap(replace(p2.material_slug, '-', ' '))) || ' en vrac à ' || coalesce(c.name, initcap(replace(p2.city_slug, '-', ' '))) || ' | Vrac Québec'
      WHEN p2.service_slug IS NOT NULL THEN
        coalesce(s.name, initcap(replace(p2.service_slug, '-', ' '))) || ' à ' || coalesce(c.name, initcap(replace(p2.city_slug, '-', ' '))) || ' | Service Vrac Québec'
      ELSE
        coalesce(c.name, initcap(replace(p2.city_slug, '-', ' '))) || ' : matériaux en vrac | Vrac Québec'
    END AS new_title
  FROM public.seo_pages p2
  LEFT JOIN public.seo_materials m ON m.slug = p2.material_slug
  LEFT JOIN public.seo_services  s ON s.slug = p2.service_slug
  LEFT JOIN public.seo_cities    c ON c.slug = p2.city_slug
  WHERE coalesce(length(p2.meta_title), 0) < 30
) sub
WHERE sub.id = p.id
  AND length(sub.new_title) BETWEEN 30 AND 70;

CREATE OR REPLACE FUNCTION public.seo_truth_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  WITH crm AS (
    SELECT public.geo_normalize(gt.name) AS n
    FROM public.geo_territories gt
    WHERE gt.type = 'municipalite' AND gt.status = 'active'
  ), sc AS (
    SELECT c.slug, public.geo_normalize(c.name) AS n FROM public.seo_cities c WHERE c.active
  ), pg AS (
    SELECT city_slug,
      count(*) FILTER (WHERE status = 'published') AS pub,
      count(*) FILTER (WHERE status = 'draft') AS dr
    FROM public.seo_pages GROUP BY city_slug
  ), crm_cov AS (
    SELECT crm.n, coalesce(sum(pg.pub), 0) AS pub, coalesce(sum(pg.dr), 0) AS dr
    FROM crm LEFT JOIN sc ON sc.n = crm.n LEFT JOIN pg ON pg.city_slug = sc.slug
    GROUP BY crm.n
  ), idx AS (
    SELECT p.id,
      CASE
        WHEN p.status <> 'published' OR p.noindex THEN 'non_suivie'
        WHEN p.google_index_status = 'indexed' THEN 'indexee_confirmee'
        WHEN p.google_index_status IN ('not_indexed','crawled_not_indexed','discovered_not_indexed','excluded','blocked') THEN 'non_indexee_confirmee'
        WHEN p.google_last_checked_at IS NULL THEN 'jamais_verifiee'
        ELSE 'sans_statut_gsc'
      END AS bucket
    FROM public.seo_pages p
  ), fix AS (
    SELECT p.slug,
      CASE
        WHEN coalesce(length(p.meta_title), 0) < 30 OR coalesce(length(p.meta_description), 0) < 70 THEN 'metadonnees'
        WHEN coalesce(btrim(p.h1), '') = '' THEN 'h1'
        WHEN coalesce(p.word_count, 0) < 300 THEN 'contenu'
        WHEN coalesce(p.internal_link_count, 0) = 0 THEN 'page_orpheline'
        WHEN p.faq IS NULL OR jsonb_array_length(coalesce(p.faq, '[]'::jsonb)) = 0 THEN 'donnees_structurees'
        WHEN array_length(p.qa_blockers, 1) > 0 THEN 'autre'
        ELSE NULL
      END AS reason
    FROM public.seo_pages p
    WHERE p.status = 'published'
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'pages', jsonb_build_object(
      'total',      (SELECT count(*) FROM public.seo_pages),
      'published',  (SELECT count(*) FROM public.seo_pages WHERE status = 'published'),
      'drafts',     (SELECT count(*) FROM public.seo_pages WHERE status = 'draft'),
      'other',      (SELECT count(*) FROM public.seo_pages WHERE status NOT IN ('published','draft')),
      'noindex',    (SELECT count(*) FROM public.seo_pages WHERE noindex),
      'to_fix',     (SELECT count(*) FROM fix WHERE reason IS NOT NULL),
      'orphans',    (SELECT count(*) FROM public.seo_pages WHERE status = 'published' AND coalesce(internal_link_count,0) = 0),
      'duplicate_slugs', (SELECT count(*) FROM (SELECT slug FROM public.seo_pages GROUP BY slug HAVING count(*) > 1) d),
      'duplicate_titles', (SELECT count(*) FROM (SELECT lower(btrim(coalesce(meta_title,title))) t FROM public.seo_pages WHERE status='published' GROUP BY 1 HAVING count(*) > 1) d)
    ),
    'to_fix_breakdown', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT reason, count(*)::int n FROM fix WHERE reason IS NOT NULL GROUP BY reason) x
    ),
    'to_fix_pages', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'reason', reason) ORDER BY reason, slug), '[]'::jsonb)
      FROM (SELECT slug, reason FROM fix WHERE reason IS NOT NULL LIMIT 300) y
    ),
    'cities', jsonb_build_object(
      'crm_total',          (SELECT count(*) FROM crm),
      'seo_total',          (SELECT count(*) FROM sc),
      'historical_outside_registry', (SELECT count(*) FROM sc WHERE NOT EXISTS (SELECT 1 FROM crm WHERE crm.n = sc.n)),
      'crm_with_published', (SELECT count(*) FROM crm_cov WHERE pub > 0),
      'crm_draft_only',     (SELECT count(*) FROM crm_cov WHERE pub = 0 AND dr > 0),
      'crm_without_page',   (SELECT count(*) FROM crm_cov WHERE pub = 0 AND dr = 0),
      'seo_slugs_with_published', (SELECT count(DISTINCT city_slug) FROM public.seo_pages WHERE status = 'published' AND city_slug IS NOT NULL)
    ),
    'indexation', jsonb_build_object(
      'indexee_confirmee',     (SELECT count(*) FROM idx WHERE bucket = 'indexee_confirmee'),
      'non_indexee_confirmee', (SELECT count(*) FROM idx WHERE bucket = 'non_indexee_confirmee'),
      'sans_statut_gsc',       (SELECT count(*) FROM idx WHERE bucket = 'sans_statut_gsc'),
      'jamais_verifiee',       (SELECT count(*) FROM idx WHERE bucket = 'jamais_verifiee'),
      'non_suivie',            (SELECT count(*) FROM idx WHERE bucket = 'non_suivie'),
      'total',                 (SELECT count(*) FROM idx)
    )
  ) INTO _res;

  RETURN _res;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.seo_truth_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.seo_index_diagnosis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  WITH classified AS (
    SELECT p.slug, p.city_slug, p.material_slug, p.service_slug, p.word_count,
      coalesce(p.internal_link_count, 0) AS internal_link_count,
      CASE
        WHEN p.noindex THEN 'non_suivie'
        WHEN p.google_index_status = 'indexed' THEN 'indexee_confirmee'
        WHEN p.google_index_status IN ('not_indexed','crawled_not_indexed','discovered_not_indexed','excluded','blocked') THEN 'non_indexee_confirmee'
        WHEN p.google_last_checked_at IS NULL THEN 'jamais_verifiee'
        ELSE 'sans_statut_gsc'
      END AS bucket,
      CASE
        WHEN coalesce(p.internal_link_count,0) = 0 THEN 'page_orpheline'
        WHEN coalesce(p.word_count,0) < 300 THEN 'contenu_insuffisant'
        ELSE NULL
      END AS content_flag
    FROM public.seo_pages p WHERE p.status = 'published'
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'published', (SELECT count(*) FROM classified),
    'indexed', (SELECT count(*) FROM classified WHERE bucket = 'indexee_confirmee'),
    'not_indexed', (SELECT count(*) FROM classified WHERE bucket = 'non_indexee_confirmee'),
    'unknown_status', (SELECT count(*) FROM classified WHERE bucket = 'sans_statut_gsc'),
    'never_checked', (SELECT count(*) FROM classified WHERE bucket = 'jamais_verifiee'),
    'not_tracked', (SELECT count(*) FROM classified WHERE bucket = 'non_suivie'),
    'gsc_connected', EXISTS (SELECT 1 FROM public.seo_pages WHERE google_last_checked_at IS NOT NULL),
    'buckets', (SELECT coalesce(jsonb_agg(jsonb_build_object('cause', bucket, 'count', n) ORDER BY n DESC), '[]'::jsonb)
                FROM (SELECT bucket, count(*)::int n FROM classified GROUP BY bucket) b),
    'content_flags', (SELECT coalesce(jsonb_agg(jsonb_build_object('cause', content_flag, 'count', n) ORDER BY n DESC), '[]'::jsonb)
                FROM (SELECT content_flag, count(*)::int n FROM classified WHERE content_flag IS NOT NULL GROUP BY content_flag) f),
    'samples', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'cause', s.bucket, 'city', s.city_slug,
                  'material', s.material_slug, 'service', s.service_slug, 'words', s.word_count,
                  'internal_links', s.internal_link_count)), '[]'::jsonb)
                FROM (SELECT * FROM classified WHERE bucket <> 'indexee_confirmee' ORDER BY bucket, slug LIMIT 200) s),
    'orphans', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'city', city_slug,
                  'material', material_slug, 'service', service_slug)), '[]'::jsonb)
                FROM classified WHERE content_flag = 'page_orpheline')
  ) INTO _res;

  RETURN _res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seo_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  truth jsonb; result jsonb;
  cities_total int; materials_total int; services_total int;
  materials_covered int; services_covered int;
  combinations_possible int; combinations_created int;
  qa_avg numeric; seo_avg numeric;
  gsc_imp bigint; gsc_clk bigint; gsc_pos numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  truth := public.seo_truth_metrics();

  SELECT COUNT(*) INTO cities_total FROM public.seo_cities WHERE active;
  SELECT COUNT(*) INTO materials_total FROM public.seo_materials WHERE active;
  SELECT COUNT(*) INTO services_total FROM public.seo_services WHERE active;

  SELECT COUNT(DISTINCT material_slug) INTO materials_covered FROM public.seo_pages
    WHERE status='published' AND material_slug IS NOT NULL;
  SELECT COUNT(DISTINCT service_slug) INTO services_covered FROM public.seo_pages
    WHERE status='published' AND service_slug IS NOT NULL;

  combinations_possible := cities_total * (materials_total + services_total);
  combinations_created := (truth->'pages'->>'total')::int;

  SELECT COALESCE(AVG(qa_last_score), 0) INTO qa_avg FROM public.seo_pages WHERE qa_last_score IS NOT NULL;
  SELECT COALESCE(AVG(seo_score), 0) INTO seo_avg FROM public.seo_pages WHERE seo_score IS NOT NULL;

  SELECT COALESCE(SUM(impressions),0), COALESCE(SUM(clicks),0), COALESCE(AVG(position),0)
    INTO gsc_imp, gsc_clk, gsc_pos
    FROM public.seo_gsc_metrics WHERE period='28d';

  result := jsonb_build_object(
    'computed_at', now(),
    'cities_total', cities_total, 'materials_total', materials_total, 'services_total', services_total,
    'pages_total', (truth->'pages'->>'total')::int,
    'pages_published', (truth->'pages'->>'published')::int,
    'pages_draft', (truth->'pages'->>'drafts')::int,
    'pages_needs_fix', (truth->'pages'->>'to_fix')::int,
    'pages_orphans', (truth->'pages'->>'orphans')::int,
    'cities_covered', (truth->'cities'->>'seo_slugs_with_published')::int,
    'crm_cities_total', (truth->'cities'->>'crm_total')::int,
    'crm_cities_with_published', (truth->'cities'->>'crm_with_published')::int,
    'crm_cities_draft_only', (truth->'cities'->>'crm_draft_only')::int,
    'crm_cities_without_page', (truth->'cities'->>'crm_without_page')::int,
    'cities_historical', (truth->'cities'->>'historical_outside_registry')::int,
    'indexation', truth->'indexation',
    'materials_covered', materials_covered, 'services_covered', services_covered,
    'combinations_possible', combinations_possible, 'combinations_created', combinations_created,
    'qa_avg', ROUND(qa_avg, 1), 'seo_avg', ROUND(seo_avg, 1),
    'gsc_impressions', gsc_imp, 'gsc_clicks', gsc_clk, 'gsc_position', ROUND(gsc_pos, 2),
    'coverage_cities_pct', CASE WHEN cities_total>0 THEN ROUND(100.0*(truth->'cities'->>'seo_slugs_with_published')::int/cities_total, 1) ELSE 0 END,
    'coverage_materials_pct', CASE WHEN materials_total>0 THEN ROUND(100.0*materials_covered/materials_total, 1) ELSE 0 END,
    'coverage_services_pct', CASE WHEN services_total>0 THEN ROUND(100.0*services_covered/services_total, 1) ELSE 0 END,
    'coverage_combinations_pct', CASE WHEN combinations_possible>0 THEN ROUND(100.0*combinations_created/combinations_possible, 1) ELSE 0 END,
    'waves', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', w.code, 'name', w.name, 'priority', w.priority,
        'total', COALESCE(pw.total,0), 'published', COALESCE(pw.published,0), 'draft', COALESCE(pw.draft,0)
      ) ORDER BY w.priority DESC), '[]'::jsonb)
      FROM public.seo_waves w
      LEFT JOIN (
        SELECT wave, COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='published') AS published,
          COUNT(*) FILTER (WHERE status='draft') AS draft
        FROM public.seo_pages WHERE wave IS NOT NULL GROUP BY wave
      ) pw ON pw.wave = w.code
      WHERE w.active
    )
  );
  RETURN result;
END $function$;