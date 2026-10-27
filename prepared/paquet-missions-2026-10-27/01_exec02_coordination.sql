-- EXEC-02 PREPARED ONLY. Apply after schema.sql, never to the shared backend in this lot.
-- Uses material_offers, submissions, trips, request_followups, crm_notify, enqueue_email.
ALTER TABLE public.submission_fill_profile ADD COLUMN IF NOT EXISTS reception_policy jsonb;
ALTER TABLE public.submission_fill_profile ADD COLUMN IF NOT EXISTS reception_policy_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.material_offers ADD COLUMN IF NOT EXISTS reception_documents jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS received_quantity numeric;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS received_unit text;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS received_ticket_ref text;
CREATE TABLE public.submission_reception_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES submissions(id),
 offer_id uuid NOT NULL REFERENCES material_offers(id),origin_submission_id uuid NOT NULL REFERENCES submissions(id),
 quantity numeric NOT NULL,unit text NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending',expires_at timestamptz NOT NULL,
 accepted_at timestamptz,conditions_snapshot jsonb,policy_version integer,window_id uuid,
 fingerprint text NOT NULL,evaluation jsonb NOT NULL,offer_snapshot jsonb NOT NULL,evaluated_conditions jsonb,accepted_history jsonb NOT NULL DEFAULT '[]',
 counter_start timestamptz,counter_end timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.submission_reception_reservations TO service_role;
