-- 11 — Rattachement des demandes (PRÉPARÉ, NON INSTALLÉ ; autorisation distincte requise).
-- Particuliers (formulaire public sans session, portail par lien sécurisé) : aucun changement.
-- Nouvelles demandes d'un entrepreneur connecté : auteur = session serveur ; entreprise seulement
--   si l'auteur a UNE SEULE adhésion gestionnaire/propriétaire active (sinon rattachement à demander).
-- Anciennes demandes : demande de vérification par l'entrepreneur, décision ADMINISTRATEUR avec preuve
--   typée et référence ; jamais de déduction par nom, courriel, téléphone ou adresse. Historique figé.

CREATE TABLE public.submission_ownership_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.submissions(id),
 company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
 requested_by uuid NOT NULL,
 requester_note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','approuvee','refusee')),
 proof_type text CHECK (proof_type IN ('session_auteur_journalisee','confirmation_ecrite_client','document_signe','appel_journalise')),
 proof_reference text,
 decision_note text,
 decided_by uuid,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX submission_ownership_one_pending ON public.submission_ownership_requests(submission_id,company_id) WHERE status='en_attente';
GRANT SELECT ON public.submission_ownership_requests TO authenticated;
GRANT ALL ON public.submission_ownership_requests TO service_role;
ALTER TABLE public.submission_ownership_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demandeur ou admin lit" ON public.submission_ownership_requests FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR (requested_by=auth.uid() AND public.workbench_manager(company_id)));

CREATE TABLE public.submission_ownership_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.submissions(id),
 request_id uuid REFERENCES public.submission_ownership_requests(id),
 action text NOT NULL,
 actor_id uuid,
 detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.submission_ownership_events TO authenticated;
GRANT ALL ON public.submission_ownership_events TO service_role;
ALTER TABLE public.submission_ownership_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin lit le journal" ON public.submission_ownership_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER submission_ownership_events_immutable BEFORE UPDATE OR DELETE ON public.submission_ownership_events FOR EACH ROW EXECUTE FUNCTION public.exec01_events_immutable();

-- Nouvelles demandes : s'exécute APRÈS enforce_submission_insert_defaults et workbench_submission_insert_guard (ordre alphabétique).
CREATE FUNCTION public.zz_submission_capture_author() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid(); n int; only_company uuid;
BEGIN
 IF uid IS NULL OR public.has_role(uid,'admin') THEN RETURN NEW; END IF; -- particulier sans session / saisie admin : inchangé
 SELECT count(*), (array_agg(company_id))[1] INTO n, only_company FROM public.jsc_company_members
  WHERE user_id=uid AND is_active AND archived_at IS NULL AND role IN ('proprietaire','gestionnaire');
 IF n=0 THEN RETURN NEW; END IF; -- compte connecté sans entreprise gestionnaire : aucune attribution
 NEW.created_by := uid;
 IF n=1 AND public.entcrm_can_write(only_company) THEN NEW.edit_company_id := only_company; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.zz_submission_capture_author() FROM PUBLIC,anon,authenticated;
-- La règle de création existante exige created_by NULL pour un non-admin ; on accepte en plus EXACTEMENT la session
-- (le déclencheur ci-dessus ne peut écrire que auth.uid()). Empreinte vérifiée avant changement.
DO $$BEGIN
 IF (SELECT md5(with_check) FROM pg_policies WHERE schemaname='public' AND tablename='submissions' AND policyname='Anyone can submit a request')<>'e1fb01e5bbf9408c7ec5bbc904a7fce5' THEN RAISE EXCEPTION 'Règle de création divergente : arrêt'; END IF;
END$$;
ALTER POLICY "Anyone can submit a request" ON public.submissions WITH CHECK ((((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'admin'::app_role)) OR ((creation_origin = 'public_form'::text) AND (status = 'nouveau'::text) AND (priority = 'normal'::text) AND (assigned_entrepreneur IS NULL) AND ((created_by IS NULL) OR (auth.uid() IS NOT NULL AND created_by = auth.uid())) AND (lead_source = ANY (ARRAY['vracquebec.ca'::text, 'google'::text, 'facebook'::text, 'referencement_naturel'::text, 'pages_locales'::text, 'campagne'::text])) AND (lead_category IS NOT NULL) AND (latitude IS NULL) AND (longitude IS NULL))));
CREATE TRIGGER zz_submission_capture_author BEFORE INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.zz_submission_capture_author();

CREATE FUNCTION public.zz_submission_author_journal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.created_by IS NOT NULL AND NEW.created_by=auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
  INSERT INTO public.submission_ownership_events(submission_id,action,actor_id,detail)
  VALUES(NEW.id,'auteur_session_enregistre',auth.uid(),jsonb_build_object('company_id',NEW.edit_company_id));
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.zz_submission_author_journal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_submission_author_journal AFTER INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.zz_submission_author_journal();

