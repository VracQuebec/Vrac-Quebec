-- PREPARED ONLY: extends existing network/marketplace records. No private CRM audience.
ALTER TABLE entrepreneurs ADD COLUMN exec04_network_facts jsonb NOT NULL DEFAULT '{}';
ALTER TABLE submissions ADD COLUMN exec04_region text;
ALTER TABLE mkt_consents ADD COLUMN channel text NOT NULL DEFAULT 'email' CHECK(channel IN ('email','sms','app'));
ALTER TABLE mkt_consents ADD COLUMN permission_state text NOT NULL DEFAULT 'granted' CHECK(permission_state IN ('granted','withdrawn','unknown'));
ALTER TABLE mkt_consents ADD COLUMN expires_at timestamptz;
ALTER TABLE mkt_consents ADD COLUMN subject_type text CHECK(subject_type IN ('owner','entrepreneur'));
ALTER TABLE mkt_consents ADD COLUMN subject_id uuid;
ALTER TABLE mkt_consents ADD COLUMN partner_company_id uuid REFERENCES jsc_companies(id);
ALTER TABLE mkt_consents ADD COLUMN service_request_id uuid REFERENCES mkt_quote_requests(id);
-- Preserve old promotion rows without inventing source-id associations or permissions.
DROP INDEX mkt_consents_one_active;
CREATE UNIQUE INDEX mkt_consents_one_active ON mkt_consents(email,entity,scope,channel,coalesce(partner_company_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(service_request_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE withdrawn_at IS NULL;
ALTER TABLE mkt_promo_sends ADD COLUMN message_key text UNIQUE;
ALTER TABLE mkt_promo_sends ADD COLUMN state text NOT NULL DEFAULT 'sent' CHECK(state IN ('prepared','queued','captured_test','sent','delivered','failed','excluded'));
ALTER TABLE mkt_promo_sends ADD COLUMN purpose text NOT NULL DEFAULT 'promotion';
ALTER TABLE mkt_promo_sends ADD COLUMN subject_type text;
ALTER TABLE mkt_promo_sends ADD COLUMN subject_id uuid;
ALTER TABLE mkt_promo_sends ADD COLUMN queue_id bigint;
ALTER TABLE mkt_promo_sends ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE mkt_promo_sends ADD COLUMN last_error text;
ALTER TABLE mkt_promo_sends ADD COLUMN captured_at timestamptz;
ALTER TABLE mkt_promo_sends ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE mkt_promo_sends ALTER COLUMN sent_at DROP DEFAULT;
ALTER TABLE mkt_quote_requests ADD COLUMN origin_submission_id uuid REFERENCES submissions(id);
ALTER TABLE mkt_quote_requests ADD COLUMN exec04_rev integer NOT NULL DEFAULT 1;
ALTER TABLE mkt_commissions ADD COLUMN finance_invoice_id uuid UNIQUE REFERENCES fin_invoices(id);
ALTER TABLE mkt_commissions ADD COLUMN exec04_acquired_at timestamptz;
ALTER TABLE mkt_commissions ADD COLUMN exec04_cancelled_at timestamptz;
ALTER TABLE mkt_pricing_rules ADD COLUMN agreement jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX exec04_one_commission ON mkt_commissions(request_id,company_id) WHERE rule_snapshot ? 'exec04';

CREATE TABLE mkt_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,template_key text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('service','promotion')),channel text NOT NULL DEFAULT 'email' CHECK(channel='email'),
 segment jsonb NOT NULL DEFAULT '{}',frequency_hours integer NOT NULL CHECK(frequency_hours BETWEEN 1 AND 8760),
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz
);
GRANT SELECT ON mkt_campaigns TO authenticated;
GRANT ALL ON mkt_campaigns TO service_role;
ALTER TABLE mkt_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_admin ON mkt_campaigns FOR SELECT TO authenticated USING(has_role(auth.uid(),'admin'));
-- Extension history only; identities, needs, partner/financial records remain in existing tables.
CREATE TABLE mkt_communication_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subject_type text,subject_id uuid,request_id uuid REFERENCES mkt_quote_requests(id),
 actor_id uuid,action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 operation_id uuid UNIQUE
);
GRANT SELECT ON mkt_communication_events TO authenticated;
GRANT SELECT,INSERT ON mkt_communication_events TO service_role;
ALTER TABLE mkt_communication_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY communication_events_admin ON mkt_communication_events FOR SELECT TO authenticated USING(has_role(auth.uid(),'admin'));
CREATE TRIGGER communication_events_immutable BEFORE UPDATE OR DELETE ON mkt_communication_events FOR EACH ROW EXECUTE FUNCTION exec01_events_immutable();

