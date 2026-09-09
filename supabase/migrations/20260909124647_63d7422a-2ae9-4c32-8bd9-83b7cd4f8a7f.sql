CREATE OR REPLACE VIEW public.seo_page_triage_v
WITH (security_invoker = true) AS
 WITH g AS (
         SELECT seo_gsc_metrics.page_id,
            sum(COALESCE(seo_gsc_metrics.clicks, 0))::integer AS clicks,
            sum(COALESCE(seo_gsc_metrics.impressions, 0))::integer AS impressions,
            avg(NULLIF(seo_gsc_metrics."position", 0::numeric)) AS "position"
           FROM seo_gsc_metrics
          WHERE seo_gsc_metrics.fetched_at > (now() - '90 days'::interval)
          GROUP BY seo_gsc_metrics.page_id
        ), d AS (
         SELECT seo_pages.id,
            COALESCE(seo_pages.meta_title, ''::text) <> ''::text AND count(*) OVER (PARTITION BY (lower(btrim(COALESCE(seo_pages.meta_title, ''::text))))) > 1 AS dup_title,
            COALESCE(seo_pages.meta_description, ''::text) <> ''::text AND count(*) OVER (PARTITION BY (lower(btrim(COALESCE(seo_pages.meta_description, ''::text))))) > 1 AS dup_meta
           FROM seo_pages
        )
 SELECT p.id,
    p.slug,
    p.title,
    p.status,
    p.city_slug,
    p.material_slug,
    COALESCE(p.qa_last_score, p.seo_score) AS score,
    COALESCE(p.word_count, 0) AS word_count,
    p.needs_refresh,
    p.google_index_status,
    COALESCE(g.clicks, 0) AS gsc_clicks,
    COALESCE(g.impressions, 0) AS gsc_impressions,
    g."position" AS gsc_position,
    g.page_id IS NOT NULL AS has_gsc_data,
    COALESCE(p.meta_title, ''::text) = ''::text OR length(p.meta_title) < 25 OR length(p.meta_title) > 65 AS weak_title,
    COALESCE(p.meta_description, ''::text) = ''::text OR length(p.meta_description) < 110 OR length(p.meta_description) > 170 AS weak_meta,
    COALESCE(p.h1, ''::text) = ''::text AS weak_h1,
    COALESCE(p.h2_count, 0) < 3 AS weak_headings,
    COALESCE(p.internal_link_count, 0) < 3 AS weak_links,
    p.faq IS NULL OR jsonb_array_length(COALESCE(p.faq, '[]'::jsonb)) < 3 AS weak_faq,
    COALESCE(p.word_count, 0) < 600 AS thin_content,
    d.dup_title,
    d.dup_meta,
        CASE
            WHEN p.status = 'published'::text AND (COALESCE(p.google_index_status, ''::text) = ANY (ARRAY['not_indexed'::text, 'excluded'::text, 'error'::text, 'crawled_not_indexed'::text])) THEN 'technique'::text
            WHEN p.status = 'published'::text AND COALESCE(p.word_count, 0) < 250 THEN 'revision_humaine'::text
            -- Défaut réel et objectif requis : jamais l'absence d'impressions seule.
            WHEN COALESCE(p.qa_last_score, p.seo_score) IS NULL
              OR COALESCE(p.qa_last_score, p.seo_score) < 65
              OR COALESCE(p.meta_title, ''::text) = ''::text
              OR COALESCE(p.meta_description, ''::text) = ''::text
              OR COALESCE(p.h1, ''::text) = ''::text
              OR d.dup_title OR d.dup_meta THEN 'necessaire'::text
            WHEN COALESCE(p.qa_last_score, p.seo_score) < 85
              OR p.needs_refresh
              OR COALESCE(p.word_count, 0) < 600
              OR COALESCE(p.internal_link_count, 0) < 3
              OR length(COALESCE(p.meta_title,'')) > 65
              OR length(COALESCE(p.meta_description,'')) > 170 THEN 'recommandee'::text
            -- Page saine mais sans impressions : à observer, pas à retoucher.
            WHEN g.page_id IS NOT NULL AND COALESCE(g.impressions, 0) = 0 THEN 'observation'::text
            ELSE 'suffisante'::text
        END AS triage,
        CASE
            WHEN p.status = 'published'::text AND (COALESCE(p.google_index_status, ''::text) = ANY (ARRAY['not_indexed'::text, 'excluded'::text, 'error'::text, 'crawled_not_indexed'::text])) THEN 10
            WHEN d.dup_title OR d.dup_meta THEN 15
            WHEN COALESCE(p.qa_last_score, p.seo_score) IS NULL THEN 20
            WHEN COALESCE(p.qa_last_score, p.seo_score) < 50 THEN 22
            WHEN COALESCE(p.meta_title, ''::text) = ''::text OR COALESCE(p.meta_description, ''::text) = ''::text OR COALESCE(p.h1, ''::text) = ''::text THEN 25
            WHEN COALESCE(p.qa_last_score, p.seo_score) < 65 THEN 30
            WHEN p.needs_refresh THEN 45
            WHEN COALESCE(p.qa_last_score, p.seo_score) < 85 THEN 50
            ELSE 90
        END - LEAST(8, COALESCE(g.clicks, 0)) AS triage_priority
   FROM seo_pages p
     LEFT JOIN g ON g.page_id = p.id
     LEFT JOIN d ON d.id = p.id;

CREATE OR REPLACE FUNCTION public.seo_triage_summary()
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

  SELECT jsonb_build_object(
    'total',            (SELECT COUNT(*) FROM public.seo_page_triage_v),
    'technique',        (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE triage='technique'),
    'necessaire',       (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE triage='necessaire'),
    'recommandee',      (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE triage='recommandee'),
    'observation',      (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE triage='observation'),
    'suffisante',       (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE triage='suffisante'),
    'revision_humaine', (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE triage='revision_humaine'),
    'auto_optimisables',(SELECT COUNT(*) FROM public.seo_page_triage_v WHERE triage IN ('technique','necessaire','recommandee')),
    'gsc_pages',        (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE has_gsc_data),
    'gsc_zero_impressions', (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE has_gsc_data AND gsc_impressions = 0),
    'issues', jsonb_build_object(
      'weak_title',   (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE weak_title),
      'weak_meta',    (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE weak_meta),
      'weak_h1',      (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE weak_h1),
      'weak_headings',(SELECT COUNT(*) FROM public.seo_page_triage_v WHERE weak_headings),
      'weak_links',   (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE weak_links),
      'weak_faq',     (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE weak_faq),
      'thin_content', (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE thin_content),
      'dup_title',    (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE dup_title),
      'dup_meta',     (SELECT COUNT(*) FROM public.seo_page_triage_v WHERE dup_meta)
    ),
    'sample', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT slug, title, score, triage, triage_priority, gsc_impressions, gsc_clicks
          FROM public.seo_page_triage_v
         WHERE triage IN ('technique','necessaire','recommandee')
         ORDER BY triage_priority ASC, COALESCE(score,0) ASC
         LIMIT 20) x), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END;
$function$;