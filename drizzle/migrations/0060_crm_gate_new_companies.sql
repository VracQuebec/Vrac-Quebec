ALTER TABLE public.platform_access_settings ADD COLUMN IF NOT EXISTS enforce_created_after timestamptz;
COMMENT ON COLUMN public.platform_access_settings.enforce_created_after IS 'Les entreprises créées après cette date sont soumises au contrôle d''abonnement (nouvelles inscriptions). Les entreprises existantes ne sont pas touchées.';

CREATE OR REPLACE FUNCTION public.entcrm_access_status(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; g record; st record; enforced boolean; created timestamptz;
BEGIN
  IF auth.uid() IS NULL OR (public.entcrm_role(_company_id) IS NULL AND NOT public.has_role(auth.uid(),'admin')) THEN
    RETURN jsonb_build_object('paid', false, 'source', 'none');
  END IF;
  SELECT * INTO st FROM public.platform_access_settings LIMIT 1;
  SELECT created_at INTO created FROM public.jsc_companies WHERE id=_company_id;
  enforced := coalesce(st.enforcement_scope = 'all' OR _company_id = ANY(st.enforced_company_ids)
              OR (st.enforce_created_after IS NOT NULL AND created > st.enforce_created_after), false);
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
END $function$;