REVOKE EXECUTE ON FUNCTION public.mkt_touch() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_is_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_next_request_number() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_assign_request_number() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_in_thread(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_can_see_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_owns_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_is_member(uuid), public.mkt_is_admin(), public.mkt_in_thread(uuid),
  public.mkt_can_see_request(uuid), public.mkt_owns_request(uuid) TO authenticated;