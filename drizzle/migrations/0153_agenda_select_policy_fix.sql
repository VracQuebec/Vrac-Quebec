CREATE OR REPLACE FUNCTION public.agd_is_attendee(_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM agd_attendees a WHERE a.event_id = _event AND a.user_id = auth.uid())
$$;
DROP POLICY IF EXISTS r ON public.agd_events;
CREATE POLICY r ON public.agd_events FOR SELECT TO authenticated USING (
  public.entcrm_can_commercial(company_id)
  OR (public.entcrm_can_read(company_id) AND (owner_user_id = auth.uid() OR public.agd_is_attendee(id))));