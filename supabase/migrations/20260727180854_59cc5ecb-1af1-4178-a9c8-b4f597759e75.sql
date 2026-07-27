CREATE OR REPLACE FUNCTION public.seo_optimization_autotune(_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current_conc int;
BEGIN
  SELECT concurrency INTO _current_conc
  FROM public.seo_optimization_runs
  WHERE id = _run_id;

  IF _current_conc IS NULL THEN
    RETURN NULL;
  END IF;

  IF _current_conc <> 1 THEN
    UPDATE public.seo_optimization_runs
       SET concurrency = 1,
           auto_adjusted_concurrency = true
     WHERE id = _run_id;
  END IF;

  RETURN 1;
END;
$function$;