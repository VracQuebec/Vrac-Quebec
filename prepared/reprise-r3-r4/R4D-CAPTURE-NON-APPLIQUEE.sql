-- Existing employee invitation + existing transactional queue, TEST-only. No new sender/table.
CREATE FUNCTION public.driver_invite_capture(_company uuid,_driver uuid,_email text,_key text,_token text,_origin text,_renew uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i ent_employee_invites; invitation uuid; message_key text; queued bigint; link text;
BEGIN
 IF NOT entcrm_can_admin(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF lower(trim(_email)) !~ '(\.invalid|\.test|\.example|@example\.com)$' THEN RAISE EXCEPTION 'Capture TEST seulement' USING ERRCODE='42501'; END IF;
 IF _origin NOT IN ('http://localhost:8080','https://vracquebec.ca','https://www.vracquebec.ca') THEN RAISE EXCEPTION 'Origine non autorisée'; END IF;
 IF _renew IS NULL THEN invitation:=driver_invite_prepare(_company,_driver,_email,_key,_token);
 ELSE
  SELECT * INTO i FROM ent_employee_invites WHERE id=_renew AND company_id=_company AND driver_id=_driver AND email=lower(trim(_email)) FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Invitation inaccessible' USING ERRCODE='42501'; END IF;
  invitation:=driver_invite_renew(_renew,_key::uuid,_token);
 END IF;
 SELECT * INTO i FROM ent_employee_invites WHERE id=invitation FOR UPDATE;
 message_key:='driver-invite-test-'||i.id||'-'||encode(sha256(convert_to(_key,'UTF8')),'hex');
 IF EXISTS(SELECT 1 FROM email_send_log WHERE message_id=message_key AND metadata->>'capture_only'='true') THEN RETURN jsonb_build_object('id',i.id,'delivery','queued-test','replay',true); END IF;
 link:=_origin||'/entrepreneur/punch#invitation='||_token||'&role=chauffeur';
 queued:=enqueue_email('transactional_emails',jsonb_build_object('message_id',message_key,'idempotency_key',message_key,'to',i.email,'label','driver-invitation-test','capture_only',true,'mode','TEST_CAPTURE_ONLY','tracking',false,'purpose','transactional','subject','Votre accès personnel chauffeur Vrac Québec','text','Connectez-vous avec votre courriel personnel, puis activez votre accès : '||link,'html','<p>Votre accès personnel chauffeur</p><p><a href="'||link||'">Connexion et activation</a></p>','queued_at',now()));
 IF queued IS NULL THEN RAISE EXCEPTION 'Capture non enregistrée'; END IF;
 -- Receipt only: never log the bearer URL/token or call this a delivered invitation.
 INSERT INTO email_send_log(message_id,template_name,recipient_email,status,metadata) VALUES(message_key,'driver-invitation-test',i.email,'pending',jsonb_build_object('capture_only',true,'invitation_id',i.id,'company_id',i.company_id,'queue_id',queued));
 RETURN jsonb_build_object('id',i.id,'delivery','queued-test','replay',false);
END $$;
REVOKE ALL ON FUNCTION public.driver_invite_capture(uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_invite_capture(uuid,uuid,text,text,text,text,uuid) TO authenticated;