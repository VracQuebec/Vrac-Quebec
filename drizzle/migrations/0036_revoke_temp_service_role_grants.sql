REVOKE EXECUTE ON FUNCTION public.get_my_submissions() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_comparateur_selection(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_submission_transport_request(uuid, text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.validate_selected_site(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.revoke_selected_site_validation(uuid) FROM service_role;