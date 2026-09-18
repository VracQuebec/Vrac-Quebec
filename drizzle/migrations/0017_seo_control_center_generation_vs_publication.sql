CREATE OR REPLACE FUNCTION public.seo_control_center()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _per_city int;
  _cities int;
  _totals jsonb;
  _rows jsonb;
  _run jsonb;
  _run_id uuid;
  _queued int := 0;
  _processing int := 0;
  _stalled int := 0;
  _pipeline_state text;
  _problems jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT (SELECT COUNT(*) FROM seo_materials WHERE active)
       + (SELECT COUNT(*) FROM seo_services WHERE active) + 1 INTO _per_city;
  SELECT COUNT(*) INTO _cities
  FROM seo_cities c
  WHERE c.active AND public.seo_city_is_generable(c.slug);

  WITH s AS (SELECT * FROM public.seo_slot_rows(NULL)),
  per_city AS (
    SELECT s.city_slug AS slug, min(s.city_name) AS name,
           count(*)::int AS planned,
           count(*) FILTER (WHERE s.page_id IS NOT NULL)::int AS generated,
           count(*) FILTER (WHERE s.pub_state = 'published')::int AS published,
           count(*) FILTER (WHERE s.page_id IS NOT NULL AND s.pub_state <> 'published')::int AS drafts,
           count(*) FILTER (WHERE s.page_id IS NULL)::int AS remaining,
           count(*) FILTER (WHERE s.gen_state IN ('error','invalid'))::int AS errors,
           count(*) FILTER (WHERE s.gen_state = 'invalid')::int AS invalid,
           count(*) FILTER (WHERE s.gen_state = 'pending')::int AS pending,
           count(*) FILTER (WHERE s.pub_state = 'unpublished' AND s.gen_state = 'ok')::int AS unpublished
      FROM s GROUP BY s.city_slug
  )
  SELECT jsonb_build_object(
      'per_city', _per_city, 'cities', _cities,
      'target_total', coalesce(sum(planned),0),
      'generated', coalesce(sum(generated),0),
      'published', coalesce(sum(published),0),
      'drafts', coalesce(sum(drafts),0),
      'errors', coalesce(sum(errors),0),
      'remaining', coalesce(sum(remaining),0)
    ),
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', slug, 'name', name, 'planned', planned, 'generated', generated,
      'published', published, 'drafts', drafts,
      'remaining', remaining, 'errors', errors,
      'invalid', invalid, 'pending', pending, 'unpublished', unpublished,
      -- Progression = GÉNÉRATION (la publication reste manuelle et n'influence pas le statut)
      'pct', CASE WHEN planned > 0 THEN LEAST(100, ROUND(generated::numeric * 100 / planned))::int ELSE 0 END,
      'pct_published', CASE WHEN planned > 0 THEN LEAST(100, ROUND(published::numeric * 100 / planned))::int ELSE 0 END,
      'status', CASE
        WHEN pending > 0 THEN 'running'
        WHEN errors > 0 THEN 'error'
        WHEN generated >= planned AND planned > 0 THEN 'done'
        WHEN generated = 0 THEN 'todo'
        ELSE 'partial' END
    ) ORDER BY name), '[]'::jsonb)
  INTO _totals, _rows FROM per_city;

  SELECT r.id, to_jsonb(r.*) INTO _run_id, _run
    FROM seo_pipeline_runs r
   WHERE r.status IN ('queued','running','paused')
   ORDER BY r.created_at DESC LIMIT 1;

  IF _run_id IS NOT NULL THEN
    SELECT
      count(*) FILTER (WHERE t.status = 'queued' AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())),
      count(*) FILTER (WHERE t.status = 'running' AND COALESCE(t.updated_at,t.started_at) >= now() - interval '90 seconds'),
      count(*) FILTER (WHERE t.status = 'running' AND COALESCE(t.updated_at,t.started_at) < now() - interval '90 seconds')
    INTO _queued, _processing, _stalled
    FROM seo_page_tasks t
    WHERE t.run_id = _run_id
      AND NOT EXISTS (
        SELECT 1 FROM seo_pages p
        WHERE p.city_slug=t.city_slug
          AND p.material_slug IS NOT DISTINCT FROM t.material_slug
          AND p.service_slug IS NOT DISTINCT FROM t.service_slug
      );
  END IF;

  _pipeline_state := CASE
    WHEN _processing > 0 THEN 'running'
    WHEN COALESCE((_totals->>'remaining')::int,0) = 0 THEN 'completed'
    WHEN _stalled > 0 THEN 'blocked'
    WHEN _run_id IS NOT NULL AND _queued > 0 THEN 'waiting'
    WHEN COALESCE((_totals->>'errors')::int,0) > 0 THEN 'partial'
    ELSE 'completed'
  END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'city_slug', s.city_slug, 'city_name', s.city_name, 'kind', s.kind,
      'material_slug', s.material_slug, 'service_slug', s.service_slug, 'label', s.label,
      'gen_state', s.gen_state, 'task_status', s.task_status, 'task_step', s.task_step,
      'task_attempts', s.task_attempts, 'task_error', s.task_error,
      'task_updated_at', s.task_updated_at, 'issues', s.issues
    ) ORDER BY (s.gen_state <> 'error'), s.city_name, s.label), '[]'::jsonb)
    INTO _problems
    FROM public.seo_slot_rows(NULL) s
   WHERE s.page_id IS NULL OR s.gen_state IN ('error','invalid');

  RETURN jsonb_build_object(
    'computed_at', now(), 'totals', _totals, 'cities', _rows,
    'active_run', _run, 'queued_tasks', COALESCE(_queued,0),
    'processing_tasks', COALESCE(_processing,0), 'stalled_tasks', COALESCE(_stalled,0),
    'pipeline_state', _pipeline_state, 'problems', _problems
  );
END
$fn$;