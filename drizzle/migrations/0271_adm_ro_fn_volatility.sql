CREATE OR REPLACE FUNCTION public.adm_ro_fn_volatility(_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN bool_and(p.provolatile IN ('s','i')) THEN 'lecture' WHEN count(*) = 0 THEN 'inconnue' ELSE 'ecriture_possible' END
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = _name
$$;
REVOKE ALL ON FUNCTION public.adm_ro_fn_volatility(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adm_ro_fn_volatility(text) TO service_role;