-- Existing own-profile policy bypassed inactive membership. No new broader policy.
ALTER POLICY "portal driver reads own file" ON public.jsc_drivers
 USING(user_id=auth.uid() AND id IN(SELECT public.jsc_my_driver_ids()));
-- Admin policy is not changed. Validate its existing jsc_can_manage separately before installation.