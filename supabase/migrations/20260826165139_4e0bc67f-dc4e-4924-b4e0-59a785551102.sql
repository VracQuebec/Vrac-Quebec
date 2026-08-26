-- Close stale historical queue entries without deleting history or pages.
UPDATE public.seo_page_tasks t
SET status = CASE WHEN EXISTS (
      SELECT 1 FROM public.seo_pages p
      WHERE p.city_slug = t.city_slug
        AND p.material_slug IS NOT DISTINCT FROM t.material_slug
        AND p.service_slug IS NOT DISTINCT FROM t.service_slug
    ) THEN 'skipped' ELSE 'cancelled' END,
    finished_at = COALESCE(t.finished_at, now()),
    last_error = CASE WHEN EXISTS (
      SELECT 1 FROM public.seo_pages p
      WHERE p.city_slug = t.city_slug
        AND p.material_slug IS NOT DISTINCT FROM t.material_slug
        AND p.service_slug IS NOT DISTINCT FROM t.service_slug
    ) THEN COALESCE(t.last_error, 'Clôturée automatiquement : page déjà existante')
      ELSE COALESCE(t.last_error, 'Clôturée automatiquement : lancement parent terminé') END,
    updated_at = now()
FROM public.seo_pipeline_runs r
WHERE t.run_id = r.id
  AND t.status IN ('queued','running')
  AND r.status NOT IN ('queued','running','paused');

-- Keep only the newest actionable task if legacy duplicate active tasks remain.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY city_slug, COALESCE(material_slug,''), COALESCE(service_slug,'')
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS rn
  FROM public.seo_page_tasks
  WHERE status IN ('queued','running')
), closed AS (
  UPDATE public.seo_page_tasks t
     SET status = CASE WHEN EXISTS (
           SELECT 1 FROM public.seo_pages p
           WHERE p.city_slug = t.city_slug
             AND p.material_slug IS NOT DISTINCT FROM t.material_slug
             AND p.service_slug IS NOT DISTINCT FROM t.service_slug
         ) THEN 'skipped' ELSE 'cancelled' END,
         finished_at = COALESCE(t.finished_at, now()),
         last_error = COALESCE(t.last_error, 'Tâche active dupliquée clôturée automatiquement'),
         updated_at = now()
    FROM ranked r
   WHERE t.id = r.id AND r.rn > 1
   RETURNING t.id
)
SELECT count(*) FROM closed;

CREATE UNIQUE INDEX IF NOT EXISTS seo_page_tasks_one_active_slot_idx
ON public.seo_page_tasks (
  city_slug,
  COALESCE(material_slug, ''),
  COALESCE(service_slug, '')
)
WHERE status IN ('queued','running');

