-- PRÉPARATION UNIQUEMENT. NON APPLIQUÉ EN PRODUCTION. Autorisation distincte requise.
-- Aucun GRANT, RLS, changement de table/index/colonne ni modification des dossiers existants.
-- N’annule aucune donnée ni échéance déjà enregistrée.
BEGIN;
DO $guard$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.exec01_dispatch(jsonb)'::regprocedure AND md5(pg_get_functiondef(p.oid))='0e22563a8ea2559e52cd7717d02921f9' AND r.rolname='postgres' AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND pg_get_function_result(p.oid)='jsonb' AND p.prosecdef=true AND to_jsonb(p.proconfig)='["search_path=public, extensions"]'::jsonb AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'REFERENCE_OR_RIGHTS_DRIFT_STOP'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.exec01_projection(uuid,boolean)'::regprocedure AND md5(pg_get_functiondef(p.oid))='effd16af586b2222d7a16c1ce2fcc8fe' AND r.rolname='postgres' AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND pg_get_function_result(p.oid)='jsonb' AND p.prosecdef=true AND to_jsonb(p.proconfig)='["search_path=public"]'::jsonb AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'REFERENCE_OR_RIGHTS_DRIFT_STOP'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.exec01_enqueue_confirmation(jsonb)'::regprocedure AND md5(pg_get_functiondef(p.oid))='6a85648de113e2c2c2b8aaf3c1bb9705' AND r.rolname='postgres' AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND pg_get_function_result(p.oid)='jsonb' AND p.prosecdef=true AND to_jsonb(p.proconfig)='["search_path=public, extensions"]'::jsonb AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'REFERENCE_OR_RIGHTS_DRIFT_STOP'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.exec01_dispatch(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.exec01_projection(_id uuid, _crm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object('id',s.id,'reference','Demande #'||coalesce(s.submission_number::text,'TEST'),
 'name',s.name,'city',s.city,'status',s.status,'version',s.exec01_version,
 'availability',CASE WHEN s.availability_status IN ('suspended','owner_closed') THEN s.availability_status
 WHEN s.revalidation_requested_at IS NOT NULL OR s.exec01_owner_confirmed_at IS NULL OR s.availability_status<>'available' THEN 'a_confirmer' ELSE 'available' END,
 'lastConfirmed',CASE WHEN s.revalidation_requested_at IS NULL THEN s.exec01_owner_confirmed_at ELSE NULL END,
 'conditions',p.reception_conditions,
 'legacy',jsonb_build_object('quantity_value',s.quantity_value,'quantity_unit',s.quantity_unit,'opening_hours',s.opening_hours,'capacity_kind',p.capacity_kind,'capacity_value',p.capacity_value,'capacity_unit',p.capacity_unit,'access_notes',p.access_notes),
 'proposals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label','Voyage proposé','status',t.status)) FROM trips t WHERE t.submission_id=s.id AND t.status::text IN ('demande','soumission_envoyee','accepte')),'[]'::jsonb),
 'deliveries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label','Voyage lié','status',t.status)) FROM trips t WHERE t.submission_id=s.id AND t.status::text NOT IN ('demande','soumission_envoyee','accepte','annule')),'[]'::jsonb),
 'operationalState','Voyages explicitement liés seulement; une planification ne confirme pas une réception. EXEC-02 : compatibilité et autorisation de livraison.',
 'receivedEvidence',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'date',t.trip_date,'count',t.count,'kind',t.kind)) FROM cpn_trips t WHERE t.submission_id=s.id AND t.side='recu' AND t.voided_at IS NULL),'[]'::jsonb)) ||
 CASE WHEN _crm THEN jsonb_build_object('history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'action',action,'at',created_at,'version',version) ORDER BY created_at) FROM public.submission_portal_events WHERE submission_id=_id),'[]'::jsonb)) ELSE '{}'::jsonb END
 FROM public.submissions s LEFT JOIN public.submission_fill_profile p ON p.submission_id=s.id WHERE s.id=_id
$function$
;
CREATE OR REPLACE FUNCTION public.exec01_enqueue_confirmation(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE s public.submissions; q bigint;
BEGIN
 SELECT * INTO s FROM public.submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL OR s.request_type<>'remblai' OR s.parcours_direction IS DISTINCT FROM 'reception'
 OR coalesce(s.deliver_or_remove,'') ILIKE '%sortir%' OR s.email IS NULL
 OR encode(digest(lower(trim(s.email)),'sha256'),'hex') IS DISTINCT FROM p->>'contactHash'
 OR s.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
 OR lower(trim(s.email)) ~ '@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$'
 THEN RETURN jsonb_build_object('denied',true); END IF;
 IF EXISTS(SELECT 1 FROM suppressed_emails WHERE email=lower(trim(s.email)))
 OR EXISTS(SELECT 1 FROM email_unsubscribe_tokens WHERE email=lower(trim(s.email)) AND used_at IS NOT NULL)
 THEN RETURN jsonb_build_object('denied',true); END IF;
 IF EXISTS(SELECT 1 FROM submission_portal_confirmations WHERE submission_id=s.id)
 THEN RETURN jsonb_build_object('ok',true,'replay',true); END IF;
 INSERT INTO submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at)
 VALUES((p->>'linkId')::uuid,s.id,p->>'secretHash',p->>'contactHash',now()+interval '30 days');
 q:=enqueue_email('transactional_emails',(p->'message')||jsonb_build_object(
  'to',s.email,'purpose','transactional','label','client-confirmation','tracking',false,
  'idempotency_key','client-confirm-'||s.id,'queued_at',now()));
 IF q IS NULL THEN RAISE EXCEPTION 'confirmation_not_queued'; END IF;
 INSERT INTO submission_portal_confirmations(submission_id,link_id,queue_id) VALUES(s.id,(p->>'linkId')::uuid,q);
 RETURN jsonb_build_object('ok',true,'queued',true);
END $function$
;DO $guard$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.exec01_dispatch(jsonb)'::regprocedure AND md5(pg_get_functiondef(p.oid))='2da0b80649cfacf5db57fe559adab3c2' AND r.rolname='postgres' AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND pg_get_function_result(p.oid)='jsonb' AND p.prosecdef=true AND to_jsonb(p.proconfig)='["search_path=public, extensions"]'::jsonb AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'REFERENCE_OR_RIGHTS_DRIFT_STOP'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.exec01_projection(uuid,boolean)'::regprocedure AND md5(pg_get_functiondef(p.oid))='e4cec3f904e15ec6ef264a22f71298c1' AND r.rolname='postgres' AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND pg_get_function_result(p.oid)='jsonb' AND p.prosecdef=true AND to_jsonb(p.proconfig)='["search_path=public"]'::jsonb AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'REFERENCE_OR_RIGHTS_DRIFT_STOP'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.exec01_enqueue_confirmation(jsonb)'::regprocedure AND md5(pg_get_functiondef(p.oid))='7262c4525163637476d42b57c8b63c82' AND r.rolname='postgres' AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND pg_get_function_result(p.oid)='jsonb' AND p.prosecdef=true AND to_jsonb(p.proconfig)='["search_path=public, extensions"]'::jsonb AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'REFERENCE_OR_RIGHTS_DRIFT_STOP'; END IF;
END $guard$;
COMMIT;
