-- PREPARED ONLY; apply after coordination.sql to an isolated authorized database.
ALTER TABLE submission_fill_profile ADD COLUMN reception_communication jsonb NOT NULL DEFAULT '{"serviceEmail":false,"reminderHours":24,"startHour":9,"endHour":17,"weekdays":[1,2,3,4,5]}';
ALTER TABLE submission_reception_reservations ADD COLUMN last_reminded_at timestamptz;
ALTER TABLE submission_reception_debits DROP CONSTRAINT submission_reception_debits_reservation_id_key;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS received_outcome text;
CREATE TABLE submission_reception_measurements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid NOT NULL REFERENCES trips(id),reservation_id uuid NOT NULL REFERENCES submission_reception_reservations(id),
 submission_id uuid NOT NULL REFERENCES submissions(id),quantity numeric NOT NULL,unit text NOT NULL,received_at timestamptz NOT NULL,ticket_ref text NOT NULL,
 outcome text NOT NULL,reason text,corrects uuid UNIQUE REFERENCES submission_reception_measurements(id),actor_id uuid NOT NULL,operation_id uuid UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON submission_reception_measurements TO service_role;
ALTER TABLE submission_reception_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY reception_measurement_service ON submission_reception_measurements TO service_role USING(true) WITH CHECK(true);
CREATE TRIGGER reception_measurement_immutable BEFORE UPDATE OR DELETE ON submission_reception_measurements FOR EACH ROW EXECUTE FUNCTION exec01_events_immutable();
ALTER FUNCTION exec02_dispatch(jsonb) RENAME TO exec02_dispatch_base;
CREATE FUNCTION exec02_due() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('requestId',r.submission_id,'reservationId',r.id,'kind',CASE WHEN r.expires_at<=now() THEN 'expire' ELSE 'remind' END,
 'operationId',(substr(md5(r.id::text||CASE WHEN r.expires_at<=now() THEN 'expire' ELSE 'remind' END||r.expires_at::text),1,8)||'-'||substr(md5(r.id::text),9,4)||'-4'||substr(md5(r.id::text),14,3)||'-a'||substr(md5(r.id::text),18,3)||'-'||substr(md5(r.expires_at::text),21,12))::uuid)),'[]'::jsonb)
 FROM submission_reception_reservations r JOIN submission_fill_profile f ON f.submission_id=r.submission_id
 WHERE (r.state IN ('pending','counter','reserved') AND r.expires_at<=now()) OR
 (r.state='pending' AND r.expires_at>now() AND r.last_reminded_at IS NULL AND f.reception_communication->>'serviceEmail'='true'
 AND r.created_at+make_interval(hours=>(f.reception_communication->>'reminderHours')::int)<=now()
 AND extract(isodow FROM now() AT TIME ZONE 'America/Toronto')::int IN (SELECT jsonb_array_elements_text(f.reception_communication->'weekdays')::int)
 AND extract(hour FROM now() AT TIME ZONE 'America/Toronto')>=(f.reception_communication->>'startHour')::int
 AND extract(hour FROM now() AT TIME ZONE 'America/Toronto')<(f.reception_communication->>'endHour')::int);
