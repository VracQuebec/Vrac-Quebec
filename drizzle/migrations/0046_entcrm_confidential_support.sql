
DROP POLICY IF EXISTS "r" ON public.ent_crm_history;
CREATE POLICY "r_entreprise" ON public.ent_crm_history FOR SELECT TO authenticated
  USING (origin = 'entreprise' AND public.entcrm_can_write(company_id) AND NOT public.has_role(auth.uid(),'admin'));
CREATE POLICY "r_super_admin" ON public.ent_crm_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.entcrm_open_support(_company_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Consultation confidentielle : aucune écriture.
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN true;
END $$;
COMMENT ON FUNCTION public.entcrm_open_support(uuid) IS 'DEPRECATED: les consultations du super admin ne sont plus journalisées.';
