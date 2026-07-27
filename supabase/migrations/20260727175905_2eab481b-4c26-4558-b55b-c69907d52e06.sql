CREATE OR REPLACE FUNCTION public.exec_claim_optim_tasks(_run_id uuid, _size integer)
RETURNS TABLE(id uuid, page_id uuid, attempts integer, max_attempts integer, qa_before integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT t.id
      FROM public.seo_optimization_tasks t
     WHERE t.run_id = _run_id
       AND t.status IN ('pending','error')
       AND t.attempts < t.max_attempts
       AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
     ORDER BY t.created_at ASC
     LIMIT GREATEST(1, LEAST(COALESCE(_size, 1), 10))
     FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.seo_optimization_tasks t
       SET status = 'claimed',
           started_at = now(),
           attempts = t.attempts + 1,
           error_source = NULL,
           error_http_status = NULL,
           error_function = NULL,
           error_stack = NULL,
           error_context = '{}'::jsonb
      FROM picked
     WHERE t.id = picked.id
     RETURNING t.id, t.page_id, t.attempts, t.max_attempts, t.qa_before
  )
  SELECT updated.id, updated.page_id, updated.attempts, updated.max_attempts, updated.qa_before
    FROM updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.exec_claim_optim_tasks(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_claim_optim_tasks(uuid, integer) TO service_role;