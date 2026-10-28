-- Restores exactly the archived SELECT. Grants remain unchanged.
ALTER POLICY "missions read" ON public.drv_missions USING (has_role(auth.uid(), 'admin'::app_role) OR ((user_id = auth.uid()) AND ((requisition_id IS NULL) OR driver_mission_access(id))) OR (entrepreneur_id = cpn_my_entrepreneur()));