CREATE OR REPLACE FUNCTION public.seo_pipeline_detect_stalls(_alert_minutes integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _requeued_tasks int := 0;
  _requeued_batches int := 0;
  _finalized_batches int := 0;
  _finalized_runs int := 0;
  _alerts int := 0;
  _row record;
BEGIN
  -- A running task with no heartbeat is recoverable and must not block its batch.
  WITH upd AS (
    UPDATE public.seo_page_tasks
       SET status = 'queued',
           started_at = NULL,
           next_attempt_at = now(),
           last_error = trim(both ' ' from COALESCE(last_error || ' | ', '') || 'watchdog: tâche bloquée remise en attente (>90s)'),
           updated_at = now()
     WHERE status = 'running'
       AND COALESCE(updated_at, started_at, created_at) < now() - interval '90 seconds'
    RETURNING 1
  ) SELECT COUNT(*) INTO _requeued_tasks FROM upd;

  -- A task is terminal for scheduling as soon as its page exists, regardless of an old task state.
  UPDATE public.seo_page_tasks t
     SET status = 'skipped',
         finished_at = COALESCE(t.finished_at, now()),
         last_error = COALESCE(t.last_error, 'Page déjà existante : tâche clôturée'),
         updated_at = now()
   WHERE t.status IN ('queued','running','needs_retry','failed')
     AND EXISTS (
       SELECT 1 FROM public.seo_pages p
       WHERE p.city_slug = t.city_slug
         AND p.material_slug IS NOT DISTINCT FROM t.material_slug
         AND p.service_slug IS NOT DISTINCT FROM t.service_slug
     );

  -- Finalize batches that contain no schedulable task, including batches with terminal errors.
  WITH candidates AS (
    SELECT b.id,
           count(t.id)::int total,
           count(t.id) FILTER (WHERE t.status = 'succeeded')::int succeeded,
           count(t.id) FILTER (WHERE t.status IN ('failed','needs_retry'))::int failed
      FROM public.seo_city_batches b
      JOIN public.seo_pipeline_runs r ON r.id = b.run_id
      LEFT JOIN public.seo_page_tasks t ON t.batch_id = b.id
     WHERE b.status = 'running' AND r.status IN ('running','queued')
     GROUP BY b.id
    HAVING count(t.id) FILTER (WHERE t.status IN ('queued','running')) = 0
  ), upd AS (
    UPDATE public.seo_city_batches b
       SET status = CASE WHEN c.failed > 0 AND c.succeeded = 0 THEN 'failed' ELSE 'completed' END,
           done_tasks = c.total,
           succeeded_tasks = c.succeeded,
           failed_tasks = c.failed,
           current_step = CASE WHEN c.failed > 0 THEN 'partiellement terminé' ELSE 'terminé' END,
           finished_at = COALESCE(b.finished_at, now()),
           last_progress_at = now(),
           updated_at = now()
      FROM candidates c WHERE b.id = c.id
    RETURNING 1
  ) SELECT count(*) INTO _finalized_batches FROM upd;

  -- Mark a run complete once no batch can still execute.
  WITH upd AS (
    UPDATE public.seo_pipeline_runs r
       SET status = 'completed',
           finished_at = COALESCE(r.finished_at, now()),
           current_city_slug = NULL,
           updated_at = now()
     WHERE r.status IN ('queued','running')
       AND NOT EXISTS (
         SELECT 1 FROM public.seo_city_batches b
         WHERE b.run_id = r.id AND b.status IN ('queued','running','paused')
       )
    RETURNING 1
  ) SELECT count(*) INTO _finalized_runs FROM upd;

  FOR _row IN
    SELECT b.id, b.city_slug, b.run_id,
           EXTRACT(EPOCH FROM (now() - COALESCE(b.last_progress_at, b.started_at, b.created_at)))::int AS idle_s
      FROM public.seo_city_batches b
      JOIN public.seo_pipeline_runs r ON r.id = b.run_id
     WHERE b.status = 'running'
       AND r.status IN ('running','queued')
       AND COALESCE(b.last_progress_at, b.started_at, b.created_at)
             < now() - make_interval(mins => GREATEST(_alert_minutes, 1))
  LOOP
    UPDATE public.seo_city_batches
       SET last_progress_at = now(), current_step = 'watchdog: relance automatique', updated_at = now()
     WHERE id = _row.id;
    _requeued_batches := _requeued_batches + 1;

    IF NOT EXISTS (
      SELECT 1 FROM public.admin_notifications
       WHERE meta->>'batch_id' = _row.id::text
         AND created_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO public.admin_notifications (level, title, body, link, meta)
      VALUES ('warning', 'Lot SEO bloqué — relance automatique',
        format('Batch %s inactif depuis %s min. Relancé automatiquement.', _row.city_slug, ROUND(_row.idle_s / 60.0, 1)),
        '/admin/seo', jsonb_build_object('batch_id', _row.id, 'run_id', _row.run_id, 'city_slug', _row.city_slug, 'idle_seconds', _row.idle_s));
      _alerts := _alerts + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'requeued_tasks', _requeued_tasks,
    'requeued_batches', _requeued_batches,
    'finalized_batches', _finalized_batches,
    'finalized_runs', _finalized_runs,
    'alerts', _alerts,
    'checked_at', now()
  );
END $function$;

CREATE OR REPLACE FUNCTION public.seo_control_center()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  SELECT COUNT(*) FROM seo_cities WHERE active AND served INTO _cities;

  WITH s AS (SELECT * FROM public.seo_slot_rows(NULL)),
  per_city AS (
    SELECT s.city_slug AS slug, min(s.city_name) AS name,
           count(*)::int AS planned,
           count(*) FILTER (WHERE s.page_id IS NOT NULL)::int AS generated,
           count(*) FILTER (WHERE s.pub_state = 'published')::int AS published,
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
      'drafts', coalesce(sum(unpublished),0),
      'errors', coalesce(sum(errors),0),
      'remaining', coalesce(sum(remaining),0)
    ),
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', slug, 'name', name, 'planned', planned, 'generated', generated,
      'published', published, 'remaining', remaining, 'errors', errors,
      'invalid', invalid, 'pending', pending, 'unpublished', unpublished,
      'pct', CASE WHEN planned > 0 THEN LEAST(100, ROUND(published::numeric * 100 / planned))::int ELSE 0 END,
      'status', CASE
        WHEN generated >= planned AND published >= planned AND errors = 0 THEN 'done'
        WHEN pending > 0 THEN 'running'
        WHEN generated = 0 AND errors > 0 THEN 'error'
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
    ELSE 'blocked'
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
END $function$;