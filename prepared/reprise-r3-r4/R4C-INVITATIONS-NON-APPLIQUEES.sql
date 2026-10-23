-- PREPARED ONLY. Requires the EXISTING EXEC-06 invitation schema/RPCs, not the punch migrations.
-- Explicit existing driver identity: never infer a company or driver from an email.
ALTER TABLE public.ent_employee_invites ADD COLUMN driver_id uuid REFERENCES public.jsc_drivers(id);
ALTER TABLE public.ent_employee_invites ADD COLUMN renewal_key uuid;

CREATE FUNCTION public.driver_invite_prepare(_company uuid,_driver uuid,_email text,_key text,_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d jsc_drivers; i uuid;
BEGIN
 IF NOT entcrm_can_admin(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 i:=pun_invite_prepare(_company,_email,'chauffeur',_key,_token);
 -- Canonical invitation row first, driver row second: same order as acceptance/revocation.
 PERFORM 1 FROM ent_employee_invites WHERE id=i FOR UPDATE;
 SELECT * INTO d FROM jsc_drivers WHERE id=_driver AND company_id=_company FOR UPDATE;
 IF d.id IS NULL OR d.archived_at IS NOT NULL OR NOT d.is_active OR d.user_id IS NOT NULL THEN RAISE EXCEPTION 'Profil chauffeur indisponible' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM ent_employee_invites WHERE driver_id=_driver AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now() AND request_key<>_key) THEN RAISE EXCEPTION 'Invitation déjà en attente' USING ERRCODE='P0409'; END IF;
 IF EXISTS(SELECT 1 FROM ent_employee_invites WHERE id=i AND driver_id IS NOT NULL AND driver_id<>_driver) THEN RAISE EXCEPTION 'Clé réutilisée' USING ERRCODE='P0409'; END IF;
 UPDATE ent_employee_invites SET driver_id=_driver WHERE id=i;
 RETURN i;
END $$;

-- Runs inside the canonical employee acceptance/revocation transaction, including legacy callers.
CREATE FUNCTION public.driver_invite_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d jsc_drivers;
BEGIN
 IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.role<>'chauffeur' THEN RAISE EXCEPTION 'Rôle chauffeur requis' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND OLD.driver_id IS NOT NULL AND (NEW.driver_id,NEW.company_id,NEW.email,NEW.role) IS DISTINCT FROM (OLD.driver_id,OLD.company_id,OLD.email,OLD.role) THEN RAISE EXCEPTION 'Identité invitation immuable' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN RAISE EXCEPTION 'Révocation définitive' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND OLD.accepted_at IS NOT NULL AND (NEW.accepted_at,NEW.accepted_by,NEW.token_hash) IS DISTINCT FROM (OLD.accepted_at,OLD.accepted_by,OLD.token_hash) THEN RAISE EXCEPTION 'Activation immuable' USING ERRCODE='42501'; END IF;
 IF NEW.accepted_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.accepted_at IS NULL) THEN
  SELECT * INTO d FROM jsc_drivers WHERE id=NEW.driver_id AND company_id=NEW.company_id FOR UPDATE;
  IF d.id IS NULL OR NOT d.is_active OR d.archived_at IS NOT NULL OR d.user_id IS NOT NULL OR NEW.revoked_at IS NOT NULL OR NEW.expires_at<=now()
   OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.accepted_by AND lower(email)=NEW.email AND email_confirmed_at IS NOT NULL)
   OR NOT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=NEW.company_id AND user_id=NEW.accepted_by AND role='chauffeur' AND is_active AND archived_at IS NULL)
   THEN RAISE EXCEPTION 'Activation chauffeur non autorisée' USING ERRCODE='42501'; END IF;
  UPDATE jsc_drivers SET user_id=NEW.accepted_by WHERE id=d.id;
  INSERT INTO ent_crm_history(company_id,entity,entity_id,action,actor_id,after,origin)
   VALUES(NEW.company_id,'chauffeur',d.id,'acces_personnel_active',NEW.accepted_by,jsonb_build_object('invitation',NEW.id,'user_id',NEW.accepted_by),'entreprise');
  PERFORM crm_notify('driver-invite-accepted-'||NEW.id,'transport','driver_access','normale','Accès chauffeur activé',NULL,'chauffeur',d.id,'/admin/missions',NULL,NULL,NULL,jsonb_build_object('company_id',NEW.company_id),false);
 END IF;
 IF TG_OP='UPDATE' AND OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND OLD.accepted_by IS NOT NULL THEN
  UPDATE jsc_company_members SET is_active=false WHERE company_id=NEW.company_id AND user_id=OLD.accepted_by AND role='chauffeur';
  UPDATE jsc_drivers SET is_active=false WHERE id=NEW.driver_id AND user_id=OLD.accepted_by AND company_id=NEW.company_id;
  INSERT INTO ent_crm_history(company_id,entity,entity_id,action,actor_id,after,origin)
   VALUES(NEW.company_id,'chauffeur',NEW.driver_id,'acces_personnel_revoque',auth.uid(),jsonb_build_object('invitation',NEW.id),'entreprise');
  PERFORM crm_notify('driver-invite-revoked-'||NEW.id,'transport','driver_access','normale','Accès chauffeur retiré',NULL,'chauffeur',NEW.driver_id,'/admin/missions',NULL,NULL,NULL,jsonb_build_object('company_id',NEW.company_id),false);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER driver_invite_identity_guard BEFORE INSERT OR UPDATE ON public.ent_employee_invites FOR EACH ROW EXECUTE FUNCTION public.driver_invite_identity_guard();

