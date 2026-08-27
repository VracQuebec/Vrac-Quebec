REVOKE ALL ON FUNCTION public.crm_notify(text,text,text,text,text,text,text,uuid,text,text,text,timestamptz,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_resolve(text,uuid,text[],text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_notifications_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_notify_submission_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_notify_submission_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_notify_transport_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_notify_lead_trip() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_notification_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_notification_stats() TO authenticated;