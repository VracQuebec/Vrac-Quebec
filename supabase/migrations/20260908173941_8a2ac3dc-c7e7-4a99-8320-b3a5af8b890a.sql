-- Les échecs définitifs restent visibles : seul le travail jamais terminé est classé « obsolète ».
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
     AND (
       t.status IN ('pending','claimed','analyzing','optimizing','qa','publishing')
       OR (t.status = 'error' AND t.attempts < t.max_attempts)
     );
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.seo_bulk_housekeeping() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_bulk_housekeeping() TO service_role;