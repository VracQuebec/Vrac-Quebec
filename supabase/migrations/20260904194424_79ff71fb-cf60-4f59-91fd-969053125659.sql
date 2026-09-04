
REVOKE ALL ON FUNCTION public.fleet_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_sync_cost() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_notify_repair() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_notify_inspection() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_scan_due() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_scan_due() TO authenticated, service_role;