CREATE FUNCTION exec04_owner_ok(p jsonb,_recent boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM submission_portal_links l JOIN submissions s ON s.id=l.submission_id
 WHERE l.id=(p->>'linkId')::uuid AND l.submission_id=(p->>'requestId')::uuid
 AND l.secret_hash=p->>'secretHash' AND l.contact_hash=encode(digest(lower(trim(s.email)),'sha256'),'hex')
 AND l.revoked_at IS NULL AND l.expires_at>now() AND l.failures<5
 AND (NOT _recent OR l.verified_at>now()-interval '10 minutes'));
$$;
CREATE FUNCTION exec04_network() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
 SELECT jsonb_build_object('id',s.id,'audience','owner','scope','network','name',s.name,'sector',s.city,
 'materials',s.materials,'remaining',f.reception_conditions->'remaining','unit',f.reception_conditions->>'unit',
 'availability',s.availability_status,'confirmedAt',s.exec01_owner_confirmed_at,'trade',null,'activeAt',null,'features','[]'::jsonb) x
 FROM submissions s LEFT JOIN submission_fill_profile f ON f.submission_id=s.id
 WHERE s.request_type='remblai' AND s.parcours_direction='reception'
 UNION ALL
 SELECT jsonb_build_object('id',e.id,'audience','entrepreneur','scope','network','name',coalesce(nullif(e.company,''),e.name),
 'sector',e.city,'materials','[]'::jsonb,'remaining',null,'unit',null,'availability',null,'confirmedAt',null,
 'trade',e.exec04_network_facts->>'trade','activeAt',e.exec04_network_facts->>'activeAt','features',coalesce(e.exec04_network_facts->'features','[]'::jsonb))
 FROM entrepreneurs e WHERE e.is_network_visible
 ) q;
$$;
-- These facts are explicit network activity signals, never derived from private client records.
CREATE FUNCTION exec04_contact(_type text,_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE _type WHEN 'owner' THEN (SELECT jsonb_build_object('email',s.email,'name',s.name,'verified',s.exec01_contact_verified_at IS NOT NULL) FROM submissions s WHERE s.id=_id AND s.request_type='remblai' AND s.parcours_direction='reception')
 WHEN 'entrepreneur' THEN (SELECT jsonb_build_object('email',e.email,'name',coalesce(e.company,e.name),'verified',e.user_id IS NOT NULL) FROM entrepreneurs e WHERE e.id=_id AND e.is_network_visible) END;
$$;
CREATE FUNCTION exec04_permission(_email text,_purpose text,_at timestamptz DEFAULT now(),_partner uuid DEFAULT NULL,_request uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM mkt_consents c WHERE c.email=lower(trim(_email)) AND c.entity='vrac_quebec'
 AND c.scope=CASE _purpose WHEN 'promotion' THEN 'promotions_courriel' ELSE _purpose END AND c.channel='email'
 AND c.permission_state='granted' AND c.withdrawn_at IS NULL AND c.accepted_at<=_at AND (c.expires_at IS NULL OR c.expires_at>_at)
 AND c.source<>'' AND c.consent_text<>'' AND c.partner_company_id IS NOT DISTINCT FROM _partner AND c.service_request_id IS NOT DISTINCT FROM _request)
 AND NOT EXISTS(SELECT 1 FROM suppressed_emails WHERE email=lower(trim(_email)) AND (reason IN ('bounce','complaint') OR _purpose='promotion'))
 AND (_purpose<>'promotion' OR NOT EXISTS(SELECT 1 FROM email_unsubscribe_tokens t WHERE t.email=lower(trim(_email)) AND t.used_at IS NOT NULL));
$$;
CREATE FUNCTION exec04_available(_submission uuid,_category uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('companyId',p.company_id,'name',coalesce(p.trade_name,p.legal_name),'categoryId',c.id,'service',c.name)),'[]'::jsonb)
 FROM submissions s JOIN mkt_service_categories c ON c.is_active AND (_category IS NULL OR c.id=_category)
 JOIN mkt_partner_services ps ON ps.category_id=c.id AND ps.is_active JOIN mkt_partners p ON p.company_id=ps.company_id
 WHERE s.id=_submission AND p.is_active AND p.is_public AND p.archived_at IS NULL
 AND p.availability_status='disponible' AND p.onboarding_status='approuve'
 AND EXISTS(SELECT 1 FROM mkt_partner_territories t WHERE t.company_id=p.company_id AND t.is_active
 AND ((t.scope='province' AND t.region='Québec') OR (t.scope='ville' AND lower(t.city)=lower(s.city))
 OR (t.scope='region' AND t.region IS NOT NULL AND t.region=s.exec04_region)))
 AND NOT EXISTS(SELECT 1 FROM mkt_partner_availability a WHERE a.company_id=p.company_id AND a.is_active
 AND a.quantity=0 AND a.starts_on<=current_date AND a.ends_on>=current_date);