-- État visible par l'entrepreneur, sans divulguer le contenu d'un dossier qui n'est pas le sien.
CREATE FUNCTION public.submission_ownership_status(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions; pending public.submission_ownership_requests;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.submissions WHERE id=_id;
 IF s.id IS NOT NULL AND s.created_by=auth.uid() AND s.edit_company_id IS NOT NULL AND public.workbench_manager(s.edit_company_id) THEN
  RETURN jsonb_build_object('state','rattachee','company_id',s.edit_company_id);
 END IF;
 SELECT * INTO pending FROM public.submission_ownership_requests WHERE submission_id=_id AND requested_by=auth.uid() ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('state',CASE WHEN pending.status='en_attente' THEN 'verification_en_attente' WHEN pending.status='refusee' THEN 'verification_refusee' ELSE 'non_rattachee' END);
END $$;
REVOKE ALL ON FUNCTION public.submission_ownership_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submission_ownership_status(uuid) TO authenticated;

-- Demande de vérification : réponse identique que le dossier existe ou non (pas d'énumération).
CREATE FUNCTION public.submission_ownership_request(_id uuid,_company uuid,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions; rid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.workbench_manager(_company) OR public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Entreprise non autorisée' USING ERRCODE='42501'; END IF;
 IF length(coalesce(_note,''))>1000 THEN RAISE EXCEPTION 'Précision trop longue'; END IF;
 SELECT * INTO s FROM public.submissions WHERE id=_id;
 IF s.id IS NULL OR s.edit_company_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.submission_portal_links WHERE submission_id=_id) THEN
  RETURN jsonb_build_object('ok',true,'state','verification_en_attente'); -- aucune écriture ; même réponse
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('ownership:'||_id||':'||_company));
 SELECT id INTO rid FROM public.submission_ownership_requests WHERE submission_id=_id AND company_id=_company AND status='en_attente';
 IF rid IS NULL THEN
  INSERT INTO public.submission_ownership_requests(submission_id,company_id,requested_by,requester_note) VALUES(_id,_company,auth.uid(),coalesce(trim(_note),'')) RETURNING id INTO rid;
  INSERT INTO public.submission_ownership_events(submission_id,request_id,action,actor_id,detail) VALUES(_id,rid,'verification_demandee',auth.uid(),jsonb_build_object('company_id',_company));
  PERFORM public.crm_notify('ownership:'||rid,'demandes','rattachement_a_verifier','normale','Rattachement de demande à vérifier',NULL,'submission',_id,'/admin/centre-controle',NULL,NULL,NULL,jsonb_build_object('company_id',_company,'request_id',rid),false);
 END IF;
 RETURN jsonb_build_object('ok',true,'state','verification_en_attente');
END $$;
REVOKE ALL ON FUNCTION public.submission_ownership_request(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submission_ownership_request(uuid,uuid,text) TO authenticated;

-- Décision administrateur, preuve obligatoire ; ne touche jamais au portail des particuliers.
CREATE FUNCTION public.submission_ownership_decide(_request uuid,_approve boolean,_proof_type text,_proof_reference text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.submission_ownership_requests; s public.submissions;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Décision administrateur requise' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.submission_ownership_requests WHERE id=_request FOR UPDATE;
 IF q.id IS NULL OR q.status<>'en_attente' THEN RAISE EXCEPTION 'Demande déjà traitée ou absente'; END IF;
 SELECT * INTO s FROM public.submissions WHERE id=q.submission_id FOR UPDATE;
 IF NOT coalesce(_approve,false) THEN
  IF length(trim(coalesce(_note,'')))<3 THEN RAISE EXCEPTION 'Motif de refus requis'; END IF;
  UPDATE public.submission_ownership_requests SET status='refusee',decision_note=_note,decided_by=auth.uid(),decided_at=now() WHERE id=q.id;
  INSERT INTO public.submission_ownership_events(submission_id,request_id,action,actor_id,detail) VALUES(s.id,q.id,'rattachement_refuse',auth.uid(),jsonb_build_object('note',_note));
  RETURN jsonb_build_object('ok',true,'state','refusee');
 END IF;
 IF _proof_type IS NULL OR _proof_type NOT IN ('session_auteur_journalisee','confirmation_ecrite_client','document_signe','appel_journalise') OR length(trim(coalesce(_proof_reference,'')))<3 THEN RAISE EXCEPTION 'Preuve fiable et référence obligatoires'; END IF;
 IF s.edit_company_id IS NOT NULL OR (s.created_by IS NOT NULL AND s.created_by<>q.requested_by) THEN RAISE EXCEPTION 'Dossier déjà rattaché à un autre auteur'; END IF;
 IF EXISTS(SELECT 1 FROM public.submission_portal_links WHERE submission_id=s.id) THEN RAISE EXCEPTION 'Demande de particulier suivie par lien sécurisé : non rattachable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.jsc_company_members WHERE company_id=q.company_id AND user_id=q.requested_by AND is_active AND archived_at IS NULL AND role IN ('proprietaire','gestionnaire')) THEN RAISE EXCEPTION 'Demandeur plus membre actif de cette entreprise' USING ERRCODE='42501'; END IF;
 PERFORM set_config('vq.workbench','on',true);
 UPDATE public.submissions SET created_by=q.requested_by,edit_company_id=q.company_id WHERE id=s.id;
 PERFORM set_config('vq.workbench','off',true);
 UPDATE public.submission_ownership_requests SET status='approuvee',proof_type=_proof_type,proof_reference=_proof_reference,decision_note=_note,decided_by=auth.uid(),decided_at=now() WHERE id=q.id;
 INSERT INTO public.submission_ownership_events(submission_id,request_id,action,actor_id,detail) VALUES(s.id,q.id,'rattachement_approuve',auth.uid(),jsonb_build_object('company_id',q.company_id,'author',q.requested_by,'previous_author',s.created_by,'proof_type',_proof_type,'proof_reference',_proof_reference));
 INSERT INTO public.ent_crm_history(company_id,entity,entity_id,action,before,after,actor_id,origin) VALUES(q.company_id,'submission_edit_binding',s.id,'association_confirmee',jsonb_build_object('company',NULL,'author',s.created_by),jsonb_build_object('company',q.company_id,'author',q.requested_by,'proof_type',_proof_type),auth.uid(),'support_vrac_quebec');
 RETURN jsonb_build_object('ok',true,'state','approuvee');
END $$;
REVOKE ALL ON FUNCTION public.submission_ownership_decide(uuid,boolean,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submission_ownership_decide(uuid,boolean,text,text,text) TO authenticated;
