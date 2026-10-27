-- Extract of the existing EXEC-06 invitation seam only; no punch/payroll activation.
CREATE TABLE public.ent_employee_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.jsc_companies(id),email text NOT NULL,role text NOT NULL CHECK(role IN ('chauffeur','mecanicien','operateur')),token_hash text NOT NULL UNIQUE,request_key text NOT NULL,created_by uuid NOT NULL,expires_at timestamptz NOT NULL,accepted_by uuid,accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,request_key));
GRANT SELECT ON public.ent_employee_invites TO authenticated; GRANT ALL ON public.ent_employee_invites TO service_role;
ALTER TABLE public.ent_employee_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.ent_employee_invites FOR SELECT TO authenticated USING(entcrm_can_admin(company_id));

CREATE OR REPLACE FUNCTION public.pun_invite_prepare(_company uuid,_email text,_role text,_key text,_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v ent_employee_invites;
BEGIN
 IF NOT entcrm_can_admin(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _role IS NULL OR _role NOT IN ('chauffeur','mecanicien','operateur') OR coalesce(_email,'') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(coalesce(_key,''))<8 OR length(coalesce(_token,''))<40 THEN RAISE EXCEPTION 'Invitation invalide'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('employee-invite:'||_company||':'||_key));
 SELECT * INTO v FROM ent_employee_invites WHERE company_id=_company AND request_key=_key;
 IF FOUND THEN IF v.email<>lower(trim(_email)) OR v.role<>_role OR v.token_hash<>encode(sha256(convert_to(_token,'UTF8')),'hex') THEN RAISE EXCEPTION 'Clé réutilisée' USING ERRCODE='P0409'; END IF; RETURN v.id; END IF;
 INSERT INTO ent_employee_invites(company_id,email,role,token_hash,request_key,created_by,expires_at) VALUES(_company,lower(trim(_email)),_role,encode(sha256(convert_to(_token,'UTF8')),'hex'),_key,auth.uid(),now()+interval '7 days') RETURNING id INTO v.id;
 INSERT INTO ent_crm_history(company_id,entity,entity_id,action,after,origin) VALUES(_company,'membres',v.id,'invitation_preparee',jsonb_build_object('email',lower(trim(_email)),'role',_role),'entreprise');
 RETURN v.id;
END $$;
CREATE OR REPLACE FUNCTION public.pun_invite_accept(_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i ent_employee_invites; mail text;
BEGIN
 SELECT * INTO i FROM ent_employee_invites WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') FOR UPDATE;
 SELECT lower(email) INTO mail FROM auth.users WHERE id=auth.uid();
 IF i.id IS NULL OR mail IS NULL OR mail<>i.email OR i.revoked_at IS NOT NULL OR (i.accepted_at IS NULL AND i.expires_at<=now()) THEN RAISE EXCEPTION 'Invitation inaccessible ou expirée' USING ERRCODE='42501'; END IF;
 IF i.accepted_at IS NOT NULL THEN IF i.accepted_by<>auth.uid() OR NOT pun_can_read(i.company_id) THEN RAISE EXCEPTION 'Accès retiré' USING ERRCODE='42501'; END IF; RETURN i.company_id; END IF;
 IF NOT entcrm_can_admin(i.company_id) AND NOT EXISTS(SELECT 1 FROM jsc_company_members m WHERE m.company_id=i.company_id AND m.user_id=i.created_by AND m.is_active AND m.archived_at IS NULL AND m.role='proprietaire') THEN RAISE EXCEPTION 'Employeur non autorisé'; END IF;
 IF EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=i.company_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Accès existant : décision de l’employeur requise'; END IF;
 INSERT INTO jsc_company_members(company_id,user_id,email,role,is_active) VALUES(i.company_id,auth.uid(),mail,i.role,true);
 UPDATE ent_employee_invites SET accepted_at=now(),accepted_by=auth.uid() WHERE id=i.id;
 INSERT INTO ent_crm_history(company_id,entity,entity_id,action,after,origin) VALUES(i.company_id,'membres',auth.uid(),'invitation_acceptee',jsonb_build_object('invitation',i.id,'role',i.role),'entreprise');
 RETURN i.company_id;
END $$;
CREATE OR REPLACE FUNCTION public.pun_invite_revoke(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i ent_employee_invites; BEGIN SELECT * INTO i FROM ent_employee_invites WHERE id=_id FOR UPDATE; IF i.id IS NULL OR NOT entcrm_can_admin(i.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF; UPDATE ent_employee_invites SET revoked_at=coalesce(revoked_at,now()) WHERE id=_id; END $$;


REVOKE ALL ON FUNCTION public.pun_invite_prepare(uuid,text,text,text,text),public.pun_invite_accept(text),public.pun_invite_revoke(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pun_invite_prepare(uuid,text,text,text,text),public.pun_invite_accept(text),public.pun_invite_revoke(uuid) TO authenticated;