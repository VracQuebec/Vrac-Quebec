-- PREPARED ONLY: disposable local validation; never apply on shared Cloud without authorization.
-- Reuse pun_entries/pun_log, company memberships and the existing payroll source.
CREATE OR REPLACE FUNCTION public.pun_can_read(_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(entcrm_role(_company) IS NOT NULL,false) $$;
CREATE OR REPLACE FUNCTION public.pun_can_manage(_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(entcrm_role(_company) IN ('support','proprietaire','gestionnaire'),false) $$;
CREATE OR REPLACE FUNCTION public.pun_can_work(_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(entcrm_role(_company) IN ('support','proprietaire','gestionnaire','chauffeur','mecanicien','operateur'),false) $$;
REVOKE ALL ON FUNCTION public.pun_can_read(uuid),public.pun_can_manage(uuid),public.pun_can_work(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pun_can_read(uuid),public.pun_can_manage(uuid),public.pun_can_work(uuid) TO authenticated;
DROP POLICY r ON public.pun_entries;
CREATE POLICY r ON public.pun_entries FOR SELECT TO authenticated USING(pun_can_read(company_id) AND (user_id=auth.uid() OR pun_can_manage(company_id)));
DROP POLICY r ON public.pun_log;
CREATE POLICY r ON public.pun_log FOR SELECT TO authenticated USING(pun_can_read(company_id) AND (pun_can_manage(company_id) OR EXISTS(SELECT 1 FROM pun_entries e WHERE e.id=entry_id AND e.user_id=auth.uid())));
ALTER TABLE public.pun_entries ADD COLUMN project_id uuid REFERENCES public.ent_crm_projects(id);
ALTER TABLE public.pun_entries ADD COLUMN task_id uuid REFERENCES public.ent_crm_tasks(id);
ALTER TABLE public.pun_entries ADD COLUMN work_entry_id uuid REFERENCES public.pun_entries(id);

CREATE TABLE public.pun_corrections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.jsc_companies(id),entry_id uuid NOT NULL REFERENCES public.pun_entries(id),user_id uuid NOT NULL,request_key text NOT NULL,started_at timestamptz NOT NULL,ended_at timestamptz NOT NULL,reason text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','refused')),decided_by uuid,decided_at timestamptz,decision_reason text,replacement_id uuid REFERENCES public.pun_entries(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,user_id,request_key));
GRANT SELECT ON public.pun_corrections TO authenticated; GRANT ALL ON public.pun_corrections TO service_role;
ALTER TABLE public.pun_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.pun_corrections FOR SELECT TO authenticated USING(pun_can_read(company_id) AND (user_id=auth.uid() OR pun_can_manage(company_id)));
CREATE UNIQUE INDEX pun_correction_pending ON public.pun_corrections(entry_id) WHERE status='pending';
CREATE TABLE public.pun_exports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.jsc_companies(id),created_by uuid NOT NULL,request_key text NOT NULL,period_from date NOT NULL,period_to date NOT NULL,snapshot jsonb NOT NULL,stale boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,created_by,request_key));
GRANT SELECT ON public.pun_exports TO authenticated; GRANT ALL ON public.pun_exports TO service_role;
ALTER TABLE public.pun_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.pun_exports FOR SELECT TO authenticated USING(pun_can_read(company_id) AND (created_by=auth.uid() OR pun_can_manage(company_id)));
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

-- Preserve canonical mechanisms behind permission/serialization guards, never a second time engine.
ALTER FUNCTION public.pun_in(uuid,text,text,uuid,text,boolean,double precision,double precision,double precision) RENAME TO pun_in_base;
ALTER FUNCTION public.pun_out(uuid,double precision,double precision,double precision) RENAME TO pun_out_base;
ALTER FUNCTION public.pun_break(uuid,boolean) RENAME TO pun_break_base;
ALTER FUNCTION public.pun_manual(uuid,uuid,text,timestamptz,timestamptz,text,text,uuid,text,uuid) RENAME TO pun_manual_base;
ALTER FUNCTION public.pun_decide(uuid,uuid[],boolean,text) RENAME TO pun_decide_base;
REVOKE ALL ON FUNCTION public.pun_in_base,public.pun_out_base,public.pun_break_base,public.pun_manual_base,public.pun_decide_base FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pun_in(_company uuid,_place text,_site text,_client uuid,_note text,_consent boolean,_lat double precision,_lng double precision,_acc double precision) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT pun_can_work(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('punch:'||auth.uid()));
 IF EXISTS(SELECT 1 FROM pun_entries WHERE user_id=auth.uid() AND company_id<>_company AND ended_at IS NULL AND archived_at IS NULL AND kind='travail') THEN RAISE EXCEPTION 'Un pointage est en cours dans une autre entreprise'; END IF;
 RETURN pun_in_base(_company,_place,_site,_client,_note,_consent,_lat,_lng,_acc); END $$;
CREATE OR REPLACE FUNCTION public.pun_out(_company uuid,_lat double precision,_lng double precision,_acc double precision) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT pun_can_work(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF; PERFORM pg_advisory_xact_lock(hashtext('punch:'||auth.uid())); RETURN pun_out_base(_company,_lat,_lng,_acc); END $$;
CREATE OR REPLACE FUNCTION public.pun_break(_company uuid,_start boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; w uuid; BEGIN IF NOT pun_can_work(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF; PERFORM pg_advisory_xact_lock(hashtext('punch:'||auth.uid())); SELECT id INTO w FROM pun_entries WHERE company_id=_company AND user_id=auth.uid() AND kind='travail' AND ended_at IS NULL AND archived_at IS NULL; v:=pun_break_base(_company,_start); IF v IS NOT NULL THEN UPDATE pun_entries SET work_entry_id=w WHERE id=v; END IF; RETURN v; END $$;
CREATE OR REPLACE FUNCTION public.pun_manual(_company uuid,_user uuid,_kind text,_start timestamptz,_end timestamptz,_place text,_site text,_client uuid,_reason text,_replace uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; old pun_entries; BEGIN
 IF NOT pun_can_work(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF; PERFORM pg_advisory_xact_lock(hashtext('punch:'||_user));
 IF _client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ent_crm_clients WHERE company_id=_company AND id=_client AND archived_at IS NULL) THEN RAISE EXCEPTION 'Client inaccessible'; END IF;
 IF _replace IS NOT NULL THEN SELECT * INTO old FROM pun_entries WHERE id=_replace AND company_id=_company FOR UPDATE;
 IF EXISTS(SELECT 1 FROM pun_entries WHERE work_entry_id=_replace AND archived_at IS NULL AND (started_at<_start OR ended_at>_end OR ended_at IS NULL)) THEN RAISE EXCEPTION 'Correction incompatible avec les pauses constatées'; END IF; END IF;
 v:=pun_manual_base(_company,_user,_kind,_start,_end,_place,_site,_client,_reason,_replace);
 IF old.id IS NOT NULL THEN UPDATE pun_entries SET project_id=old.project_id,task_id=old.task_id WHERE id=v; UPDATE pun_entries SET work_entry_id=v,status='soumis',decided_at=NULL,decided_by=NULL WHERE work_entry_id=old.id AND archived_at IS NULL; END IF;
 INSERT INTO pun_log(entry_id,company_id,action,detail) VALUES(v,_company,'correction_detail',jsonb_build_object('ancienne',CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,'nouvelle',jsonb_build_object('started_at',_start,'ended_at',_end),'motif',_reason,'remplace',old.id)); RETURN v;
END $$;
CREATE OR REPLACE FUNCTION public.pun_decide(_company uuid,_ids uuid[],_approve boolean,_reason text) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE ids uuid[]; BEGIN IF NOT pun_can_manage(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF; SELECT array_agg(id) INTO ids FROM pun_entries WHERE company_id=_company AND archived_at IS NULL AND (id=ANY(_ids) OR work_entry_id=ANY(_ids)); RETURN pun_decide_base(_company,ids,_approve,_reason); END $$;

CREATE OR REPLACE FUNCTION public.pun_change_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND (OLD.started_at,OLD.ended_at,OLD.status,OLD.archived_at) IS DISTINCT FROM (NEW.started_at,NEW.ended_at,NEW.status,NEW.archived_at) THEN
 IF EXISTS(SELECT 1 FROM pay_runs WHERE company_id=OLD.company_id AND status='finalise' AND daterange(period_from,period_to,'[]') && daterange((OLD.started_at AT TIME ZONE 'America/Toronto')::date,(coalesce(OLD.ended_at,OLD.started_at) AT TIME ZONE 'America/Toronto')::date,'[]')) THEN RAISE EXCEPTION 'Heures liées à une paie finalisée : traitement séparé requis' USING ERRCODE='P0410'; END IF;
 UPDATE pun_exports SET stale=true WHERE company_id=OLD.company_id AND NOT stale AND daterange(period_from,period_to,'[]') && daterange((OLD.started_at AT TIME ZONE 'America/Toronto')::date,(coalesce(OLD.ended_at,OLD.started_at) AT TIME ZONE 'America/Toronto')::date,'[]');
 END IF; RETURN NEW; END $$;
CREATE TRIGGER pun_change_guard BEFORE UPDATE ON public.pun_entries FOR EACH ROW EXECUTE FUNCTION public.pun_change_guard();
CREATE OR REPLACE FUNCTION public.pun_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Journal immuable'; END $$;
CREATE TRIGGER pun_log_immutable BEFORE UPDATE OR DELETE ON public.pun_log FOR EACH ROW EXECUTE FUNCTION public.pun_log_immutable();

CREATE OR REPLACE FUNCTION public.pun_correction_request(_entry uuid,_start timestamptz,_end timestamptz,_reason text,_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e pun_entries; r pun_corrections; BEGIN
 SELECT * INTO e FROM pun_entries WHERE id=_entry FOR UPDATE;
 IF e.id IS NULL OR NOT pun_can_work(e.company_id) OR e.user_id<>auth.uid() OR e.ended_at IS NULL OR e.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _start IS NULL OR _end IS NULL OR _end<=_start OR _end>now()+interval '5 minutes' OR _end-_start>interval '24 hours' OR length(trim(coalesce(_reason,'')))<3 OR length(coalesce(_key,''))<8 THEN RAISE EXCEPTION 'Correction invalide'; END IF;
 SELECT * INTO r FROM pun_corrections WHERE company_id=e.company_id AND user_id=auth.uid() AND request_key=_key;
 IF FOUND THEN IF r.entry_id<>_entry OR r.started_at<>_start OR r.ended_at<>_end OR r.reason<>trim(_reason) THEN RAISE EXCEPTION 'Clé réutilisée' USING ERRCODE='P0409'; END IF; RETURN r.id; END IF;
 INSERT INTO pun_corrections(company_id,entry_id,user_id,request_key,started_at,ended_at,reason) VALUES(e.company_id,e.id,auth.uid(),_key,_start,_end,trim(_reason)) RETURNING id INTO r.id;
 INSERT INTO pun_log(entry_id,company_id,action,detail) VALUES(e.id,e.company_id,'correction_demandee',jsonb_build_object('demande',r.id,'avant',to_jsonb(e),'apres',jsonb_build_object('started_at',_start,'ended_at',_end),'motif',_reason)); RETURN r.id; END $$;
CREATE OR REPLACE FUNCTION public.pun_correction_decide(_id uuid,_accept boolean,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r pun_corrections; e pun_entries; v uuid; BEGIN
 SELECT * INTO r FROM pun_corrections WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR NOT pun_can_manage(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF r.status<>'pending' THEN IF (r.status='accepted') IS DISTINCT FROM _accept THEN RAISE EXCEPTION 'Décision différente' USING ERRCODE='P0409'; END IF; RETURN r.replacement_id; END IF;
 IF _accept IS NULL OR length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Motif requis'; END IF;
 SELECT * INTO e FROM pun_entries WHERE id=r.entry_id AND archived_at IS NULL FOR UPDATE; IF e.id IS NULL THEN RAISE EXCEPTION 'Entrée déjà remplacée' USING ERRCODE='P0409'; END IF;
 IF _accept THEN v:=pun_manual(r.company_id,r.user_id,e.kind,r.started_at,r.ended_at,e.place_type,e.site_label,e.client_id,r.reason||' — '||_reason,e.id); END IF;
 UPDATE pun_corrections SET status=CASE WHEN _accept THEN 'accepted' ELSE 'refused' END,decided_at=now(),decided_by=auth.uid(),decision_reason=trim(_reason),replacement_id=v WHERE id=r.id;
 INSERT INTO pun_log(entry_id,company_id,action,detail) VALUES(e.id,e.company_id,'correction_traitee',jsonb_build_object('demande',r.id,'acceptee',_accept,'motif',_reason,'remplacement',v)); RETURN v; END $$;

-- One Toronto engine: split actual elapsed intervals at local day boundaries (23/25-hour days allowed).
CREATE OR REPLACE FUNCTION public.pun_summary(_company uuid,_from date,_to date,_ot_hours numeric DEFAULT 40)
RETURNS TABLE(user_id uuid,full_name text,week date,work_min numeric,break_min numeric,net_min numeric,approved_min numeric,pending_min numeric,regular_min numeric,overtime_min numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH segments AS(SELECT p.user_id,p.kind,p.status,date_trunc('week',d)::date wk,extract(epoch FROM (least(p.ended_at,(d::date+1)::timestamp AT TIME ZONE 'America/Toronto')-greatest(p.started_at,d::date::timestamp AT TIME ZONE 'America/Toronto')))/60 m FROM pun_entries p CROSS JOIN generate_series(_from::timestamp,_to::timestamp,interval '1 day') d WHERE p.company_id=_company AND pun_can_read(_company) AND (p.user_id=auth.uid() OR pun_can_manage(_company)) AND p.archived_at IS NULL AND p.ended_at IS NOT NULL AND p.status<>'refuse' AND p.started_at<(d::date+1)::timestamp AT TIME ZONE 'America/Toronto' AND p.ended_at>d::date::timestamp AT TIME ZONE 'America/Toronto'),
 a AS(SELECT user_id,wk,coalesce(sum(m) FILTER(WHERE kind='travail'),0) w,coalesce(sum(m) FILTER(WHERE kind='pause'),0) b,coalesce(sum(m) FILTER(WHERE kind='travail' AND status='approuve'),0)-coalesce(sum(m) FILTER(WHERE kind='pause' AND status='approuve'),0) ap FROM segments GROUP BY user_id,wk)
 SELECT a.user_id,mem.full_name,wk,round(w,2),round(b,2),round(greatest(w-b,0),2),round(greatest(ap,0),2),round(greatest(w-b,0)-greatest(ap,0),2),round(least(greatest(ap,0),_ot_hours*60),2),round(greatest(ap-_ot_hours*60,0),2) FROM a LEFT JOIN jsc_company_members mem ON mem.company_id=_company AND mem.user_id=a.user_id WHERE _to>=_from AND _to-_from<=366 ORDER BY mem.full_name,wk
$$;
CREATE OR REPLACE FUNCTION public.pun_export_prepare(_company uuid,_from date,_to date,_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e pun_exports; snap jsonb; BEGIN
 IF NOT pun_can_manage(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR _to-_from>366 OR length(coalesce(_key,''))<8 THEN RAISE EXCEPTION 'Export invalide'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('pun-export:'||_company||':'||_key));
 SELECT * INTO e FROM pun_exports WHERE company_id=_company AND created_by=auth.uid() AND request_key=_key;
 IF FOUND THEN IF e.period_from<>_from OR e.period_to<>_to THEN RAISE EXCEPTION 'Clé réutilisée' USING ERRCODE='P0409'; END IF; RETURN to_jsonb(e); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO snap FROM pun_summary(_company,_from,_to) s WHERE s.approved_min>0;
 INSERT INTO pun_exports(company_id,created_by,request_key,period_from,period_to,snapshot) VALUES(_company,auth.uid(),_key,_from,_to,snap) RETURNING * INTO e;
 RETURN to_jsonb(e); END $$;
CREATE OR REPLACE FUNCTION public.pun_work_options(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT pun_can_work(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF; RETURN jsonb_build_object('projects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM ent_crm_projects WHERE company_id=_company AND archived_at IS NULL AND (pun_can_manage(_company) OR EXISTS(SELECT 1 FROM ent_crm_tasks t WHERE t.project_id=ent_crm_projects.id AND t.company_id=_company AND t.assignee_user_id=auth.uid()))),'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'project_id',project_id)),'[]') FROM ent_crm_tasks WHERE company_id=_company AND done_at IS NULL AND (assignee_user_id=auth.uid() OR pun_can_manage(_company)))); END $$;
CREATE OR REPLACE FUNCTION public.pun_context_set(_entry uuid,_project uuid,_task uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e pun_entries; BEGIN SELECT * INTO e FROM pun_entries WHERE id=_entry FOR UPDATE; IF e.id IS NULL OR e.user_id<>auth.uid() OR NOT pun_can_work(e.company_id) OR e.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ent_crm_projects p WHERE p.id=_project AND p.company_id=e.company_id AND p.archived_at IS NULL AND (pun_can_manage(e.company_id) OR EXISTS(SELECT 1 FROM ent_crm_tasks t WHERE t.project_id=p.id AND t.company_id=e.company_id AND t.assignee_user_id=auth.uid()))) THEN RAISE EXCEPTION 'Chantier inaccessible'; END IF;
 IF _task IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ent_crm_tasks WHERE id=_task AND company_id=e.company_id AND (assignee_user_id=auth.uid() OR pun_can_manage(e.company_id)) AND project_id IS NOT DISTINCT FROM _project) THEN RAISE EXCEPTION 'Tâche incompatible'; END IF;
 UPDATE pun_entries SET project_id=_project,task_id=_task WHERE id=e.id; INSERT INTO pun_log(entry_id,company_id,action,detail) VALUES(e.id,e.company_id,'contexte',jsonb_build_object('chantier',_project,'tache',_task)); END $$;

REVOKE ALL ON FUNCTION public.pun_invite_prepare,public.pun_invite_accept,public.pun_invite_revoke,public.pun_in,public.pun_out,public.pun_break,public.pun_manual,public.pun_decide,public.pun_correction_request,public.pun_correction_decide,public.pun_export_prepare,public.pun_work_options,public.pun_context_set FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pun_invite_prepare,public.pun_invite_accept,public.pun_invite_revoke,public.pun_in,public.pun_out,public.pun_break,public.pun_manual,public.pun_decide,public.pun_correction_request,public.pun_correction_decide,public.pun_export_prepare,public.pun_work_options,public.pun_context_set TO authenticated;
