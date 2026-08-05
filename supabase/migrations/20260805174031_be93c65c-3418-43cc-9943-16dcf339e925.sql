CREATE OR REPLACE FUNCTION public.platform_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs integer;
  v_alerts integer;
  v_routes integer;
BEGIN
  DELETE FROM public.platform_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_logs = ROW_COUNT;

  DELETE FROM public.platform_alerts
  WHERE acknowledged_at IS NOT NULL AND acknowledged_at < now() - interval '90 days';
  GET DIAGNOSTICS v_alerts = ROW_COUNT;

  DELETE FROM public.route_cache WHERE last_used_at < now() - interval '60 days';
  GET DIAGNOSTICS v_routes = ROW_COUNT;

  RETURN jsonb_build_object(
    'logs_deleted', v_logs,
    'alerts_deleted', v_alerts,
    'routes_deleted', v_routes,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_cleanup() FROM PUBLIC, anon, authenticated;