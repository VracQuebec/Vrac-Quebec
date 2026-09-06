CREATE OR REPLACE FUNCTION public.mkt_run_automations_manual()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mkt_is_admin() THEN
    RAISE EXCEPTION 'Acces reserve aux administrateurs.';
  END IF;
  RETURN public.mkt_run_automations();
END $$;

REVOKE ALL ON FUNCTION public.mkt_run_automations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_run_automations() TO service_role;
REVOKE ALL ON FUNCTION public.mkt_run_automations_manual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_run_automations_manual() TO authenticated, service_role;