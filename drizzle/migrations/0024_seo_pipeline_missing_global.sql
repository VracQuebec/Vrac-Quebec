-- Génération globale des pages SEO manquantes.
-- Réutilise exactement la logique de pertinence existante (seo_city_slots_expected)
-- et le moteur de pipeline existant (seo_pipeline_runs / seo_city_batches).

CREATE OR REPLACE FUNCTION public.seo_pipeline_missing_preview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  WITH slots AS (SELECT * FROM public.seo_city_slots_expected(NULL)),
  joined AS (
    SELECT s.city_slug, s.material_slug, s.service_slug,
      p.id AS page_id, p.status AS page_status, t.status AS task_status
    FROM slots s
    LEFT JOIN LATERAL (
      SELECT p.id, p.status FROM public.seo_pages p
      WHERE p.city_slug = s.city_slug
        AND p.material_slug IS NOT DISTINCT FROM s.material_slug
        AND p.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY p.updated_at DESC NULLS LAST LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT t.status FROM public.seo_page_tasks t
      WHERE t.city_slug = s.city_slug
        AND t.material_slug IS NOT DISTINCT FROM s.material_slug
        AND t.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY t.updated_at DESC LIMIT 1
    ) t ON true
  )
  SELECT jsonb_build_object(
    'cities_total', (SELECT count(DISTINCT city_slug) FROM slots),
    'cities_with_missing', (SELECT count(DISTINCT city_slug) FROM joined
      WHERE page_id IS NULL AND coalesce(task_status,'') NOT IN ('queued','running')),
    'remaining', (SELECT count(*) FROM joined
      WHERE page_id IS NULL AND coalesce(task_status,'') NOT IN ('queued','running')),
    'pending', (SELECT count(*) FROM joined WHERE page_id IS NULL AND task_status IN ('queued','running')),
    'generated', (SELECT count(*) FROM joined WHERE page_id IS NOT NULL),
    'published', (SELECT count(*) FROM joined WHERE page_status = 'published'),
    'drafts', (SELECT count(*) FROM joined WHERE page_id IS NOT NULL AND page_status <> 'published'),
    'errors', (SELECT count(*) FROM public.seo_page_tasks WHERE status IN ('failed','needs_retry')),
    'active_run_id', (SELECT id FROM public.seo_pipeline_runs
      WHERE status IN ('queued','running','paused') ORDER BY created_at DESC LIMIT 1),
    'computed_at', now()
  ) INTO _r;

  RETURN _r;
END $function$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_start_missing(_qa_threshold integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _run uuid; _slugs text[]; _uid uuid := auth.uid(); _existing uuid;
BEGIN
  IF NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  -- Idempotence : un second clic ne relance rien, il rejoint le lancement en cours.
  SELECT id INTO _existing FROM public.seo_pipeline_runs
   WHERE status IN ('queued','running','paused') ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('run_id', _existing, 'created', false, 'cities', 0, 'reason', 'already_running');
  END IF;

  WITH slots AS (SELECT * FROM public.seo_city_slots_expected(NULL)),
  joined AS (
    SELECT s.city_slug, p.id AS page_id, t.status AS task_status
    FROM slots s
    LEFT JOIN LATERAL (
      SELECT p.id FROM public.seo_pages p
      WHERE p.city_slug = s.city_slug
        AND p.material_slug IS NOT DISTINCT FROM s.material_slug
        AND p.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY p.updated_at DESC NULLS LAST LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT t.status FROM public.seo_page_tasks t
      WHERE t.city_slug = s.city_slug
        AND t.material_slug IS NOT DISTINCT FROM s.material_slug
        AND t.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY t.updated_at DESC LIMIT 1
    ) t ON true
  )
  SELECT array_agg(DISTINCT j.city_slug ORDER BY j.city_slug) INTO _slugs
  FROM joined j
  WHERE j.page_id IS NULL
    AND coalesce(j.task_status,'') NOT IN ('queued','running')
    AND public.seo_city_is_generable(j.city_slug);

  IF coalesce(array_length(_slugs,1),0) = 0 THEN
    RETURN jsonb_build_object('run_id', null, 'created', false, 'cities', 0, 'reason', 'nothing_to_do');
  END IF;

  INSERT INTO public.seo_pipeline_runs(mode,status,city_slugs,qa_threshold,force_regenerate,created_by,started_at,last_progress_at)
  VALUES ('missing_all','queued',_slugs,coalesce(_qa_threshold,90),false,_uid,now(),now())
  RETURNING id INTO _run;

  INSERT INTO public.seo_city_batches(run_id,city_slug,sort_order,status)
  SELECT _run, s, ord, 'queued' FROM unnest(_slugs) WITH ORDINALITY AS t(s,ord);

  RETURN jsonb_build_object('run_id', _run, 'created', true, 'cities', array_length(_slugs,1));
END $function$;

REVOKE ALL ON FUNCTION public.seo_pipeline_missing_preview() FROM public;
REVOKE ALL ON FUNCTION public.seo_pipeline_start_missing(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_missing_preview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_start_missing(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_missing_preview() TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_start_missing(integer) TO service_role;