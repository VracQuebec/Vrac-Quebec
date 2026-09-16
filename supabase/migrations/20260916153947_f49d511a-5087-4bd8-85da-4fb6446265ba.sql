REVOKE EXECUTE ON FUNCTION public.platform_is_billing_manager(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_is_company_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_subscription_covers(uuid, text) FROM PUBLIC, anon;