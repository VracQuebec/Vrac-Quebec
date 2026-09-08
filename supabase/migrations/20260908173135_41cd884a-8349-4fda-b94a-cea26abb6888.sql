-- 1) Housekeeping: close orphan tasks that belong to runs that are no longer active.
CREATE OR REPLACE FUNCTION public.seo_bulk_housekeeping()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  UPDATE public.seo_optimization_tasks t
     SET status = 'cancelled',
         skip_reason = COALESCE(t.skip_reason, 'Run terminé — tâche obsolète'),
         finished_at = COALESCE(t.finished_at, now())
    FROM public.seo_optimization_runs r
   WHERE r.id = t.run_id
     AND r.status NOT IN ('queued','running','paused')
     AND t.status IN ('pending','claimed','analyzing','optimizing','qa','publishing','error');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seo_bulk_housekeeping() TO authenticated, service_role;

-- 2) Start a persisted queue from an explicit page selection (no client-side loop).
CREATE OR REPLACE FUNCTION public.seo_bulk_start_pages(
  _page_ids uuid[],
  _mode text DEFAULT 'optimize',
  _concurrency integer DEFAULT 3,
  _force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _run_id uuid;
  _count int;
  _skip_above int;
  _existing uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  PERFORM public.seo_bulk_housekeeping();

  SELECT id INTO _existing FROM public.seo_optimization_runs
   WHERE status IN ('queued','running','paused') ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('run_id', _existing, 'total', 0, 'already_active', true);
  END IF;

  IF _page_ids IS NULL OR array_length(_page_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Aucune page sélectionnée';
  END IF;

  _skip_above := CASE WHEN _force THEN 101
                      WHEN COALESCE(_mode,'optimize') = 'refresh' THEN 92
                      ELSE 95 END;

  INSERT INTO public.seo_optimization_runs
    (status, concurrency, qa_threshold, qa_skip_above, force_all, actions, filter,
     created_by, started_at, last_progress_at)
  VALUES ('queued', GREATEST(1, LEAST(10, COALESCE(_concurrency,3))), 90, _skip_above, COALESCE(_force,false), '{}',
     jsonb_build_object('mode', COALESCE(_mode,'optimize'), 'scope', 'selection',
                        'limit', array_length(_page_ids,1)),
     auth.uid(), now(), now())
  RETURNING id INTO _run_id;

  INSERT INTO public.seo_optimization_tasks(run_id, page_id, priority)
  SELECT _run_id, p.id,
         CASE WHEN p.qa_last_score IS NULL THEN 25
              WHEN p.qa_last_score < 50 THEN 20
              WHEN p.qa_last_score < 65 THEN 30
              WHEN p.qa_last_score < 80 THEN 40
              ELSE 60 END
    FROM public.seo_pages p
   WHERE p.id = ANY(_page_ids)
   ORDER BY 3 ASC
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO _count FROM public.seo_optimization_tasks WHERE run_id = _run_id;

  IF _count = 0 THEN
    UPDATE public.seo_optimization_runs SET status='completed', total=0, finished_at=now() WHERE id=_run_id;
  ELSE
    UPDATE public.seo_optimization_runs SET total=_count, status='running' WHERE id=_run_id;
  END IF;

  RETURN jsonb_build_object('run_id', _run_id, 'total', _count,
                            'mode', COALESCE(_mode,'optimize'), 'scope', 'selection');
END;
$$;

GRANT EXECUTE ON FUNCTION public.seo_bulk_start_pages(uuid[], text, integer, boolean) TO authenticated, service_role;

-- 3) Clean the historical backlog once.
SELECT public.seo_bulk_housekeeping();