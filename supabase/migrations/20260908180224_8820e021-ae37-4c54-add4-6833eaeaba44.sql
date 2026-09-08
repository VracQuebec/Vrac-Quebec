
CREATE OR REPLACE VIEW public.seo_page_triage_v
WITH (security_invoker = true) AS
WITH g AS (
  SELECT page_id,
         SUM(COALESCE(clicks,0))::int      AS clicks,
         SUM(COALESCE(impressions,0))::int AS impressions,
         AVG(NULLIF(position,0))           AS position
    FROM public.seo_gsc_metrics
   WHERE fetched_at > now() - interval '90 days'
   GROUP BY 1
), d AS (
  SELECT id,
         (COALESCE(meta_title,'') <> '' AND COUNT(*) OVER (PARTITION BY lower(btrim(COALESCE(meta_title,'')))) > 1) AS dup_title,
         (COALESCE(meta_description,'') <> '' AND COUNT(*) OVER (PARTITION BY lower(btrim(COALESCE(meta_description,'')))) > 1) AS dup_meta
    FROM public.seo_pages
)
SELECT
  p.id,
  p.slug,
  p.title,
  p.status,
  p.city_slug,
  p.material_slug,
  COALESCE(p.qa_last_score, p.seo_score) AS score,
  COALESCE(p.word_count,0)               AS word_count,
  p.needs_refresh,
  p.google_index_status,
  COALESCE(g.clicks,0)      AS gsc_clicks,
  COALESCE(g.impressions,0) AS gsc_impressions,
  g.position                AS gsc_position,
  (g.page_id IS NOT NULL)   AS has_gsc_data,
  (COALESCE(p.meta_title,'') = '' OR length(p.meta_title) < 25 OR length(p.meta_title) > 65) AS weak_title,
  (COALESCE(p.meta_description,'') = '' OR length(p.meta_description) < 110 OR length(p.meta_description) > 170) AS weak_meta,
  (COALESCE(p.h1,'') = '')                       AS weak_h1,
  (COALESCE(p.h2_count,0) < 3)                   AS weak_headings,
  (COALESCE(p.internal_link_count,0) < 3)        AS weak_links,
  (p.faq IS NULL OR jsonb_array_length(COALESCE(p.faq,'[]'::jsonb)) < 3) AS weak_faq,
  (COALESCE(p.word_count,0) < 600)               AS thin_content,
  d.dup_title,
  d.dup_meta,
  CASE
    WHEN p.status = 'published' AND COALESCE(p.google_index_status,'') IN ('not_indexed','excluded','error','crawled_not_indexed')
      THEN 'technique'
    WHEN p.status = 'published' AND COALESCE(p.word_count,0) < 250
      THEN 'revision_humaine'
    WHEN COALESCE(p.qa_last_score, p.seo_score) IS NULL
      OR COALESCE(p.qa_last_score, p.seo_score) < 65
      OR COALESCE(p.meta_title,'') = '' OR COALESCE(p.meta_description,'') = '' OR COALESCE(p.h1,'') = ''
      OR d.dup_title OR d.dup_meta
      OR (COALESCE(g.impressions,0) = 0 AND g.page_id IS NOT NULL AND p.status = 'published')
      THEN 'necessaire'
    WHEN COALESCE(p.qa_last_score, p.seo_score) < 85
      OR p.needs_refresh
      OR COALESCE(p.word_count,0) < 600
      OR COALESCE(p.internal_link_count,0) < 3
      THEN 'recommandee'
    ELSE 'suffisante'
  END AS triage,
  (
    CASE
      WHEN p.status = 'published' AND COALESCE(p.google_index_status,'') IN ('not_indexed','excluded','error','crawled_not_indexed') THEN 10
      WHEN d.dup_title OR d.dup_meta THEN 15
      WHEN COALESCE(p.qa_last_score, p.seo_score) IS NULL THEN 20
      WHEN COALESCE(p.qa_last_score, p.seo_score) < 50 THEN 22
      WHEN COALESCE(p.meta_title,'') = '' OR COALESCE(p.meta_description,'') = '' OR COALESCE(p.h1,'') = '' THEN 25
      WHEN COALESCE(p.qa_last_score, p.seo_score) < 65 THEN 30
      WHEN COALESCE(g.impressions,0) = 0 AND g.page_id IS NOT NULL THEN 35
      WHEN p.needs_refresh THEN 45
      WHEN COALESCE(p.qa_last_score, p.seo_score) < 85 THEN 50
      ELSE 90
    END
    - LEAST(8, COALESCE(g.clicks,0))
  )::int AS triage_priority
FROM public.seo_pages p
LEFT JOIN g ON g.page_id = p.id
LEFT JOIN d ON d.id = p.id;

GRANT SELECT ON public.seo_page_triage_v TO authenticated;
GRANT SELECT ON public.seo_page_triage_v TO service_role;

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

REVOKE ALL ON FUNCTION public.seo_triage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_triage_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.seo_bulk_start(_mode text DEFAULT 'optimize'::text, _scope text DEFAULT 'all'::text, _concurrency integer DEFAULT 3, _limit integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _run_id uuid;
  _count int;
  _skip_above int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF EXISTS (SELECT 1 FROM public.seo_optimization_runs WHERE status IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Une opération est déjà en cours. Reprenez-la ou arrêtez-la avant d''en lancer une autre.';
  END IF;

  _skip_above := CASE WHEN COALESCE(_mode,'optimize') = 'refresh' THEN 92 ELSE 95 END;

  INSERT INTO public.seo_optimization_runs
    (status, concurrency, qa_threshold, qa_skip_above, force_all, actions, filter,
     created_by, started_at, last_progress_at)
  VALUES ('queued', GREATEST(1, LEAST(10, COALESCE(_concurrency,3))), 90, _skip_above, false, '{}',
     jsonb_build_object('mode', COALESCE(_mode,'optimize'), 'scope', COALESCE(_scope,'all'), 'limit', _limit, 'triage', true),
     auth.uid(), now(), now())
  RETURNING id INTO _run_id;

  INSERT INTO public.seo_optimization_tasks(run_id, page_id, priority)
  SELECT _run_id, t.id, t.triage_priority
    FROM public.seo_page_triage_v t
    LEFT JOIN public.seo_bulk_candidates c ON c.id = t.id
   WHERE t.triage IN ('technique','necessaire','recommandee')
     AND (CASE COALESCE(_scope,'all')
            WHEN 'to_improve' THEN COALESCE(c.is_to_improve, t.triage IN ('technique','necessaire'))
            WHEN 'to_refresh' THEN COALESCE(c.is_to_refresh, t.needs_refresh)
            WHEN 'errors'     THEN COALESCE(c.is_error, t.triage = 'technique')
            ELSE true
          END)
   ORDER BY t.triage_priority ASC, COALESCE(t.score, 0) ASC
   LIMIT COALESCE(_limit, 100000)
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO _count FROM public.seo_optimization_tasks WHERE run_id = _run_id;

  IF _count = 0 THEN
    UPDATE public.seo_optimization_runs SET status='completed', total=0, finished_at=now() WHERE id=_run_id;
  ELSE
    UPDATE public.seo_optimization_runs SET total=_count, status='running' WHERE id=_run_id;
  END IF;

  RETURN jsonb_build_object('run_id', _run_id, 'total', _count,
    'status', CASE WHEN _count = 0 THEN 'completed' ELSE 'running' END);
END;
$function$;

REVOKE ALL ON FUNCTION public.seo_bulk_start(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_bulk_start(text, text, integer, integer) TO authenticated;
