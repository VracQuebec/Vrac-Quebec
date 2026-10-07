DROP POLICY IF EXISTS "trips read" ON public.cpn_trips;
CREATE POLICY "trips read" ON public.cpn_trips FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR entrepreneur_id = public.cpn_my_entrepreneur()
  OR EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = cpn_trips.submission_id
      AND (
        s.created_by = auth.uid()
        OR s.assigned_entrepreneur IN (SELECT e.id FROM public.entrepreneurs e WHERE e.user_id = auth.uid())
      )
  )
);
COMMENT ON POLICY "trips read" ON public.cpn_trips IS 'Lecture des voyages : admin, entrepreneur du voyage, créateur ou entrepreneur attribué de la demande. Le courriel identique ne suffit pas (cpn_can_sub reste inchangée pour les autres fonctions).';