ALTER TABLE public.submission_reception_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reception_reservation_service ON public.submission_reception_reservations TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.submission_reception_operations (
 actor text NOT NULL,operation_id uuid NOT NULL,input_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,operation_id)
);
GRANT ALL ON public.submission_reception_operations TO service_role;
ALTER TABLE public.submission_reception_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reception_operation_service ON public.submission_reception_operations TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.submission_reception_debits (
 trip_id uuid PRIMARY KEY REFERENCES trips(id),reservation_id uuid UNIQUE NOT NULL REFERENCES submission_reception_reservations(id),
 submission_id uuid NOT NULL REFERENCES submissions(id),quantity numeric NOT NULL,unit text NOT NULL,ticket_ref text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(submission_id,ticket_ref)
);
GRANT SELECT,INSERT ON public.submission_reception_debits TO service_role;
ALTER TABLE public.submission_reception_debits ENABLE ROW LEVEL SECURITY;
CREATE POLICY reception_debit_service ON public.submission_reception_debits TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.submission_portal_dispatches (
 dedupe_key text PRIMARY KEY,submission_id uuid NOT NULL REFERENCES submissions(id),input_hash text NOT NULL,queue_id bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.submission_portal_dispatches TO service_role;
ALTER TABLE public.submission_portal_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY reception_dispatch_service ON public.submission_portal_dispatches TO service_role USING(true) WITH CHECK(true);
CREATE TRIGGER reception_debit_immutable BEFORE UPDATE OR DELETE ON public.submission_reception_debits FOR EACH ROW EXECUTE FUNCTION exec01_events_immutable();

CREATE FUNCTION public.exec02_exception(_id uuid,_reason text,_next text,_reference uuid DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f uuid;
BEGIN
 INSERT INTO request_followups(entity_type,entity_id,follow_status,next_action,reminder_reason,next_reminder_at)
 VALUES('submission',_id,'en_attente',_next,_reason,now()+interval '1 day')
 ON CONFLICT(entity_type,entity_id) DO UPDATE SET next_action=excluded.next_action,reminder_reason=excluded.reminder_reason,next_reminder_at=excluded.next_reminder_at,follow_status='en_attente',resolved_at=NULL RETURNING id INTO f;
 INSERT INTO request_followup_events(followup_id,entity_type,entity_id,action,detail)
 VALUES(f,'submission',_id,'exec02_exception',jsonb_build_object('reason',_reason,'next',_next,'reference',_reference));
 PERFORM crm_notify('exec02-'||_id||'-'||coalesce(_reference::text,_reason),'demandes','reception_exception','importante','Réception à vérifier',_reason,'submission',_id,'/admin/centre-controle',NULL,NULL,NULL,jsonb_build_object('next_action',_next),false);
END $$;
REVOKE ALL ON FUNCTION public.exec02_exception(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec02_exception(uuid,text,text,uuid) TO service_role;

-- One service RPC: canonical actor verified by the edge; private credentials never returned.
CREATE FUNCTION public.exec02_dispatch(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s submissions;l submission_portal_links;o material_offers;r submission_reception_reservations;t trips;
 c jsonb;pol jsonb;slot jsonb;kind text:=p->>'kind';role_name text:=p->>'role';actor_key text;
 res jsonb;prior submission_reception_operations;d submission_portal_dispatches;key text;qh bigint;
 reserved numeric;slot_reserved numeric;source_reserved numeric;fp text;ver integer;compatible boolean;target_state text;old_start timestamptz;old_end timestamptz;origin submissions;
BEGIN
 SELECT * INTO s FROM submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL OR s.request_type<>'remblai' OR s.parcours_direction IS DISTINCT FROM 'reception' THEN RETURN jsonb_build_object('denied',true);END IF;
 IF role_name='owner' THEN
  SELECT * INTO l FROM submission_portal_links WHERE id=(p->>'linkId')::uuid AND submission_id=s.id FOR UPDATE;
  IF l.id IS NULL OR l.secret_hash IS DISTINCT FROM p->>'secretHash' OR l.expires_at<=now() OR l.revoked_at IS NOT NULL OR l.contact_hash IS DISTINCT FROM encode(digest(lower(trim(s.email)),'sha256'),'hex') THEN RETURN jsonb_build_object('denied',true);END IF;
  actor_key:='owner:'||l.id;
  IF kind<>'list' AND (l.verified_at IS NULL OR l.verified_at<now()-interval '10 minutes' OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb) THEN RETURN jsonb_build_object('denied',true);END IF;
 ELSIF role_name='admin' THEN actor_key:='admin:'||coalesce(p->>'actorId','system');
 ELSIF role_name='entrepreneur' AND p->>'actorId' IS NOT NULL THEN actor_key:='entrepreneur:'||(p->>'actorId');
 ELSE RETURN jsonb_build_object('denied',true);END IF;
 IF role_name='entrepreneur' AND NOT public.is_entrepreneur_visible_dompe(s) THEN RETURN jsonb_build_object('denied',true);END IF;
 SELECT reception_conditions,reception_policy,reception_policy_version INTO c,pol,ver FROM submission_fill_profile WHERE submission_id=s.id;
 IF kind='list' THEN
  RETURN jsonb_build_object('total',(c->>'total')::numeric,'remaining',(c->>'remaining')::numeric,'unit',c->>'unit','policy',CASE WHEN role_name='entrepreneur' THEN CASE WHEN pol IS NULL THEN NULL ELSE jsonb_build_object('mode',pol->>'mode') END ELSE pol END,
   'reserved',(SELECT coalesce(sum(a.quantity),0) FROM submission_reception_reservations a JOIN material_offers mo ON mo.id=a.offer_id WHERE a.submission_id=s.id AND a.state='reserved' AND a.expires_at>now() AND (role_name<>'entrepreneur' OR mo.owner_user_id=(p->>'actorId')::uuid)),
   'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'offerId',a.offer_id,'originId',a.origin_submission_id,'reference','R-'||left(a.id::text,8),'quantity',a.quantity,'unit',a.unit,'start',a.starts_at,'end',a.ends_at,'state',CASE WHEN a.state IN ('pending','reserved') AND a.expires_at<=now() THEN 'expired' ELSE a.state END,'vehicle',a.offer_snapshot->>'vehicle_type','components',a.offer_snapshot->'components','reasons',a.evaluation->'reasons','expiresAt',a.expires_at,'acceptedAt',a.accepted_at,'counterStart',a.counter_start,'counterEnd',a.counter_end)) FROM submission_reception_reservations a JOIN material_offers mo ON mo.id=a.offer_id WHERE a.submission_id=s.id AND (role_name<>'entrepreneur' OR mo.owner_user_id=(p->>'actorId')::uuid)),'[]'::jsonb),
   'offers',CASE WHEN role_name='owner' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',coalesce(principal_material,'inconnu'))) FROM material_offers WHERE role_name='admin' OR owner_user_id=(p->>'actorId')::uuid),'[]'::jsonb) END,
   'exceptions',CASE WHEN role_name<>'admin' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('reason',e.detail->>'reason','at',e.created_at,'next',e.detail->>'next')) FROM request_followup_events e WHERE e.entity_type='submission' AND e.entity_id=s.id AND e.action='exec02_exception'),'[]'::jsonb) END);
 END IF;
 IF kind='context' THEN
  IF role_name='owner' THEN RETURN jsonb_build_object('denied',true);END IF;
  SELECT * INTO o FROM material_offers WHERE id=(p->>'offerId')::uuid FOR UPDATE;
  IF o.id IS NULL OR (role_name='entrepreneur' AND o.owner_user_id IS DISTINCT FROM (p->>'actorId')::uuid) THEN RETURN jsonb_build_object('denied',true);END IF;
  RETURN jsonb_build_object('offer',to_jsonb(o),'conditions',c,'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('condition_key',condition_key,'stance',stance)) FROM submission_material_conditions WHERE submission_id=s.id),'[]'::jsonb));
 END IF;
 IF kind='mail' THEN
  IF role_name<>'admin' OR s.exec01_contact_verified_at IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;
  key:=p->>'dedupeKey';SELECT * INTO d FROM submission_portal_dispatches WHERE dedupe_key=key;
  IF FOUND THEN IF d.submission_id<>s.id OR d.input_hash<>p->>'inputHash' THEN RETURN jsonb_build_object('denied',true);END IF;RETURN jsonb_build_object('ok',true,'queued',true,'replay',true);END IF;
  IF s.email IS NULL OR s.email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN PERFORM exec02_exception(s.id,'Contact invalide','Vérifier le contact');RETURN jsonb_build_object('denied',true);END IF;
  IF p->'message'->>'blocked'='true' THEN RETURN jsonb_build_object('ok',true,'suppressed',true);END IF;
  IF lower(trim(p->'message'->>'to')) IS DISTINCT FROM lower(trim(s.email)) THEN RETURN jsonb_build_object('denied',true);END IF;
  INSERT INTO submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at) VALUES((p->>'nextId')::uuid,s.id,p->>'nextHash',encode(digest(lower(trim(s.email)),'sha256'),'hex'),now()+interval '30 days');
  qh:=enqueue_email('transactional_emails',(p->'message')||jsonb_build_object('to',s.email,'recipientEmail',s.email,'idempotency_key',key,'purpose','transactional','tracking',false));
  INSERT INTO submission_portal_dispatches(dedupe_key,submission_id,input_hash,queue_id) VALUES(key,s.id,p->>'inputHash',qh);
  RETURN jsonb_build_object('ok',true,'queued',true);
 END IF;
 IF p->>'operationId' IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;
 SELECT * INTO prior FROM submission_reception_operations ops WHERE ops.actor=actor_key AND operation_id=(p->>'operationId')::uuid;
 IF FOUND THEN IF prior.input_hash<>p->>'inputHash' THEN RETURN jsonb_build_object('denied',true);END IF;RETURN prior.result;END IF;
 IF kind='policy' THEN
  IF role_name<>'owner' OR c IS NULL OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb OR s.availability_status<>'available' OR s.exec01_owner_confirmed_at IS NULL OR s.revalidation_requested_at IS NOT NULL THEN RETURN jsonb_build_object('denied',true);END IF;
  pol:=p->'policy';
  IF pol->>'mode' NOT IN ('preautorisee','creneaux','par_demande') OR (pol->>'end')::timestamptz<=(pol->>'start')::timestamptz OR c->>'unit'='inconnu' OR c->>'remaining' IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;
  IF pol->>'mode'<>'par_demande' AND (c->>'total' IS NULL OR c->>'minimumDelivery' IS NULL OR c->>'minimumDay' IS NULL OR c->>'progressive'='inconnu' OR c->>'presence'='inconnu' OR coalesce(c->>'access','')='' OR coalesce(c->>'hours','')='' OR c->>'environmental'<>'documente' OR c->>'projectFit'<>'adapte' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'materials') m WHERE m->>'stance'='accepte') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'vehicles') v WHERE v->>'stance'='accepte') OR jsonb_array_length(pol->'windows')=0) THEN RETURN jsonb_build_object('denied',true);END IF;
  UPDATE submission_fill_profile SET reception_policy=pol||jsonb_build_object('conditions',c,'acceptedAt',now()),reception_policy_version=reception_policy_version+1 WHERE submission_id=s.id;
  INSERT INTO submission_portal_events(submission_id,action,version) VALUES(s.id,'conditions_reception_acceptees',s.exec01_version);
  res:=jsonb_build_object('ok',true);
 ELSE
  IF kind='propose' THEN
   IF role_name='owner' THEN RETURN jsonb_build_object('denied',true);END IF;
   SELECT * INTO o FROM material_offers WHERE id=(p->>'offerId')::uuid FOR UPDATE;
   SELECT * INTO origin FROM submissions WHERE id=o.source_id;
   IF o.id IS NULL OR o.source_type<>'chantier' OR origin.id IS NULL OR origin.parcours_direction IS DISTINCT FROM 'evacuation' OR (role_name='entrepreneur' AND o.owner_user_id IS DISTINCT FROM (p->>'actorId')::uuid) OR to_jsonb(o) IS DISTINCT FROM p->'expectedOffer' OR c IS DISTINCT FROM p->'expectedConditions' THEN RETURN jsonb_build_object('denied',true);END IF;
   IF (p->>'quantity')::numeric<=0 OR (p->>'end')::timestamptz<=(p->>'start')::timestamptz OR (p->>'start')::timestamptz<=now() THEN RETURN jsonb_build_object('denied',true);END IF;
   fp:=encode(digest(to_jsonb(o)::text,'sha256'),'hex');
   INSERT INTO submission_reception_reservations(submission_id,offer_id,origin_submission_id,quantity,unit,starts_at,ends_at,expires_at,evaluation,offer_snapshot,fingerprint,evaluated_conditions)
   VALUES(s.id,o.id,origin.id,(p->>'quantity')::numeric,p->>'unit',(p->>'start')::timestamptz,(p->>'end')::timestamptz,least((p->>'start')::timestamptz,now()+interval '48 hours'),p->'evaluation',jsonb_build_object('vehicle_type',o.vehicle_type,'components',to_jsonb(array_remove(ARRAY[o.principal_material]||o.secondary_materials||o.trace_materials,NULL))),fp,c) RETURNING * INTO r;
   IF p->'evaluation'->>'result'='INCOMPATIBLE' THEN UPDATE submission_reception_reservations SET state='refused' WHERE id=r.id;PERFORM exec02_exception(s.id,'Matériau refusé','Examiner les composantes refusées',r.id);
   ELSIF p->'evaluation'->>'result'<>'COMPATIBLE' THEN PERFORM exec02_exception(s.id,'Matériau ou conditions incertains','Valider les informations manquantes',r.id);
   ELSIF pol->>'mode'='preautorisee' THEN kind:='reserve_auto';END IF;
   res:=jsonb_build_object('ok',true,'reservationId',r.id);
  ELSE
   SELECT * INTO r FROM submission_reception_reservations WHERE id=(p->>'reservationId')::uuid AND submission_id=s.id FOR UPDATE;
   IF r.id IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;
   SELECT * INTO o FROM material_offers WHERE id=r.offer_id FOR UPDATE;
   IF role_name='entrepreneur' AND o.owner_user_id IS DISTINCT FROM (p->>'actorId')::uuid THEN RETURN jsonb_build_object('denied',true);END IF;
   fp:=encode(digest(to_jsonb(o)::text,'sha256'),'hex');
  END IF;
  IF kind IN ('accept','reserve_auto','book') THEN
   IF (kind='accept' AND role_name<>'owner') OR (kind='book' AND (role_name='owner' OR pol->>'mode' IS DISTINCT FROM 'creneaux')) OR (kind='reserve_auto' AND pol->>'mode' IS DISTINCT FROM 'preautorisee') THEN RETURN jsonb_build_object('denied',true);END IF;
   IF r.state<>'pending' OR r.expires_at<=now() OR s.availability_status<>'available' OR s.exec01_owner_confirmed_at IS NULL OR s.revalidation_requested_at IS NOT NULL THEN RETURN jsonb_build_object('denied',true);END IF;
   compatible:=r.evaluation->>'result'='COMPATIBLE' AND r.fingerprint=fp AND c IS NOT NULL AND (r.evaluated_conditions-'remaining')=(c-'remaining') AND NOT EXISTS(SELECT 1 FROM submission_material_conditions WHERE submission_id=s.id AND stance<>'accepted') AND (c->>'minimumDelivery')::numeric<=r.quantity AND (c->>'minimumDay')::numeric<=r.quantity AND (c->>'progressive'='oui' OR (c->>'progressive'='non' AND r.quantity=(c->>'remaining')::numeric));
   compatible:=compatible AND NOT EXISTS(SELECT 1 FROM submission_material_conditions requirement WHERE requirement.submission_id=s.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.reception_documents) proof WHERE proof->>'condition_key'=requirement.condition_key AND proof->>'status'='verified'));
   IF kind<>'accept' THEN compatible:=compatible AND ((pol->'conditions')-'remaining')=(c-'remaining') AND (pol->>'start')::timestamptz<=r.starts_at AND (pol->>'end')::timestamptz>=r.ends_at;END IF;
   SELECT x INTO slot FROM jsonb_array_elements(coalesce(pol->'windows','[]')) x WHERE (x->>'start')::timestamptz<=r.starts_at AND (x->>'end')::timestamptz>=r.ends_at LIMIT 1;
   IF kind<>'accept' AND (slot IS NULL OR (c->>'presence'='oui' AND slot->'presenceConfirmed' IS DISTINCT FROM 'true'::jsonb)) THEN compatible:=false;END IF;
   SELECT coalesce(sum(greatest(0,a.quantity-coalesce((SELECT sum(mm.quantity) FROM submission_reception_measurements mm WHERE mm.reservation_id=a.id AND NOT EXISTS(SELECT 1 FROM submission_reception_measurements newer WHERE newer.corrects=mm.id)),0))),0) INTO reserved FROM submission_reception_reservations a WHERE a.submission_id=s.id AND a.state='reserved' AND a.expires_at>now();
   SELECT coalesce(sum(CASE WHEN a.state='reserved' AND a.expires_at>now() THEN a.quantity ELSE coalesce((SELECT sum(mm.quantity) FROM submission_reception_measurements mm WHERE mm.reservation_id=a.id AND NOT EXISTS(SELECT 1 FROM submission_reception_measurements newer WHERE newer.corrects=mm.id)),0) END),0) INTO source_reserved FROM submission_reception_reservations a WHERE a.offer_id=o.id;
   SELECT coalesce(sum(a.quantity),0) INTO slot_reserved FROM submission_reception_reservations a WHERE a.submission_id=s.id AND a.state IN ('reserved','delivered') AND (a.expires_at>now() OR a.state='delivered') AND a.window_id=(slot->>'id')::uuid;
   IF NOT coalesce(compatible,false) OR o.quantity_value IS NULL OR r.unit IS DISTINCT FROM c->>'unit' OR r.unit IS DISTINCT FROM o.quantity_unit OR c->>'remaining' IS NULL OR r.quantity+reserved>(c->>'remaining')::numeric OR r.quantity+source_reserved>o.quantity_value OR (slot IS NOT NULL AND r.quantity+slot_reserved>(slot->>'capacity')::numeric) THEN
    PERFORM exec02_exception(s.id,'Conflit ou accord modifié','Relire les conditions et obtenir une nouvelle validation',r.id);res:=jsonb_build_object('ok',false,'review',true,'reservationId',r.id);
   ELSE
    UPDATE submission_reception_reservations SET state='reserved',accepted_at=now(),conditions_snapshot=jsonb_build_object('conditions',c,'policy',pol,'offer',offer_snapshot,'start',starts_at,'end',ends_at,'quantity',quantity,'unit',unit,'acceptedBy',actor_key,'at',now()),policy_version=ver,window_id=(slot->>'id')::uuid,expires_at=ends_at+interval '2 hours' WHERE id=r.id;
    res:=jsonb_build_object('ok',true,'reservationId',r.id,'state','reserved');
   END IF;
  ELSIF kind IN ('refuse','cancel','counter','change','exception','deliver','expire') THEN
   IF kind IN ('refuse','counter') AND role_name<>'owner' THEN RETURN jsonb_build_object('denied',true);END IF;
   IF kind IN ('exception','deliver','expire') AND role_name<>'admin' THEN RETURN jsonb_build_object('denied',true);END IF;
   IF kind='deliver' THEN
    SELECT * INTO t FROM trips WHERE id=(p->>'tripId')::uuid FOR UPDATE;
    IF EXISTS(SELECT 1 FROM submission_reception_debits WHERE trip_id=t.id) THEN
     IF NOT EXISTS(SELECT 1 FROM submission_reception_debits WHERE trip_id=t.id AND reservation_id=r.id AND submission_id=s.id) THEN RETURN jsonb_build_object('denied',true);END IF;
     RETURN jsonb_build_object('ok',true,'replay',true);
    ELSE
     IF r.state<>'reserved' OR r.expires_at<=now() OR r.policy_version IS DISTINCT FROM ver OR s.availability_status IN ('suspended','owner_closed') OR r.fingerprint<>fp OR ((r.conditions_snapshot->'conditions')-'remaining') IS DISTINCT FROM (c-'remaining') OR t.id IS NULL OR t.submission_id IS DISTINCT FROM s.id OR t.status::text NOT IN ('termine','facture','paye') OR t.delivered_at IS NULL OR t.received_quantity IS DISTINCT FROM r.quantity OR t.received_unit IS DISTINCT FROM r.unit OR coalesce(t.received_ticket_ref,'')='' THEN RETURN jsonb_build_object('denied',true);END IF;
     IF (c->>'remaining')::numeric<r.quantity THEN RETURN jsonb_build_object('denied',true);END IF;
     INSERT INTO submission_reception_debits(trip_id,reservation_id,submission_id,quantity,unit,ticket_ref) VALUES(t.id,r.id,s.id,r.quantity,r.unit,t.received_ticket_ref);
     UPDATE submission_fill_profile SET reception_conditions=jsonb_set(reception_conditions,'{remaining}',to_jsonb((c->>'remaining')::numeric-r.quantity)) WHERE submission_id=s.id;
     UPDATE submissions SET remaining_capacity=(((c->>'remaining')::numeric-r.quantity)::text||' '||r.unit) WHERE id=s.id;
     UPDATE submission_reception_reservations SET state='delivered' WHERE id=r.id;res:=jsonb_build_object('ok',true);
    END IF;
   ELSIF kind='counter' THEN
    IF r.state NOT IN ('pending','counter') THEN RETURN jsonb_build_object('denied',true);END IF;
    IF (p->>'start')::timestamptz<now() OR (p->>'end')::timestamptz<=(p->>'start')::timestamptz THEN RETURN jsonb_build_object('denied',true);END IF;
    UPDATE submission_reception_reservations SET state='counter',counter_start=(p->>'start')::timestamptz,counter_end=(p->>'end')::timestamptz WHERE id=r.id;res:=jsonb_build_object('ok',true);
   ELSIF kind='change' THEN
    IF role_name='owner' OR (p->>'start')::timestamptz<=now() OR (p->>'end')::timestamptz<=(p->>'start')::timestamptz THEN RETURN jsonb_build_object('denied',true);END IF;
    IF r.state IN ('delivered','refused','cancelled','expired') OR to_jsonb(o) IS DISTINCT FROM p->'expectedOffer' OR c IS DISTINCT FROM p->'expectedConditions' THEN RETURN jsonb_build_object('denied',true);END IF;
    UPDATE submission_reception_reservations SET state='pending',starts_at=(p->>'start')::timestamptz,ends_at=(p->>'end')::timestamptz,accepted_history=accepted_history||CASE WHEN conditions_snapshot IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(conditions_snapshot) END,accepted_at=NULL,conditions_snapshot=NULL,expires_at=least((p->>'start')::timestamptz,now()+interval '48 hours'),fingerprint=fp,evaluation=p->'evaluation',evaluated_conditions=c WHERE id=r.id;
    PERFORM exec02_exception(s.id,'Changement après accord','Propriétaire : valider à nouveau',r.id);res:=jsonb_build_object('ok',true);
   ELSIF kind='expire' THEN IF r.expires_at>now() THEN RETURN jsonb_build_object('denied',true);END IF;UPDATE submission_reception_reservations SET state='expired' WHERE id=r.id;PERFORM exec02_exception(s.id,'Absence de réponse ou expiration','Relancer ou annuler',r.id);res:=jsonb_build_object('ok',true);
   ELSE
    target_state:=CASE kind WHEN 'refuse' THEN 'refused' WHEN 'cancel' THEN 'cancelled' ELSE 'exception' END;
    IF r.state='delivered' THEN RETURN jsonb_build_object('denied',true);END IF;
    UPDATE submission_reception_reservations SET state=target_state WHERE id=r.id;
    IF kind='exception' THEN PERFORM exec02_exception(s.id,p->>'reason',p->>'next',r.id);END IF;res:=jsonb_build_object('ok',true);
   END IF;
  END IF;
 END IF;
 IF res IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;
 IF kind='change' THEN UPDATE submission_reception_reservations SET last_reminded_at=NULL,created_at=now() WHERE id=r.id;END IF;
 -- Link creation and queue insertion in THIS transaction: an enqueue failure rolls back all mutations.
 IF p->'message' IS NOT NULL AND p->'message'->>'blocked' IS DISTINCT FROM 'true' THEN
  IF lower(trim(p->'message'->>'to')) IS DISTINCT FROM lower(trim(s.email)) THEN RAISE EXCEPTION 'mail_contact_changed';END IF;
  -- Subject/html/text were rendered together; never mutate only the subject after rendering.
  IF s.exec01_contact_verified_at IS NULL OR s.email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN PERFORM exec02_exception(s.id,'Contact invalide','Vérifier le contact',r.id);
  ELSE
   INSERT INTO submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at) VALUES((p->>'nextId')::uuid,s.id,p->>'nextHash',encode(digest(lower(trim(s.email)),'sha256'),'hex'),now()+interval '30 days');
   qh:=enqueue_email('transactional_emails',p->'message'||jsonb_build_object('to',s.email,'recipientEmail',s.email,'idempotency_key',p->>'dedupeKey','purpose','transactional','tracking',false,'reception_guard',jsonb_build_object('submissionId',s.id,'reservationId',r.id,'kind',kind,'linkId',p->>'nextId')));
   INSERT INTO submission_portal_dispatches(dedupe_key,submission_id,input_hash,queue_id) VALUES(p->>'dedupeKey',s.id,p->>'inputHash',qh);
  END IF;
 END IF;
 INSERT INTO submission_reception_operations(actor,operation_id,input_hash,result) VALUES(actor_key,(p->>'operationId')::uuid,p->>'inputHash',res);
 INSERT INTO submission_portal_events(submission_id,action,version) VALUES(s.id,'exec02_'||kind,s.exec01_version);
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.exec02_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec02_dispatch(jsonb) TO service_role;