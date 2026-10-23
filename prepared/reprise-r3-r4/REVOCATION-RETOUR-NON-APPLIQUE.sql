-- Targeted rollback only after separately authorized installation. Does not restore data.
DO $$BEGIN
 IF pg_get_functiondef('public.jsc_my_driver_ids()'::regprocedure) NOT LIKE '%JOIN public.jsc_company_members%' THEN RAISE EXCEPTION 'Correctif chauffeur attendu absent : arrêt'; END IF;
END$$;
CREATE OR REPLACE FUNCTION public.jsc_my_driver_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $function$
 SELECT id FROM public.jsc_drivers WHERE user_id = auth.uid() AND archived_at IS NULL;
$function$;