GRANT EXECUTE ON FUNCTION public.get_my_submissions() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_comparateur_selection(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_submission_transport_request(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_selected_site(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_selected_site_validation(uuid) TO service_role;