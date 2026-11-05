REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.adm_activity_log, public.adm_readonly_users, public.adm_activity_settings FROM anon, authenticated;
REVOKE ALL ON public.adm_activity_log, public.adm_readonly_users, public.adm_activity_settings FROM anon;
REVOKE ALL ON SEQUENCE public.adm_activity_log_id_seq FROM anon, authenticated;