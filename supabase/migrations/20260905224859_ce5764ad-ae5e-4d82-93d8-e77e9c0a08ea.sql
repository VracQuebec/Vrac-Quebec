REVOKE ALL ON FUNCTION public.fleet_apply_meter_reading() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_sync_expense_cost() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_delete_expense_cost() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_can_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_can_access(uuid) TO authenticated, service_role;