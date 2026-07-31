CREATE OR REPLACE FUNCTION public.jsc_flow_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_claims text;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  -- Accès direct base de données (cron, moteur serveur) : aucune requête API en cours
  IF v_claims IS NULL THEN RETURN true; END IF;
  IF auth.role() = 'service_role' THEN RETURN true; END IF;
  RETURN public.jsc_can_manage(auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.jsc_flow_allowed() FROM anon;

DO $do$
DECLARE r record; v_src text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('jsc_select_estimate','jsc_convert_estimate_to_quote','jsc_convert_quote_to_order','jsc_generate_deliveries','jsc_convert_order_to_invoice','jsc_advance_flow')
  LOOP
    v_src := replace(r.def,
      'NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = ''service_role'')',
      'NOT public.jsc_flow_allowed()');
    EXECUTE v_src;
  END LOOP;
END
$do$;