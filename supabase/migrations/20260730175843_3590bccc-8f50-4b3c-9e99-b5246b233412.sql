REVOKE ALL ON FUNCTION public.jsc_default_company_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.jsc_default_company_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.jsc_can_manage(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.jsc_can_manage(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.jsc_audit_trigger() FROM public, anon;