CREATE FUNCTION public.driver_invite_accept(_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i ent_employee_invites; c uuid;
BEGIN
 SELECT * INTO i FROM ent_employee_invites WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') FOR UPDATE;
 IF i.driver_id IS NULL OR i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation inaccessible' USING ERRCODE='42501'; END IF;
 c:=pun_invite_accept(_token);
 IF NOT EXISTS(SELECT 1 FROM jsc_drivers d JOIN jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id WHERE d.id=i.driver_id AND d.company_id=c AND d.user_id=auth.uid() AND d.is_active AND d.archived_at IS NULL AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur') THEN RAISE EXCEPTION 'Accès retiré' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('company_id',c,'driver_id',i.driver_id,'user_id',auth.uid());
END $$;

CREATE FUNCTION public.driver_invite_renew(_id uuid,_key uuid,_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i ent_employee_invites; h text:=encode(sha256(convert_to(_token,'UTF8')),'hex');
BEGIN
 SELECT * INTO i FROM ent_employee_invites WHERE id=_id FOR UPDATE;
 IF i.id IS NULL OR i.driver_id IS NULL OR NOT entcrm_can_admin(i.company_id) OR i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Renouvellement inaccessible' USING ERRCODE='42501'; END IF;
 IF _key IS NULL OR length(coalesce(_token,''))<40 THEN RAISE EXCEPTION 'Invitation invalide'; END IF;
 PERFORM 1 FROM jsc_drivers WHERE id=i.driver_id AND company_id=i.company_id FOR UPDATE;
 IF i.renewal_key=_key THEN IF i.token_hash<>h THEN RAISE EXCEPTION 'Clé réutilisée' USING ERRCODE='P0409'; END IF; RETURN i.id; END IF;
 IF i.token_hash=h OR EXISTS(SELECT 1 FROM ent_crm_history WHERE entity='chauffeur_invitation' AND entity_id=i.id AND after->>'operation'=_key::text) THEN RAISE EXCEPTION 'Nouveau lien requis' USING ERRCODE='P0409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsc_drivers WHERE id=i.driver_id AND company_id=i.company_id AND user_id IS NULL AND is_active AND archived_at IS NULL) THEN RAISE EXCEPTION 'Profil indisponible' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM ent_employee_invites WHERE driver_id=i.driver_id AND id<>i.id AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'Autre invitation en attente' USING ERRCODE='P0409'; END IF;
 UPDATE ent_employee_invites SET token_hash=h,renewal_key=_key,expires_at=now()+interval '7 days',created_by=auth.uid() WHERE id=i.id;
 INSERT INTO ent_crm_history(company_id,entity,entity_id,action,actor_id,after,origin) VALUES(i.company_id,'chauffeur_invitation',i.id,'lien_renouvele',auth.uid(),jsonb_build_object('operation',_key),'entreprise');
 RETURN i.id;
END $$;
CREATE FUNCTION public.driver_invite_revoke(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM pun_invite_revoke(_id); END $$;

CREATE FUNCTION public.driver_invite_options(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT entcrm_can_admin(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('drivers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',concat_ws(' ',first_name,last_name))) FROM jsc_drivers WHERE company_id=_company AND is_active AND archived_at IS NULL AND user_id IS NULL),'[]'),
 'invites',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'driver_id',driver_id,'email',email,'expires_at',expires_at,'accepted_at',accepted_at,'revoked_at',revoked_at)) FROM ent_employee_invites WHERE company_id=_company AND driver_id IS NOT NULL),'[]'));
END $$;

REVOKE ALL ON FUNCTION public.driver_invite_prepare(uuid,uuid,text,text,text),public.driver_invite_accept(text),public.driver_invite_renew(uuid,uuid,text),public.driver_invite_revoke(uuid),public.driver_invite_options(uuid),public.driver_invite_identity_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_invite_prepare(uuid,uuid,text,text,text),public.driver_invite_accept(text),public.driver_invite_renew(uuid,uuid,text),public.driver_invite_revoke(uuid),public.driver_invite_options(uuid) TO authenticated;