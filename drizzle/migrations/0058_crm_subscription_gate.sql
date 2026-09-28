-- CRM-FINAL : l'abonnement commande les opérations payantes du CRM.
CREATE TABLE public.platform_access_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enforcement_scope text NOT NULL DEFAULT 'test_companies' CHECK (enforcement_scope IN ('test_companies','all')),
  enforced_company_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.platform_access_settings TO authenticated;
GRANT ALL ON public.platform_access_settings TO service_role;
ALTER TABLE public.platform_access_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read" ON public.platform_access_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write" ON public.platform_access_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT UPDATE ON public.platform_access_settings TO authenticated;
INSERT INTO public.platform_access_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.platform_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  kind text NOT NULL DEFAULT 'interne' CHECK (kind IN ('interne','offerte')),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  granted_by uuid NOT NULL DEFAULT auth.uid(),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);
CREATE INDEX ON public.platform_access_grants(company_id);
GRANT SELECT, INSERT, UPDATE ON public.platform_access_grants TO authenticated;
GRANT ALL ON public.platform_access_grants TO service_role;
ALTER TABLE public.platform_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read admin or member" ON public.platform_access_grants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.entcrm_role(company_id) IS NOT NULL);
CREATE POLICY "insert admin" ON public.platform_access_grants FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND granted_by = auth.uid() AND revoked_at IS NULL);
CREATE POLICY "revoke admin" ON public.platform_access_grants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Historique figé : seul le retrait est modifiable, une seule fois.
CREATE OR REPLACE FUNCTION public.platform_access_grant_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Autorisation déjà retirée'; END IF;
    IF NEW.company_id <> OLD.company_id OR NEW.reason <> OLD.reason OR NEW.kind <> OLD.kind
       OR NEW.granted_by <> OLD.granted_by OR NEW.granted_at <> OLD.granted_at THEN
      RAISE EXCEPTION 'Une autorisation ne se modifie pas : retirez-la puis créez-en une nouvelle';
    END IF;
    IF NEW.revoked_at IS NOT NULL THEN
      NEW.revoked_by := auth.uid();
      IF coalesce(btrim(NEW.revoke_reason),'') = '' THEN RAISE EXCEPTION 'Motif du retrait requis'; END IF;
    END IF;
  END IF;
  INSERT INTO public.platform_change_log (scope, action, entity_id, details, actor_id)
  VALUES ('access_grant', CASE WHEN TG_OP='INSERT' THEN 'grant' ELSE 'revoke' END, NEW.company_id,
          jsonb_build_object('grant_id',NEW.id,'kind',NEW.kind,'reason',NEW.reason,'revoke_reason',NEW.revoke_reason), auth.uid());
  RETURN NEW;
END $$;
CREATE TRIGGER platform_access_grant_guard BEFORE INSERT OR UPDATE ON public.platform_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.platform_access_grant_guard();

-- Source de vérité unique des droits payants d'une entreprise.
CREATE OR REPLACE FUNCTION public.entcrm_access_status(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; g record; st record; enforced boolean;
BEGIN
  IF auth.uid() IS NULL OR (public.entcrm_role(_company_id) IS NULL AND NOT public.has_role(auth.uid(),'admin')) THEN
    RETURN jsonb_build_object('paid', false, 'source', 'none');
  END IF;
  SELECT * INTO st FROM public.platform_access_settings LIMIT 1;
  enforced := coalesce(st.enforcement_scope = 'all' OR _company_id = ANY(st.enforced_company_ids), false);
  SELECT * INTO g FROM public.platform_access_grants
   WHERE company_id=_company_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
   ORDER BY granted_at DESC LIMIT 1;
  SELECT * INTO s FROM public.platform_subscriptions
   WHERE company_id=_company_id AND current_period_end > now()
     AND status IN ('active','trialing','past_due','canceled')
   ORDER BY current_period_end DESC LIMIT 1;
  IF s.id IS NOT NULL THEN
    RETURN jsonb_build_object('paid',true,'source','subscription','status',s.status,'period_end',s.current_period_end,'enforced',enforced);
  ELSIF g.id IS NOT NULL THEN
    RETURN jsonb_build_object('paid',true,'source','grant','kind',g.kind,'grant_id',g.id,'enforced',enforced);
  ELSIF NOT enforced THEN
    RETURN jsonb_build_object('paid',true,'source','transition','enforced',false);
  END IF;
  RETURN jsonb_build_object('paid',false,'source','none','enforced',true);
END $$;
GRANT EXECUTE ON FUNCTION public.entcrm_access_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.entcrm_paid(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- L'assistance du super admin ne dépend pas de l'abonnement du partenaire.
  SELECT public.has_role(auth.uid(),'admin') OR coalesce((public.entcrm_access_status(_company_id)->>'paid')::boolean, false)
$$;

-- Écriture = rôle ET droits payants. Le rôle n'est jamais élargi.
CREATE OR REPLACE FUNCTION public.entcrm_can_write(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire'), false)
     AND public.entcrm_paid(_company_id)
$$;

-- Consultation de l'historique : conservée sans abonnement.
DROP POLICY IF EXISTS r_entreprise ON public.ent_crm_history;
CREATE POLICY r_entreprise ON public.ent_crm_history FOR SELECT TO authenticated
  USING (origin = 'entreprise'
    AND coalesce(public.entcrm_role(company_id) IN ('proprietaire','gestionnaire'), false)
    AND NOT public.has_role(auth.uid(),'admin'));

-- Mise à jour terrain des tâches assignées : aussi soumise aux droits payants.
DROP POLICY IF EXISTS u ON public.ent_crm_tasks;
CREATE POLICY u ON public.ent_crm_tasks FOR UPDATE TO authenticated
  USING (public.entcrm_can_write(company_id) OR (public.entcrm_can_field(company_id) AND assignee_user_id = auth.uid() AND public.entcrm_paid(company_id)))
  WITH CHECK (public.entcrm_can_write(company_id) OR (public.entcrm_can_field(company_id) AND assignee_user_id = auth.uid() AND public.entcrm_paid(company_id)));