CREATE OR REPLACE FUNCTION public.asr_role(_c uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT m.role FROM jsc_company_members m WHERE m.company_id=_c AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL LIMIT 1),
    CASE WHEN public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM asr_support_access WHERE admin_id=auth.uid() AND company_id=_c AND expires_at > now()) THEN 'support' END)
$$;