$$;
REVOKE ALL ON FUNCTION exec02_due() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION exec02_due() TO service_role;
CREATE FUNCTION exec02_dispatch(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s submissions;r submission_reception_reservations;t trips;m submission_reception_measurements;previous submission_reception_measurements;
 c jsonb;result jsonb;prior submission_reception_operations;actor text;old_quantity numeric:=0;delta numeric;effective numeric;reserved numeric;key text;qh bigint;kind text:=p->>'kind';comm jsonb;
BEGIN
 SELECT * INTO s FROM submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL OR s.request_type<>'remblai' OR s.parcours_direction IS DISTINCT FROM 'reception' THEN RETURN jsonb_build_object('denied',true);END IF;
 IF kind='mail_context' THEN
  -- Validate canonical access before returning contact to server-only renderer.
  result:=exec02_dispatch_base(p||jsonb_build_object('kind','list'));
  IF result->>'denied'='true' THEN RETURN result;END IF;
  RETURN jsonb_build_object('recipient',s.email,'verified',s.exec01_contact_verified_at IS NOT NULL);
 END IF;
 IF kind='deliver' THEN
  IF p->>'role'<>'admin' THEN RETURN jsonb_build_object('denied',true);END IF;
  SELECT * INTO t FROM trips WHERE id=(p->>'tripId')::uuid;
  SELECT * INTO m FROM submission_reception_measurements WHERE trip_id=t.id AND reservation_id=(p->>'reservationId')::uuid AND submission_id=s.id ORDER BY created_at DESC LIMIT 1;
  IF m.id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'replay',true);END IF;
  IF t.received_quantity IS NULL OR t.received_unit IS NULL OR t.received_ticket_ref IS NULL OR t.delivered_at IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;
  RETURN exec02_dispatch(p||jsonb_build_object('kind','measure','quantity',t.received_quantity,'unit',t.received_unit,'ticketRef',t.received_ticket_ref,'receivedAt',t.delivered_at,'outcome','accepted'));
 END IF;
 IF kind NOT IN ('measure','correct','remind','communication','list','expire') THEN RETURN exec02_dispatch_base(p);END IF;
 IF kind='list' THEN
  result:=exec02_dispatch_base(p);IF result->>'denied'='true' THEN RETURN result;END IF;
  SELECT reception_conditions INTO c FROM submission_fill_profile WHERE submission_id=s.id;
  SELECT coalesce(sum(m1.quantity),0) INTO effective FROM submission_reception_measurements m1 WHERE m1.submission_id=s.id AND NOT EXISTS(SELECT 1 FROM submission_reception_measurements m2 WHERE m2.corrects=m1.id);
  -- Completed measured slices no longer occupy reserved capacity.
  SELECT coalesce(sum(greatest(0,r1.quantity-coalesce((SELECT sum(m1.quantity) FROM submission_reception_measurements m1 WHERE m1.reservation_id=r1.id AND NOT EXISTS(SELECT 1 FROM submission_reception_measurements m2 WHERE m2.corrects=m1.id)),0))),0) INTO reserved FROM submission_reception_reservations r1 JOIN material_offers o ON o.id=r1.offer_id WHERE r1.submission_id=s.id AND r1.state='reserved' AND r1.expires_at>now() AND (p->>'role'<>'entrepreneur' OR o.owner_user_id=(p->>'actorId')::uuid);
  RETURN result||jsonb_build_object('reserved',reserved,'delivered',effective,'measurements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',mm.id,'tripId',mm.trip_id,'reservationId',mm.reservation_id,'quantity',mm.quantity,'unit',mm.unit,'receivedAt',mm.received_at,'ticketRef',mm.ticket_ref,'outcome',mm.outcome,'corrects',mm.corrects,'reason',mm.reason)) FROM submission_reception_measurements mm JOIN submission_reception_reservations rr ON rr.id=mm.reservation_id JOIN material_offers oo ON oo.id=rr.offer_id WHERE mm.submission_id=s.id AND (p->>'role'<>'entrepreneur' OR oo.owner_user_id=(p->>'actorId')::uuid)),'[]'::jsonb));
 END IF;
 IF kind='communication' THEN
  result:=exec02_dispatch_base(p||jsonb_build_object('kind','list'));IF result->>'denied'='true' OR p->>'role'<>'owner' OR p->>'confirmed'<>'true' OR NOT EXISTS(SELECT 1 FROM submission_portal_links WHERE id=(p->>'linkId')::uuid AND verified_at>now()-interval '10 minutes') THEN RETURN jsonb_build_object('denied',true);END IF;
 ELSE
  IF p->>'role'<>'admin' OR p->>'actorId' IS NULL OR p->>'confirmed'<>'true' THEN RETURN jsonb_build_object('denied',true);END IF;
 END IF;
 actor:=coalesce(p->>'role','')||':'||coalesce(p->>'actorId',p->>'linkId');
 SELECT * INTO prior FROM submission_reception_operations ops WHERE ops.actor=coalesce(p->>'role','')||':'||coalesce(p->>'actorId',p->>'linkId') AND ops.operation_id=(p->>'operationId')::uuid;
 IF FOUND THEN IF prior.input_hash IS DISTINCT FROM p->>'inputHash' THEN RETURN jsonb_build_object('denied',true);END IF;RETURN prior.result;END IF;
 SELECT reception_conditions,reception_communication INTO c,comm FROM submission_fill_profile WHERE submission_id=s.id;
 IF kind='communication' THEN
  UPDATE submission_fill_profile SET reception_communication=p->'communication' WHERE submission_id=s.id;result:=jsonb_build_object('ok',true);
 ELSE
  SELECT * INTO r FROM submission_reception_reservations WHERE id=(p->>'reservationId')::uuid AND submission_id=s.id FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;
  PERFORM 1 FROM material_offers WHERE id=r.offer_id FOR UPDATE;
  IF kind='remind' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(exec02_due()) x WHERE x->>'reservationId'=r.id::text AND x->>'kind'='remind') THEN RETURN jsonb_build_object('ok',true,'skipped',true);END IF;
   UPDATE submission_reception_reservations SET last_reminded_at=now() WHERE id=r.id;result:=jsonb_build_object('ok',true);
  ELSIF kind='expire' THEN
   IF r.state NOT IN ('pending','counter','reserved') OR r.expires_at>now() THEN RETURN jsonb_build_object('ok',true,'skipped',true);END IF;
   UPDATE submission_reception_reservations SET state='expired' WHERE id=r.id;PERFORM exec02_exception(s.id,'Absence de réponse ou expiration','Relancer ou annuler',r.id);result:=jsonb_build_object('ok',true);
  ELSE
   SELECT * INTO t FROM trips WHERE id=(p->>'tripId')::uuid FOR UPDATE;
   IF t.id IS NULL OR t.submission_id IS DISTINCT FROM s.id OR p->>'unit' IS DISTINCT FROM r.unit OR p->>'unit' IS DISTINCT FROM c->>'unit' OR coalesce(p->>'ticketRef','')='' OR (p->>'receivedAt')::timestamptz>now() OR (p->>'quantity')::numeric<0 OR p->>'outcome' NOT IN ('accepted','refused') OR (p->>'outcome'='refused' AND (p->>'quantity')::numeric<>0) THEN RETURN jsonb_build_object('denied',true);END IF;
   SELECT * INTO previous FROM submission_reception_measurements WHERE trip_id=t.id ORDER BY created_at DESC LIMIT 1;
   IF kind='measure' AND EXISTS(SELECT 1 FROM submission_reception_debits WHERE trip_id=t.id) THEN RETURN jsonb_build_object('denied',true);END IF;
   IF kind='correct' THEN
    IF previous.id IS NULL OR previous.id IS DISTINCT FROM (p->>'measurementId')::uuid OR previous.reservation_id<>r.id OR coalesce(p->>'reason','')='' THEN RETURN jsonb_build_object('denied',true);END IF;
    old_quantity:=previous.quantity;
   ELSIF previous.id IS NOT NULL THEN RETURN jsonb_build_object('denied',true);
   ELSIF r.state<>'reserved' OR r.expires_at<=now() OR t.status::text NOT IN ('termine','facture','paye') OR t.delivered_at IS NULL OR s.availability_status IN ('suspended','owner_closed') OR r.policy_version IS DISTINCT FROM (SELECT reception_policy_version FROM submission_fill_profile WHERE submission_id=s.id) OR ((r.conditions_snapshot->'conditions')-'remaining') IS DISTINCT FROM (c-'remaining') OR r.fingerprint IS DISTINCT FROM (SELECT encode(digest(to_jsonb(o)::text,'sha256'),'hex') FROM material_offers o WHERE o.id=r.offer_id) THEN RETURN jsonb_build_object('denied',true);END IF;
   IF EXISTS(SELECT 1 FROM submission_reception_measurements WHERE submission_id=s.id AND ticket_ref=p->>'ticketRef' AND trip_id<>t.id) THEN RETURN jsonb_build_object('denied',true);END IF;
   delta:=(p->>'quantity')::numeric-old_quantity;
   SELECT coalesce(sum(mm.quantity),0) INTO effective FROM submission_reception_measurements mm WHERE mm.reservation_id=r.id AND NOT EXISTS(SELECT 1 FROM submission_reception_measurements newer WHERE newer.corrects=mm.id);
   SELECT coalesce(sum(greatest(0,rr.quantity-coalesce((SELECT sum(mm.quantity) FROM submission_reception_measurements mm WHERE mm.reservation_id=rr.id AND NOT EXISTS(SELECT 1 FROM submission_reception_measurements newer WHERE newer.corrects=mm.id)),0))),0) INTO reserved FROM submission_reception_reservations rr WHERE rr.submission_id=s.id AND rr.id<>r.id AND rr.state='reserved' AND rr.expires_at>now();
   IF effective+delta>r.quantity OR effective+delta<0 OR delta>(c->>'remaining')::numeric-reserved THEN PERFORM exec02_exception(s.id,'Écart de quantité','Revalider la réservation avant de saisir la mesure',r.id);RETURN jsonb_build_object('ok',false,'review',true);END IF;
   INSERT INTO submission_reception_measurements(trip_id,reservation_id,submission_id,quantity,unit,received_at,ticket_ref,outcome,reason,corrects,actor_id,operation_id)
   VALUES(t.id,r.id,s.id,(p->>'quantity')::numeric,r.unit,(p->>'receivedAt')::timestamptz,p->>'ticketRef',p->>'outcome',p->>'reason',CASE WHEN kind='correct' THEN previous.id END,(p->>'actorId')::uuid,(p->>'operationId')::uuid) RETURNING * INTO m;
   UPDATE trips SET received_quantity=m.quantity,received_unit=m.unit,received_ticket_ref=m.ticket_ref,received_at=m.received_at,received_outcome=m.outcome WHERE id=t.id;
   IF kind='measure' AND m.quantity>0 THEN INSERT INTO submission_reception_debits(trip_id,reservation_id,submission_id,quantity,unit,ticket_ref) VALUES(t.id,r.id,s.id,m.quantity,m.unit,m.ticket_ref);END IF;
   UPDATE submission_fill_profile SET reception_conditions=jsonb_set(c,'{remaining}',to_jsonb((c->>'remaining')::numeric-delta)) WHERE submission_id=s.id;
   UPDATE submissions SET remaining_capacity=((c->>'remaining')::numeric-delta)::text||' '||r.unit WHERE id=s.id;
   UPDATE submission_reception_reservations rr SET state=CASE WHEN effective+delta=rr.quantity THEN 'delivered' WHEN m.outcome='refused' THEN 'exception' WHEN rr.expires_at<=now() THEN 'expired' ELSE 'reserved' END WHERE rr.id=r.id;
   IF m.outcome='refused' THEN PERFORM exec02_exception(s.id,'refus_arrivee','Vérifier le billet et les conditions avant reprise',r.id);END IF;
   result:=jsonb_build_object('ok',true,'measurementId',m.id,'delta',delta);
  END IF;
 END IF;
 IF p->'message' IS NOT NULL AND p->'message'->>'blocked' IS DISTINCT FROM 'true' AND s.exec01_contact_verified_at IS NOT NULL THEN
  INSERT INTO submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at) VALUES((p->>'nextId')::uuid,s.id,p->>'nextHash',encode(digest(lower(trim(s.email)),'sha256'),'hex'),now()+interval '30 days');
  key:=p->>'dedupeKey';qh:=enqueue_email('transactional_emails',p->'message'||jsonb_build_object('to',s.email,'idempotency_key',key,'purpose','transactional','tracking',false,'reception_guard',jsonb_build_object('submissionId',s.id,'reservationId',r.id,'kind',kind,'expiresAt',r.expires_at,'linkId',p->>'nextId')));
  INSERT INTO submission_portal_dispatches(dedupe_key,submission_id,input_hash,queue_id) VALUES(key,s.id,p->>'inputHash',qh);
 END IF;
 INSERT INTO submission_reception_operations(actor,operation_id,input_hash,result) VALUES(actor,(p->>'operationId')::uuid,p->>'inputHash',result);
 INSERT INTO submission_portal_events(submission_id,action,version) VALUES(s.id,'exec02_'||kind,s.exec01_version);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION exec02_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION exec02_dispatch(jsonb) TO service_role;
