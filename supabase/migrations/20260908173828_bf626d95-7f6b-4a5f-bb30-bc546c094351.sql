-- Réconciliation : un run dont il ne reste aucune tâche réellement traitable doit se clore,
-- même si des tâches sont en erreur terminale. Les compteurs sont recalculés depuis les tâches.
CREATE OR REPLACE FUNCTION public.seo_bulk_reconcile()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _closed int := 0; _r record; _c record;
BEGIN
  FOR _r IN SELECT id, total FROM public.seo_optimization_runs WHERE status IN ('queued','running') LOOP
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS succeeded,
      COUNT(*) FILTER (WHERE status = 'skipped')::int  AS skipped,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE status = 'error' AND attempts >= max_attempts)::int AS failed,
      COUNT(*) FILTER (WHERE status = 'pending'
                          OR (status = 'error' AND attempts < max_attempts)
                          OR status IN ('claimed','analyzing','optimizing','qa','publishing'))::int AS actionable
      INTO _c
      FROM public.seo_optimization_tasks WHERE run_id = _r.id;

    UPDATE public.seo_optimization_runs
       SET total = GREATEST(_c.total, 0),
           succeeded = _c.succeeded,
           skipped = _c.skipped,
           failed = _c.failed,
           done = _c.succeeded + _c.skipped + _c.failed + _c.cancelled
     WHERE id = _r.id;

    IF _c.actionable = 0 THEN
      UPDATE public.seo_optimization_runs
         SET status = CASE WHEN _c.failed > 0 AND _c.succeeded = 0 THEN 'failed' ELSE 'completed' END,
             finished_at = COALESCE(finished_at, now())
       WHERE id = _r.id;
      PERFORM public.seo_optimization_finalize(_r.id);
      _closed := _closed + 1;
    END IF;
  END LOOP;
  RETURN _closed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seo_bulk_reconcile() TO authenticated, service_role;

-- Le chien de garde (exécuté chaque minute) réconcilie et nettoie automatiquement.
CREATE OR REPLACE FUNCTION public.seo_optimization_watchdog()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n int := 0;
  _r record;
BEGIN
  WITH upd AS (
    UPDATE public.seo_optimization_tasks
       SET status = CASE WHEN attempts >= max_attempts THEN 'error' ELSE 'pending' END,
           error = COALESCE(error, '') || CASE WHEN attempts >= max_attempts THEN ' | watchdog: timeout' ELSE '' END,
           next_attempt_at = now() + interval '5 seconds',
           finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
     WHERE status IN ('claimed','analyzing','optimizing','qa','publishing')
       AND started_at < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO _n FROM upd;

  UPDATE public.seo_optimization_runs
     SET status = 'running', last_progress_at = now()
   WHERE status = 'paused' AND updated_at < now() - interval '10 minutes';

  PERFORM public.seo_bulk_reconcile();
  PERFORM public.seo_bulk_housekeeping();

  FOR _r IN
    SELECT id FROM public.seo_optimization_runs
     WHERE status IN ('completed','failed','cancelled')
       AND report_id IS NULL
       AND finished_at IS NOT NULL
  LOOP
    PERFORM public.seo_optimization_finalize(_r.id);
  END LOOP;

  FOR _r IN SELECT id FROM public.seo_optimization_runs WHERE status = 'running' LOOP
    PERFORM public.seo_optimization_autotune(_r.id);
  END LOOP;

  RETURN _n;
END;
$$;