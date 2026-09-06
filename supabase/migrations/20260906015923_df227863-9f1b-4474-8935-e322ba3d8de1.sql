REVOKE EXECUTE ON FUNCTION public.mkt_resolve_pricing_rule(uuid, uuid, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mkt_award_commission_trg() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mkt_set_commission_status(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mkt_commission_board() FROM anon;