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
  INSERT INTO public.platform_change_log (scope, entity_table, entity_id, action, changes, company_id, actor_id, actor_email)
  VALUES ('access_grant', 'platform_access_grants', NEW.id,
          CASE WHEN TG_OP='INSERT' THEN 'grant' ELSE 'revoke' END,
          jsonb_build_object('kind',NEW.kind,'reason',NEW.reason,'revoke_reason',NEW.revoke_reason),
          NEW.company_id, auth.uid(), public.current_user_email());
  RETURN NEW;
END $$;