$$;
CREATE FUNCTION exec04_message_current(p jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM mkt_promo_sends m WHERE m.id=(p->'exec04_guard'->>'messageId')::uuid
 AND m.state='queued' AND m.email=lower(trim(p->>'to')) AND exec04_permission(m.email,m.purpose)
 AND (m.subject_type<>'owner' OR EXISTS(SELECT 1 FROM submissions s WHERE s.id=m.subject_id AND s.availability_status NOT IN ('owner_closed','suspended'))));
$$;
REVOKE ALL ON FUNCTION exec04_message_current(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION exec04_message_current(jsonb) TO service_role;
CREATE FUNCTION exec04_message_result(p jsonb,_state text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _state NOT IN ('sent','delivered','failed','excluded') THEN RAISE EXCEPTION 'Etat invalide';END IF;
 UPDATE mkt_promo_sends SET state=_state,sent_at=CASE WHEN _state='sent' THEN now() ELSE sent_at END,
 last_error=CASE WHEN _state='failed' THEN 'echec_prestataire' WHEN _state='excluded' THEN 'permission_ou_capture_seulement' END
 WHERE id=(p->'exec04_guard'->>'messageId')::uuid AND email=lower(trim(p->>'to')) AND state NOT IN ('delivered','captured_test');
END $$;
REVOKE ALL ON FUNCTION exec04_message_result(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION exec04_message_result(jsonb,text) TO service_role;
CREATE FUNCTION exec04_dispatch(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
#variable_conflict use_variable
DECLARE kind text:=p->>'kind'; admin boolean:=coalesce(p->>'role'='admin',false); subject uuid; audience text; contact jsonb; email text;
 prev mkt_communication_events; result jsonb; req mkt_quote_requests; camp mkt_campaigns; msg mkt_promo_sends; comm mkt_commissions;
 recipient jsonb; permission boolean; key text; qid bigint; part uuid; invoice fin_invoices; state text; reason text; cid uuid;
BEGIN
 IF octet_length(p::text)>150000 THEN RAISE EXCEPTION 'Requête trop grande'; END IF;
 IF kind IN ('network','campaign_save','campaign_list','prepare','campaign_claim','campaign_ack','commissions','agreement','commission','finance_link','service_admin') AND NOT admin THEN RAISE EXCEPTION 'Accès réservé' USING ERRCODE='42501'; END IF;
 IF kind='network' THEN RETURN exec04_network(); END IF;
 IF kind='campaign_list' THEN RETURN jsonb_build_object('campaigns',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY created_at DESC) FROM mkt_campaigns c),'[]'),
 'messages',coalesce((SELECT jsonb_agg(to_jsonb(m)-'email' ORDER BY id) FROM mkt_promo_sends m WHERE message_key IS NOT NULL),'[]')); END IF;
 IF kind='commissions' THEN RETURN jsonb_build_object('commissions',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('financialState',CASE WHEN c.finance_invoice_id IS NOT NULL THEN CASE WHEN EXISTS(SELECT 1 FROM fin_expected_inflows f JOIN fin_invoices i ON i.id=f.invoice_id WHERE i.id=c.finance_invoice_id AND f.received>=i.total) THEN 'payee' ELSE 'facturee' END ELSE c.status END)) FROM mkt_commissions c),'[]'),'rules',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM mkt_pricing_rules r),'[]')); END IF;
 IF kind='partner_list' THEN
  IF p->>'role'<>'partner' OR NOT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=(p->>'companyId')::uuid AND user_id=(p->>'actorId')::uuid AND is_active AND archived_at IS NULL) THEN RAISE EXCEPTION 'Entreprise refusée' USING ERRCODE='42501'; END IF;
 END IF;
 IF kind IN ('services','preferences','permission','service_create','service_action') THEN
  IF NOT admin AND NOT (kind='service_action' AND p->>'role'='partner') AND NOT coalesce(exec04_owner_ok(p,kind IN ('permission','service_create','service_action')),false) THEN RAISE EXCEPTION 'Lien ou vérification récente requis' USING ERRCODE='42501'; END IF;
 END IF;
 IF kind='preferences' THEN
  SELECT s.email INTO email FROM submissions s WHERE s.id=(p->>'requestId')::uuid;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('purpose',scope,'channel',channel,'state',CASE WHEN withdrawn_at IS NOT NULL THEN 'withdrawn' ELSE permission_state END,'source',source,'proof',consent_text,'at',accepted_at,'expiresAt',expires_at,'withdrawnAt',withdrawn_at)) FROM mkt_consents c WHERE c.email=email AND c.subject_type='owner' AND c.subject_id=(p->>'requestId')::uuid),'[]');
 END IF;
 IF kind='services' THEN RETURN jsonb_build_object('available',exec04_available((p->>'requestId')::uuid,NULL),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('at',e.created_at,'action',e.detail->>'action','reason',e.detail->>'reason','requestId',e.request_id) ORDER BY e.created_at DESC) FROM mkt_communication_events e JOIN mkt_quote_requests r ON r.id=e.request_id WHERE r.origin_submission_id=(p->>'requestId')::uuid),'[]'),
 'requests',coalesce((SELECT jsonb_agg(to_jsonb(r)-'internal_notes'-'contact_email'-'contact_phone'-'contact_name') FROM mkt_quote_requests r WHERE origin_submission_id=(p->>'requestId')::uuid),'[]')); END IF;
 IF kind IN ('partner_list','service_admin') THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'city',r.city,'status',r.status,'answers',r.answers-'shared',
 'description',CASE WHEN admin THEN r.description END,
 'shared',CASE WHEN admin THEN r.answers->'shared' WHEN exec04_permission(r.contact_email,'partner_share',now(),(p->>'companyId')::uuid,r.id) AND r.answers->>'partnerId'=p->>'companyId' AND r.status NOT IN ('annulee','litige') THEN r.answers->'shared' END)) FROM mkt_quote_requests r WHERE r.origin_submission_id IS NOT NULL AND (admin OR (r.answers->>'partnerId'=p->>'companyId' AND exec04_permission(r.contact_email,'partner_share',now(),(p->>'companyId')::uuid,r.id) AND r.status NOT IN ('annulee','litige')))),'[]'); END IF;
 -- Lock network subject/commission/campaign before replay check, preventing concurrent duplicates.
 IF p->>'campaignId' IS NOT NULL THEN SELECT * INTO camp FROM mkt_campaigns WHERE id=(p->>'campaignId')::uuid FOR UPDATE; END IF;
 IF p->>'requestId' IS NOT NULL THEN PERFORM 1 FROM submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE; END IF;
 IF p->>'serviceId' IS NOT NULL THEN SELECT * INTO req FROM mkt_quote_requests WHERE id=(p->>'serviceId')::uuid FOR UPDATE; END IF;
 IF p->>'commissionId' IS NOT NULL THEN SELECT * INTO comm FROM mkt_commissions WHERE id=(p->>'commissionId')::uuid FOR UPDATE; END IF;
 IF p->>'operationId' IS NULL OR p->>'confirmed'<>'true' THEN RAISE EXCEPTION 'Confirmation explicite requise'; END IF;
 SELECT * INTO prev FROM mkt_communication_events WHERE operation_id=(p->>'operationId')::uuid;
 IF FOUND THEN IF prev.detail->>'inputHash' IS DISTINCT FROM p->>'inputHash' OR prev.actor_id IS DISTINCT FROM (p->>'actorId')::uuid THEN RAISE EXCEPTION 'Rejeu différent'; END IF; RETURN prev.detail->'result'; END IF;
 IF kind='permission' THEN
  IF NOT admin AND p->>'role' IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Droit de préférence refusé' USING ERRCODE='42501'; END IF;
  IF p->>'purpose'='partner_share' THEN RAISE EXCEPTION 'Partager depuis le besoin qualifié uniquement'; END IF;
  IF p->>'purpose' NOT IN ('service','promotion','partner_share') OR p->>'channel' NOT IN ('email','sms','app') OR p->>'state' NOT IN ('granted','withdrawn') THEN RAISE EXCEPTION 'Finalité/canal invalide'; END IF;
  IF p->>'role'='owner' THEN audience:='owner';subject:=(p->>'requestId')::uuid; ELSE audience:=p->>'audience';subject:=(p->>'subjectId')::uuid; END IF;
  contact:=exec04_contact(audience,subject);email:=lower(trim(contact->>'email'));IF email IS NULL THEN RAISE EXCEPTION 'Contact réseau absent'; END IF;
  IF p->>'state'='granted' AND (coalesce(p->>'proof','')='' OR coalesce(p->>'source','')='' OR (p->>'expiresAt' IS NOT NULL AND (p->>'expiresAt')::timestamptz<=now())) THEN RAISE EXCEPTION 'Preuve et source requises'; END IF;
  UPDATE mkt_consents c SET withdrawn_at=now(),withdrawn_source=p->>'source',permission_state='withdrawn' WHERE c.email=email AND c.scope=CASE p->>'purpose' WHEN 'promotion' THEN 'promotions_courriel' ELSE p->>'purpose' END AND c.channel=p->>'channel' AND withdrawn_at IS NULL AND partner_company_id IS NOT DISTINCT FROM (p->>'partnerId')::uuid AND service_request_id IS NOT DISTINCT FROM (p->>'serviceId')::uuid;
  IF p->>'state'='granted' THEN
   INSERT INTO mkt_consents(email,subject_type,subject_id,scope,channel,consent_text,consent_version,sender_snapshot,source,accepted_at,expires_at,partner_company_id,service_request_id)
   VALUES(email,audience,subject,CASE p->>'purpose' WHEN 'promotion' THEN 'promotions_courriel' ELSE p->>'purpose' END,p->>'channel',p->>'proof','exec04-v1',jsonb_build_object('entity','vrac_quebec'),p->>'source',now(),(p->>'expiresAt')::timestamptz,(p->>'partnerId')::uuid,(p->>'serviceId')::uuid);
  END IF;
  result:=jsonb_build_object('ok',true,'state',p->>'state');
 ELSIF kind='campaign_save' THEN
  IF p->>'template' NOT IN ('confirmation','reconfirmation','offer','appointment','welcome','features') OR (p->>'frequencyHours')::int NOT BETWEEN 1 AND 8760 THEN RAISE EXCEPTION 'Modèle/fréquence invalide'; END IF;
  INSERT INTO mkt_campaigns(name,template_key,purpose,segment,frequency_hours,created_by) VALUES(p->>'name',p->>'template',CASE WHEN p->>'template' IN ('welcome','features') THEN 'promotion' ELSE 'service' END,p->'segment',(p->>'frequencyHours')::int,(p->>'actorId')::uuid) RETURNING id INTO cid;
  result:=jsonb_build_object('id',cid);
 ELSIF kind='prepare' THEN
  IF camp.id IS NULL THEN RAISE EXCEPTION 'Campagne absente'; END IF;
  -- Candidate IDs are computed by the shared domain on a fresh server network projection; SQL rechecks permission/contact.
  FOR recipient IN SELECT value FROM jsonb_array_elements(p->'recipients') LOOP
   audience:=recipient->>'audience';subject:=(recipient->>'id')::uuid; contact:=exec04_contact(audience,subject); email:=lower(trim(contact->>'email'));
   IF email IS NULL OR contact->>'verified' IS DISTINCT FROM 'true' OR NOT exec04_permission(email,camp.purpose) OR (camp.template_key IN ('offer','appointment')) THEN CONTINUE; END IF;
   PERFORM pg_advisory_xact_lock(hashtext('exec04-mail:'||email));key:='exec04:'||camp.id||':'||encode(digest(email,'sha256'),'hex');
   IF EXISTS(SELECT 1 FROM mkt_promo_sends WHERE message_key=key) THEN CONTINUE;END IF;
   IF EXISTS(SELECT 1 FROM mkt_promo_sends ms WHERE ms.email=email AND ms.purpose=camp.purpose AND ms.state IN ('prepared','queued','captured_test','sent','delivered') AND coalesce(ms.captured_at,ms.sent_at,(SELECT created_at FROM mkt_campaigns WHERE id::text=ms.campaign))>now()-make_interval(hours=>camp.frequency_hours)) THEN CONTINUE; END IF;
   INSERT INTO mkt_promo_sends(email,campaign,message_key,state,purpose,subject_type,subject_id) VALUES(email,camp.id::text,key,'prepared',camp.purpose,audience,subject);
  END LOOP;
  result:=jsonb_build_object('ok',true);
 ELSIF kind='campaign_claim' THEN
  IF camp.id IS NULL THEN RAISE EXCEPTION 'Campagne absente';END IF;
  SELECT * INTO msg FROM mkt_promo_sends ms WHERE ms.campaign=camp.id::text AND ms.state IN ('prepared','failed','queued') AND ms.attempts<3 ORDER BY ms.id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF msg.id IS NULL THEN RETURN jsonb_build_object('empty',true);END IF;
  IF NOT exec04_permission(msg.email,msg.purpose) THEN UPDATE mkt_promo_sends SET state='excluded',last_error='permission_retirée_ou_absente' WHERE id=msg.id;RETURN jsonb_build_object('excluded',true);END IF;
  IF msg.queue_id IS NOT NULL THEN RETURN jsonb_build_object('recover',true,'id',msg.id); END IF;
  IF p->'message' IS NULL THEN RETURN jsonb_build_object('render',true,'id',msg.id,'contact',exec04_contact(msg.subject_type,msg.subject_id),'subjectId',msg.subject_id,'audience',msg.subject_type,'template',camp.template_key,'key',msg.message_key);END IF;
  IF p->>'messageId' IS DISTINCT FROM msg.id::text THEN RAISE EXCEPTION 'Message modifié'; END IF;
  IF msg.subject_type='owner' THEN
   INSERT INTO submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at) VALUES((p->>'nextId')::uuid,msg.subject_id,p->>'nextHash',encode(digest(msg.email,'sha256'),'hex'),now()+interval '30 days');
  END IF;
  qid:=enqueue_email('transactional_emails',p->'message'||jsonb_build_object('to',msg.email,'recipientEmail',msg.email,'idempotency_key',msg.message_key,'purpose',CASE msg.purpose WHEN 'service' THEN 'transactional' ELSE 'marketing' END,'exec04_guard',jsonb_build_object('messageId',msg.id,'purpose',msg.purpose)));
  UPDATE mkt_promo_sends SET state='queued',queue_id=qid,attempts=attempts+1 WHERE id=msg.id;
  result:=jsonb_build_object('ok',true,'id',msg.id);
 ELSIF kind='campaign_ack' THEN
  SELECT * INTO msg FROM mkt_promo_sends WHERE id=(p->>'messageId')::uuid FOR UPDATE;
  IF p->>'state' NOT IN ('captured_test','failed') THEN RAISE EXCEPTION 'Capture ou échec seulement';END IF;
  UPDATE mkt_promo_sends SET state=p->>'state',captured_at=CASE WHEN p->>'state'='captured_test' THEN now() END,last_error=p->>'reason' WHERE id=msg.id;
  result:=jsonb_build_object('ok',true);
 ELSIF kind='service_create' THEN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(exec04_available((p->>'requestId')::uuid,(p->>'categoryId')::uuid))) THEN RAISE EXCEPTION 'Service indisponible dans ce secteur';END IF;
  INSERT INTO mkt_quote_requests(origin_submission_id,title,description,category_id,city,contact_name,contact_email,status,contact_visibility,source)
  SELECT s.id,p->>'title',p->>'description',(p->>'categoryId')::uuid,s.city,s.name,s.email,'a_qualifier','toujours_cachees','portail_remblai' FROM submissions s WHERE s.id=(p->>'requestId')::uuid RETURNING id INTO cid;
  result:=jsonb_build_object('id',cid);
 ELSIF kind='service_action' THEN
  IF req.id IS NULL OR (NOT admin AND (p->>'role')<>'partner' AND req.origin_submission_id IS DISTINCT FROM (p->>'requestId')::uuid) THEN RAISE EXCEPTION 'Autre dossier refusé';END IF;
  state:=p->>'action';reason:=p->>'reason';part:=(p->>'partnerId')::uuid;
  IF state='qualify' THEN IF NOT admin THEN RAISE EXCEPTION 'Qualification équipe';END IF;UPDATE mkt_quote_requests SET status='a_matcher',answers=answers||jsonb_build_object('qualified',true,'qualification',p->>'qualification') WHERE id=req.id;
  ELSIF state IN ('share','refuse_share') THEN
   IF p->>'role' IS DISTINCT FROM 'owner' OR req.answers->>'qualified' IS DISTINCT FROM 'true' OR part IS NULL OR (state='share' AND length(coalesce(p->>'proof',''))<3) THEN RAISE EXCEPTION 'Autorisation propriétaire et qualification requises';END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(exec04_available(req.origin_submission_id,req.category_id)) a WHERE a->>'companyId'=part::text) THEN RAISE EXCEPTION 'Partenaire hors secteur';END IF;
   UPDATE mkt_quote_requests SET answers=answers||jsonb_build_object('partnerId',part,'shareDecision',state,'shared',CASE WHEN state='share' THEN jsonb_build_object('name',req.contact_name,'email',req.contact_email,'city',req.city,'need',req.description) ELSE '{}'::jsonb END),status=CASE WHEN state='share' THEN 'distribuee' ELSE 'a_matcher' END WHERE id=req.id;
   UPDATE mkt_consents SET withdrawn_at=now(),permission_state='withdrawn',withdrawn_source='portail' WHERE scope='partner_share' AND service_request_id=req.id AND withdrawn_at IS NULL;
   IF state='share' THEN INSERT INTO mkt_consents(email,scope,consent_text,consent_version,sender_snapshot,source,partner_company_id,service_request_id,subject_type,subject_id) VALUES(lower(req.contact_email),'partner_share',p->>'proof','exec04-v1','{}','portail_vérifié',part,req.id,'owner',req.origin_submission_id);END IF;
  ELSIF state IN ('respond','quote') THEN
   IF p->>'role'<>'partner' OR req.answers->>'partnerId' IS DISTINCT FROM p->>'companyId' OR NOT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=(p->>'companyId')::uuid AND user_id=(p->>'actorId')::uuid AND is_active AND archived_at IS NULL) OR NOT exec04_permission(req.contact_email,'partner_share',now(),(p->>'companyId')::uuid,req.id) THEN RAISE EXCEPTION 'Partage absent ou autre entreprise' USING ERRCODE='42501';END IF;
   IF req.status IN ('annulee','litige') THEN RAISE EXCEPTION 'Demande non active';END IF;
   IF state='quote' THEN
    INSERT INTO mkt_bids(request_id,company_id,amount,scope,status,submitted_at) VALUES(req.id,(p->>'companyId')::uuid,(p->>'amount')::numeric,p->>'response','envoyee',now());
   END IF;
   UPDATE mkt_quote_requests SET answers=answers||jsonb_build_object(state,p->>'response'),status=CASE state WHEN 'quote' THEN 'soumissions_recues' ELSE status END WHERE id=req.id;
  ELSIF state IN ('cancel','result','dispute','known') THEN
   IF NOT admin AND p->>'role'<>'owner' THEN RAISE EXCEPTION 'Action réservée';END IF;
   IF state IN ('cancel','dispute') AND length(coalesce(reason,''))<3 THEN RAISE EXCEPTION 'Motif requis';END IF;
   UPDATE mkt_quote_requests SET status=CASE state WHEN 'cancel' THEN 'annulee' WHEN 'dispute' THEN 'litige' WHEN 'result' THEN 'terminee' ELSE status END,answers=answers||jsonb_build_object(state,coalesce(reason,p->>'response')) WHERE id=req.id;
   IF state IN ('cancel','known') THEN UPDATE mkt_commissions SET status='annulee',exec04_cancelled_at=now(),notes=reason WHERE request_id=req.id AND finance_invoice_id IS NULL; END IF;
   IF state='result' AND p->>'ruleId' IS NOT NULL THEN
    IF NOT admin OR req.answers->>'partnerId' IS NULL OR req.answers ? 'known' OR req.status IN ('annulee','litige') THEN RAISE EXCEPTION 'Attribution non admissible'; END IF;
    INSERT INTO mkt_commissions(request_id,company_id,rule_id,rule_snapshot,base_amount,amount,status)
    SELECT req.id,(req.answers->>'partnerId')::uuid,r.id,jsonb_build_object('exec04',true,'agreement',r.agreement),
    (p->>'amount')::numeric,
    CASE WHEN r.agreement->>'fixed' IS NOT NULL THEN (r.agreement->>'fixed')::numeric
      WHEN r.agreement->>'rate' IS NOT NULL AND p->>'amount' IS NOT NULL THEN (p->>'amount')::numeric*(r.agreement->>'rate')::numeric/100 END,'a_confirmer'
    FROM mkt_pricing_rules r WHERE r.id=(p->>'ruleId')::uuid AND r.agreement->>'attribution' IS NOT NULL
    AND (r.company_id IS NULL OR r.company_id=(req.answers->>'partnerId')::uuid)
    ON CONFLICT(request_id,company_id) WHERE rule_snapshot ? 'exec04' DO NOTHING;
   END IF;
  ELSE RAISE EXCEPTION 'Étape invalide';END IF;
  UPDATE mkt_quote_requests SET exec04_rev=exec04_rev+1 WHERE id=req.id;result:=jsonb_build_object('ok',true);
 ELSIF kind='agreement' THEN
  IF p->'agreement' IS NULL OR p->'agreement'->>'basis' IS NULL OR p->'agreement'->>'trigger' IS NULL OR p->'agreement'->>'attribution' IS NULL THEN RAISE EXCEPTION 'Entente à compléter';END IF;
   UPDATE mkt_pricing_rules SET agreement=p->'agreement' WHERE id=(p->>'ruleId')::uuid;
  result:=jsonb_build_object('ok',true);
 ELSIF kind='commission' THEN
  state:=p->>'action';IF comm.id IS NULL THEN RAISE EXCEPTION 'Commission absente';END IF;
  IF state='cancel' THEN
   IF comm.finance_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Facture liée : utiliser la note de crédit financière, jamais annuler deux fois';END IF;
   IF length(coalesce(p->>'reason',''))<3 THEN RAISE EXCEPTION 'Motif requis';END IF;
   UPDATE mkt_commissions SET status='annulee',exec04_cancelled_at=now(),notes=p->>'reason' WHERE id=comm.id;
  ELSIF state='dispute' THEN UPDATE mkt_commissions SET status='contestee',contested_at=now(),notes=p->>'reason' WHERE id=comm.id;
  ELSIF state='acquire' THEN
   IF comm.status<>'a_confirmer' OR comm.amount IS NULL OR comm.rule_snapshot->'agreement'->>'trigger' IS NULL OR comm.rule_snapshot->'agreement'->>'trigger'<>p->>'event' THEN RAISE EXCEPTION 'Événement/entente/montant non confirmé';END IF;
   IF EXISTS(SELECT 1 FROM mkt_quote_requests WHERE id=comm.request_id AND (status IN ('annulee','litige') OR answers ? 'known')) THEN RAISE EXCEPTION 'Annulé, contesté ou prospect connu';END IF;
   UPDATE mkt_commissions SET status='a_facturer',exec04_acquired_at=now() WHERE id=comm.id;
  ELSE RAISE EXCEPTION 'Action invalide';END IF;result:=jsonb_build_object('ok',true);
 ELSIF kind='finance_link' THEN
  SELECT * INTO invoice FROM fin_invoices WHERE id=(p->>'invoiceId')::uuid;
  IF comm.id IS NULL OR comm.status NOT IN ('a_facturer','facturee','payee') OR invoice.id IS NULL OR invoice.company_id<>(p->>'billingCompanyId')::uuid OR NOT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=invoice.company_id AND user_id=(p->>'actorId')::uuid AND is_active AND archived_at IS NULL AND role IN ('proprietaire','gestionnaire','comptabilite')) OR invoice.subtotal IS DISTINCT FROM comm.amount OR invoice.status<>'emise' OR invoice.private_note IS DISTINCT FROM 'mkt_commission:'||comm.id THEN RAISE EXCEPTION 'Facture émise, montant, attribution et droits financiers requis';END IF;
  IF comm.finance_invoice_id IS NOT NULL AND comm.finance_invoice_id<>invoice.id THEN RAISE EXCEPTION 'Commission déjà liée';END IF;
  UPDATE mkt_commissions SET finance_invoice_id=invoice.id,status=CASE WHEN EXISTS(SELECT 1 FROM fin_expected_inflows WHERE invoice_id=invoice.id AND received>=invoice.total) THEN 'payee' ELSE 'facturee' END,invoiced_at=invoice.issued_at WHERE id=comm.id;
  result:=jsonb_build_object('ok',true,'invoiceId',invoice.id);
 ELSE RAISE EXCEPTION 'Traitement inconnu'; END IF;
 INSERT INTO mkt_communication_events(subject_type,subject_id,request_id,actor_id,action,operation_id,detail)
 VALUES(audience,subject,req.id,(p->>'actorId')::uuid,kind,(p->>'operationId')::uuid,jsonb_build_object('inputHash',p->>'inputHash','result',result,'action',p->>'action','reason',p->>'reason'));
 RETURN result;
END $$;
-- Trusted backend supplies role/actor only after JWT or dossier verification; never client-callable.
REVOKE ALL ON FUNCTION exec04_owner_ok(jsonb,boolean),exec04_network(),exec04_contact(text,uuid),exec04_permission(text,text,timestamptz,uuid,uuid),exec04_available(uuid,uuid),exec04_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION exec04_owner_ok(jsonb,boolean),exec04_network(),exec04_contact(text,uuid),exec04_permission(text,text,timestamptz,uuid,uuid),exec04_available(uuid,uuid),exec04_dispatch(jsonb) TO service_role;