-- Existing own-profile policy bypassed inactive membership. No new broader policy.
ALTER POLICY "portal driver reads own file" ON public.jsc_drivers
 USING(user_id=auth.uid() AND is_active AND archived_at IS NULL AND EXISTS(
  SELECT 1 FROM public.jsc_company_members m WHERE m.company_id=jsc_drivers.company_id
   AND m.user_id=auth.uid() AND m.role='chauffeur' AND m.is_active AND m.archived_at IS NULL));
-- Admin policy is not changed. Validate its existing jsc_can_manage separately before installation.