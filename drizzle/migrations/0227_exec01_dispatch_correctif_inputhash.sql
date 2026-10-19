CREATE OR REPLACE FUNCTION public.exec01_dispatch(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.submissions; l public.submission_portal_links; old_conditions jsonb; c jsonb;
 kind text:=p->>'kind'; a text:=p->>'action'; result jsonb; previous public.submission_portal_operations; item jsonb;
BEGIN
 SELECT * INTO s FROM public.submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL OR s.request_type <> 'remblai' OR s.parcours_direction IS DISTINCT FROM 'reception' OR coalesce(s.deliver_or_remove,'') ILIKE '%sortir%' THEN RETURN jsonb_build_object('denied',true); END IF;
 IF kind='crm' THEN RETURN public.exec01_projection(s.id,true); END IF;
 IF kind='issue' THEN
  IF s.email IS NULL THEN RETURN jsonb_build_object('denied',true); END IF;
  INSERT INTO public.submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at)
   VALUES((p->>'linkId')::uuid,s.id,p->>'secretHash',encode(digest(lower(trim(s.email)),'sha256'),'hex'),now()+interval '30 days');
  RETURN jsonb_build_object('ok',true,'contact',s.email,'name',s.name);
 END IF;
 SELECT * INTO l FROM public.submission_portal_links WHERE id=(p->>'linkId')::uuid AND submission_id=s.id FOR UPDATE;
 IF l.id IS NULL OR l.secret_hash IS DISTINCT FROM p->>'secretHash' OR l.revoked_at IS NOT NULL
  OR l.contact_hash IS DISTINCT FROM encode(digest(lower(trim(s.email)),'sha256'),'hex') THEN RETURN jsonb_build_object('denied',true); END IF;
 IF kind='renew' THEN
  IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash OR l.verified_at IS NULL OR l.failures>=5 OR l.code_requested_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('denied',true); END IF;
  UPDATE public.submission_portal_links SET revoked_at=now() WHERE submission_id=s.id AND revoked_at IS NULL;
  INSERT INTO public.submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at)
   VALUES((p->>'nextId')::uuid,s.id,p->>'nextHash',l.contact_hash,now()+interval '30 days');
  RETURN jsonb_build_object('ok',true,'contact',s.email,'name',s.name);
 END IF;
 IF l.expires_at<=now() THEN RETURN jsonb_build_object('denied',true); END IF;
 IF kind='code' THEN
  IF l.failures>=5 OR l.code_requested_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('denied',true); END IF;
  UPDATE public.submission_portal_links SET code_hash=p->>'codeHash',code_expires_at=now()+interval '10 minutes',verified_at=NULL,code_requested_at=now() WHERE id=l.id;
  RETURN jsonb_build_object('ok',true,'contact',s.email);
 END IF;
 IF kind='verify' THEN
  IF l.failures>=5 OR l.code_hash IS NULL OR l.code_expires_at<=now() THEN RETURN jsonb_build_object('denied',true); END IF;
  IF l.code_hash IS DISTINCT FROM p->>'codeHash' THEN
   UPDATE public.submission_portal_links SET failures=failures+1 WHERE id=l.id;
   RETURN jsonb_build_object('denied',true);
  END IF;
  UPDATE public.submission_portal_links SET code_hash=NULL,code_expires_at=NULL,verified_at=now(),failures=0 WHERE id=l.id;
  IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash THEN UPDATE public.submissions SET exec01_contact_verified_at=now(),exec01_verified_contact_hash=l.contact_hash WHERE id=s.id; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash THEN RETURN jsonb_build_object('denied',true); END IF;
 IF kind='read' THEN RETURN public.exec01_projection(s.id); END IF;
 IF kind='photo_authorize' THEN
  SELECT * INTO previous FROM submission_portal_operations WHERE link_id=l.id AND operation_id=(p->>'operationId')::uuid;
  IF FOUND AND previous.input_hash=p->>'inputHash' THEN RETURN jsonb_build_object('replay',previous.result); END IF;
  IF l.verified_at IS NULL OR l.verified_at<now()-interval '10 minutes' OR s.exec01_version<>(p->>'version')::integer THEN RETURN jsonb_build_object('denied',true); END IF;
  RETURN jsonb_build_object('ok',true,'conditions',(SELECT reception_conditions FROM submission_fill_profile WHERE submission_id=s.id));
 END IF;
 IF kind NOT IN ('act','revoke') OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb OR l.verified_at IS NULL OR l.verified_at<now()-interval '10 minutes' THEN RETURN jsonb_build_object('denied',true); END IF;
 IF kind='revoke' THEN
  UPDATE public.submission_portal_links SET revoked_at=now() WHERE id=l.id;
  INSERT INTO public.submission_portal_events(submission_id,action,version) VALUES(s.id,'revoquer',s.exec01_version);
  RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT * INTO previous FROM public.submission_portal_operations WHERE link_id=l.id AND operation_id=(p->>'operationId')::uuid;
 IF FOUND THEN
  IF previous.input_hash IS DISTINCT FROM p->>'inputHash' THEN RETURN jsonb_build_object('denied',true); END IF;
  RETURN previous.result;
 END IF;
 IF s.exec01_version<>(p->>'version')::integer OR s.availability_status='owner_closed' THEN RETURN jsonb_build_object('denied',true); END IF;
 SELECT reception_conditions INTO old_conditions FROM public.submission_fill_profile WHERE submission_id=s.id;
 IF a='modifier' THEN
  c:=p->'conditions';
  IF to_regclass('public.exec01_photo_files') IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'photos') photo JOIN public.exec01_photo_files f
    ON 'private:'||f.path=photo->>'preview' WHERE f.state IN ('deleting','removed'))
   THEN RETURN jsonb_build_object('denied',true); END IF;
  END IF;
  IF c IS NULL OR c->>'environmental' IS DISTINCT FROM coalesce(old_conditions->>'environmental','a_valider') OR c->>'projectFit' IS DISTINCT FROM coalesce(old_conditions->>'projectFit','a_valider') THEN RETURN jsonb_build_object('denied',true); END IF;
  INSERT INTO public.submission_fill_profile(submission_id,reception_conditions,capacity_kind,capacity_value,capacity_unit,accepted_truck_codes,access_notes,source)
  VALUES(s.id,c,CASE WHEN c->>'total' IS NULL THEN 'unknown' ELSE 'known' END,(c->>'total')::numeric,nullif(c->>'unit','inconnu'),ARRAY(SELECT x->>'name' FROM jsonb_array_elements(c->'vehicles') x WHERE x->>'stance'='accepte'),c->>'access','user_manual')
  ON CONFLICT(submission_id) DO UPDATE SET reception_conditions=excluded.reception_conditions,capacity_kind=excluded.capacity_kind,capacity_value=excluded.capacity_value,capacity_unit=excluded.capacity_unit,accepted_truck_codes=excluded.accepted_truck_codes,access_notes=excluded.access_notes,source='user_manual',updated_at=now();
  UPDATE public.submissions SET quantity_value=(c->>'total')::numeric,quantity_unit=nullif(c->>'unit','inconnu'),
   remaining_capacity=CASE WHEN c->>'remaining' IS NULL THEN NULL ELSE (c->>'remaining')||' '||(c->>'unit') END,
   exec01_owner_confirmed_at=NULL,opening_hours=c->>'hours',truck_types_allowed=ARRAY(SELECT x->>'name' FROM jsonb_array_elements(c->'vehicles') x WHERE x->>'stance'='accepte'),
   access_details=coalesce(access_details,'{}'::jsonb)||jsonb_build_object('ownerReception',c->>'access'),availability_status='unavailable',revalidation_requested_at=now(),availability_updated_at=NULL,availability_source='owner_portal' WHERE id=s.id;
 ELSIF a IN ('pause','reprendre','fermer','confirmer') THEN
  IF a='confirmer' AND s.availability_status='suspended' THEN RETURN jsonb_build_object('denied',true); END IF;
  UPDATE public.submissions SET availability_status=CASE a WHEN 'pause' THEN 'suspended' WHEN 'fermer' THEN 'owner_closed' WHEN 'reprendre' THEN 'unavailable' ELSE 'available' END,
   revalidation_requested_at=CASE WHEN a='reprendre' THEN now() WHEN a='confirmer' THEN NULL ELSE revalidation_requested_at END,
   exec01_owner_confirmed_at=CASE WHEN a='confirmer' THEN now() ELSE NULL END,availability_updated_at=CASE WHEN a='confirmer' THEN now() ELSE availability_updated_at END,availability_source='owner_portal' WHERE id=s.id;
 ELSE RETURN jsonb_build_object('denied',true); END IF;
 SELECT target.* INTO s FROM public.submissions target WHERE target.id=(p->>'requestId')::uuid;
 INSERT INTO public.submission_portal_events(submission_id,action,version) VALUES(s.id,a,s.exec01_version);
 result:=public.exec01_projection(s.id);
 INSERT INTO public.submission_portal_operations(link_id,operation_id,input_hash,result) VALUES(l.id,(p->>'operationId')::uuid,p->>'inputHash',result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.exec01_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec01_dispatch(jsonb) TO service_role;