CREATE FUNCTION exec02_message_current(p jsonb) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM submissions s JOIN submission_portal_links l ON l.submission_id=s.id
 WHERE s.id=(p->'reception_guard'->>'submissionId')::uuid AND l.id=(p->'reception_guard'->>'linkId')::uuid
 AND s.exec01_contact_verified_at IS NOT NULL AND lower(trim(s.email))=lower(trim(p->>'to'))
 AND l.contact_hash=encode(digest(lower(trim(s.email)),'sha256'),'hex') AND l.revoked_at IS NULL AND l.expires_at>now()
 AND (p->'reception_guard'->>'kind'<>'remind' OR EXISTS(SELECT 1 FROM submission_reception_reservations r JOIN submission_fill_profile f ON f.submission_id=r.submission_id WHERE r.id=(p->'reception_guard'->>'reservationId')::uuid AND r.submission_id=s.id AND r.state='pending' AND r.expires_at>now() AND r.expires_at=(p->'reception_guard'->>'expiresAt')::timestamptz AND f.reception_communication->>'serviceEmail'='true'
 AND extract(isodow FROM now() AT TIME ZONE 'America/Toronto')::int IN (SELECT jsonb_array_elements_text(f.reception_communication->'weekdays')::int)
 AND extract(hour FROM now() AT TIME ZONE 'America/Toronto')>=(f.reception_communication->>'startHour')::int
 AND extract(hour FROM now() AT TIME ZONE 'America/Toronto')<(f.reception_communication->>'endHour')::int)));
$$;
REVOKE ALL ON FUNCTION exec02_message_current(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION exec02_message_current(jsonb) TO service_role;