
ALTER FUNCTION public.is_fill_request_type(text) SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION public.set_dompe_availability(uuid, text, boolean, boolean, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dompe_revalidation_queue(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dompe_revalidation_days(public.submissions) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dompe_freshness(timestamptz, integer, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_usable_fill_request(public.submissions, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_submission_availability() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_entrepreneur_leads() FROM anon;
