CREATE OR REPLACE FUNCTION public.log_context(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF NOT public.fleet_can_access(p_company) THEN RETURN jsonb_build_object('company_id', null); END IF;
  RETURN jsonb_build_object('company_id', p_company, 'company_name', (SELECT name FROM public.jsc_companies WHERE id = p_company),
    'role', public.fleet_member_role(p_company), 'enabled', public.log_enabled(p_company), 'manager', public.log_is_manager(p_company));
END $$;
REVOKE EXECUTE ON FUNCTION public.log_context(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.log_context(uuid) TO authenticated;