REVOKE ALL ON FUNCTION public.entr_notify_transport_request() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.entr_notify_submission() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.entr_notify_public_request() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.entr_notify_quote_request() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_notify(text,text,text,text,uuid,uuid,uuid,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_notify(text,text,text,text,uuid,uuid,uuid,text,text,text) TO service_role;