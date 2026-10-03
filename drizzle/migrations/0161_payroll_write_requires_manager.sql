CREATE OR REPLACE FUNCTION public.pay_can_manage(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.entcrm_role(_company) IN ('support','proprietaire','gestionnaire','comptabilite'), false)
$$;
REVOKE EXECUTE ON FUNCTION public.pay_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_can_manage(uuid) TO authenticated;

DO $do$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['pay_run_compute','pay_run_finalize','pay_employee_save'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f;
    d := replace(d, 'public.entcrm_can_finance(', 'public.pay_can_manage(');
    EXECUTE d;
  END LOOP;
END $do$;