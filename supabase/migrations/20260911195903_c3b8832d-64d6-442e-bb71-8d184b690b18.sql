REVOKE ALL ON public.admin_notifications FROM anon;
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;