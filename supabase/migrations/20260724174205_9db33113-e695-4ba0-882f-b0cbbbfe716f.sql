
REVOKE EXECUTE ON FUNCTION public.dispatch_generate_scenarios(uuid,int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.dispatch_apply_scenario(uuid,timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trip_advance_status(uuid,public.trip_status,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ops_dashboard_stats() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ops_planning_range(timestamptz,timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.dispatch_generate_scenarios(uuid,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_apply_scenario(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_advance_status(uuid,public.trip_status,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_planning_range(timestamptz,timestamptz) TO authenticated;
