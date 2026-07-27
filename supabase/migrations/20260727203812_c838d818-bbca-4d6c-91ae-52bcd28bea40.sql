
-- 1) Distributed lock helpers used by seo-pipeline-orchestrator.
CREATE OR REPLACE FUNCTION public.seo_orchestrator_try_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(918273645);
$$;

CREATE OR REPLACE FUNCTION public.seo_orchestrator_unlock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(918273645);
$$;

REVOKE ALL ON FUNCTION public.seo_orchestrator_try_lock() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.seo_orchestrator_unlock()   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_orchestrator_try_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_orchestrator_unlock()   TO service_role;

-- 2) Stall detection + auto-alerting. Called by seo-pipeline-supervisor.
--    Requeues any running task older than 90s, requeues city batches with
--    no progress for 10 min, and raises an admin_notifications alert once
--    per batch when it exceeds the threshold.
CREATE OR REPLACE FUNCTION public.seo_pipeline_detect_stalls(_alert_minutes int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _requeued_tasks int := 0;
  _requeued_batches int := 0;
  _alerts int := 0;
  _row record;
BEGIN
  -- Requeue stuck 'running' tasks (>90s without progress).
  WITH upd AS (
    UPDATE public.seo_page_tasks
       SET status = 'queued',
           started_at = NULL,
           last_error = COALESCE(last_error, '') || ' | watchdog: reset (>90s running)'
     WHERE status = 'running'
       AND started_at < now() - interval '90 seconds'
    RETURNING 1
  ) SELECT COUNT(*) INTO _requeued_tasks FROM upd;

  -- Requeue city batches with no progress for _alert_minutes.
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
    -- Force requeue any remaining running tasks for the batch.
    UPDATE public.seo_page_tasks
       SET status = 'queued', started_at = NULL,
           last_error = COALESCE(last_error, '') || ' | watchdog: batch stall reset'
     WHERE batch_id = _row.id AND status = 'running';

    UPDATE public.seo_city_batches
       SET last_progress_at = now(),
           current_step = 'watchdog: relance auto'
     WHERE id = _row.id;

    _requeued_batches := _requeued_batches + 1;

    -- One alert per batch per stall event: only if we haven't already
    -- opened an unread alert for this batch in the last hour.
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_notifications
       WHERE meta->>'batch_id' = _row.id::text
         AND created_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO public.admin_notifications (level, title, body, link, meta)
      VALUES (
        'warning',
        'Lot SEO bloqué — relance automatique',
        format('Batch %s inactif depuis %s min. Relancé automatiquement.',
               _row.city_slug, ROUND(_row.idle_s / 60.0, 1)),
        '/admin/seo',
        jsonb_build_object('batch_id', _row.id, 'run_id', _row.run_id,
                           'city_slug', _row.city_slug, 'idle_seconds', _row.idle_s)
      );
      _alerts := _alerts + 1;
    END IF;
  END LOOP;

  -- Also: if the whole run has no progress for 3x _alert_minutes, escalate.
  FOR _row IN
    SELECT r.id, r.done_pages, r.total_pages
      FROM public.seo_pipeline_runs r
     WHERE r.status = 'running'
       AND COALESCE(r.last_progress_at, r.started_at, r.created_at)
             < now() - make_interval(mins => GREATEST(_alert_minutes, 1) * 3)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_notifications
       WHERE meta->>'run_id' = _row.id::text
         AND level = 'critical'
         AND created_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO public.admin_notifications (level, title, body, link, meta)
      VALUES (
        'critical',
        'Pipeline SEO figé — vérification requise',
        format('Aucune progression depuis plus de %s min (%s/%s pages).',
               GREATEST(_alert_minutes,1)*3, _row.done_pages, _row.total_pages),
        '/admin/seo',
        jsonb_build_object('run_id', _row.id)
      );
      _alerts := _alerts + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'requeued_tasks', _requeued_tasks,
    'requeued_batches', _requeued_batches,
    'alerts', _alerts,
    'checked_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.seo_pipeline_detect_stalls(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_detect_stalls(int) TO authenticated, service_role;

-- 3) Live dashboard summary consumed by the Admin UI.
CREATE OR REPLACE FUNCTION public.seo_pipeline_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.seo_pipeline_runs%ROWTYPE;
  _tasks jsonb;
  _alerts jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT * INTO _run FROM public.seo_pipeline_runs
   WHERE status IN ('queued','running','paused')
   ORDER BY created_at DESC LIMIT 1;

  IF _run.id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'queued',    COUNT(*) FILTER (WHERE status='queued'),
      'running',   COUNT(*) FILTER (WHERE status='running'),
      'succeeded', COUNT(*) FILTER (WHERE status='succeeded'),
      'failed',    COUNT(*) FILTER (WHERE status IN ('failed','needs_retry')),
      'skipped',   COUNT(*) FILTER (WHERE status='skipped'),
      'total',     COUNT(*)
    ) INTO _tasks
    FROM public.seo_page_tasks WHERE run_id = _run.id;
  ELSE
    _tasks := '{}'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO _alerts
    FROM (
      SELECT id, level, title, body, link, meta, created_at, read_at
        FROM public.admin_notifications
       WHERE created_at > now() - interval '24 hours'
       ORDER BY created_at DESC LIMIT 20
    ) a;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'active_run', to_jsonb(_run),
    'tasks', _tasks,
    'alerts', _alerts,
    'orchestrator_locked', NOT pg_try_advisory_lock(918273645),
    'unlocked', pg_advisory_unlock(918273645)
  );
END $$;

REVOKE ALL ON FUNCTION public.seo_pipeline_health() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_health() TO authenticated, service_role;
