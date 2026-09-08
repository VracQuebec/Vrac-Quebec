REVOKE ALL ON FUNCTION public.seo_bulk_housekeeping() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seo_bulk_reconcile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seo_optimization_watchdog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_bulk_housekeeping() TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_bulk_reconcile() TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_optimization_watchdog() TO service_role;
REVOKE ALL ON FUNCTION public.seo_bulk_start_pages(uuid[], text, integer, boolean) FROM PUBLIC, anon;