-- PREPARED ONLY. Never apply to the shared backend during EXEC-01B.
-- Additive extension of the existing dossier, not a second CRM.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS exec01_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS exec01_contact_verified_at timestamptz;
ALTER TABLE public.submission_fill_profile ADD COLUMN IF NOT EXISTS reception_conditions jsonb;
CREATE TABLE public.submission_portal_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES public.submissions(id),
 secret_hash text NOT NULL, contact_hash text NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, code_hash text, code_expires_at timestamptz, verified_at timestamptz,
 failures integer NOT NULL DEFAULT 0, code_requested_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.submission_portal_links TO service_role;
ALTER TABLE public.submission_portal_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_service ON public.submission_portal_links TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.submission_portal_operations (
 link_id uuid NOT NULL REFERENCES public.submission_portal_links(id), operation_id uuid NOT NULL,
 input_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(link_id, operation_id)
);
GRANT ALL ON public.submission_portal_operations TO service_role;
ALTER TABLE public.submission_portal_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_operations_service ON public.submission_portal_operations TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.submission_portal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES public.submissions(id),
 action text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.submission_portal_events TO service_role;
GRANT SELECT ON public.submission_portal_events TO authenticated;
ALTER TABLE public.submission_portal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_events_admin ON public.submission_portal_events TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY portal_events_service ON public.submission_portal_events TO service_role USING (true) WITH CHECK (true);
CREATE FUNCTION public.exec01_version_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.exec01_version := OLD.exec01_version + 1; RETURN NEW; END $$;
CREATE TRIGGER exec01_version BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.exec01_version_guard();
CREATE FUNCTION public.exec01_events_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'immutable_history'; END $$;
CREATE TRIGGER exec01_events_immutable BEFORE UPDATE OR DELETE ON public.submission_portal_events FOR EACH ROW EXECUTE FUNCTION public.exec01_events_immutable();

-- Public projection: no contact, internal notes, or bearer/code state.
CREATE FUNCTION public.exec01_projection(_id uuid, _crm boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',s.id,'reference','Demande #'||coalesce(s.submission_number::text,'TEST'),
 'name',s.name,'city',s.city,'status',s.status,'version',s.exec01_version,
 'availability',CASE WHEN s.availability_status IN ('suspended','owner_closed') THEN s.availability_status
 WHEN s.revalidation_requested_at IS NOT NULL OR s.exec01_contact_verified_at IS NULL THEN 'a_confirmer' ELSE s.availability_status END,
 'lastConfirmed',CASE WHEN s.revalidation_requested_at IS NULL THEN s.availability_updated_at ELSE NULL END,
 'conditions',p.reception_conditions,'proposals','[]'::jsonb,'deliveries','[]'::jsonb) ||
 CASE WHEN _crm THEN jsonb_build_object('history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'action',action,'at',created_at,'version',version) ORDER BY created_at) FROM public.submission_portal_events WHERE submission_id=_id),'[]'::jsonb)) ELSE '{}'::jsonb END
 FROM public.submissions s LEFT JOIN public.submission_fill_profile p ON p.submission_id=s.id WHERE s.id=_id
$$;
REVOKE ALL ON FUNCTION public.exec01_projection(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec01_projection(uuid,boolean) TO service_role;

-- The edge endpoint validates Zod conditions; only service_role can invoke this RPC.
-- All operations serialize on the same submissions row (including concurrent CRM writes).
CREATE FUNCTION public.exec01_dispatch(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.submissions; l public.submission_portal_links; old_conditions jsonb; c jsonb;
 kind text:=p->>'kind'; a text:=p->>'action'; result jsonb; previous public.submission_portal_operations; item jsonb;
BEGIN
 SELECT * INTO s FROM public.submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL THEN RETURN jsonb_build_object('denied',true); END IF;
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
  IF s.exec01_contact_verified_at IS NULL OR l.code_requested_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('denied',true); END IF;
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
  IF s.exec01_contact_verified_at IS NULL THEN UPDATE public.submissions SET exec01_contact_verified_at=now() WHERE id=s.id; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF s.exec01_contact_verified_at IS NULL THEN RETURN jsonb_build_object('denied',true); END IF;
 IF kind='read' THEN RETURN public.exec01_projection(s.id); END IF;
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
  IF c IS NULL OR c->>'environmental' IS DISTINCT FROM coalesce(old_conditions->>'environmental','a_valider') OR c->>'projectFit' IS DISTINCT FROM coalesce(old_conditions->>'projectFit','a_valider') THEN RETURN jsonb_build_object('denied',true); END IF;
  INSERT INTO public.submission_fill_profile(submission_id,reception_conditions,capacity_kind,capacity_value,capacity_unit,accepted_truck_codes,access_notes,source)
  VALUES(s.id,c,CASE WHEN c->>'total' IS NULL THEN 'unknown' ELSE 'known' END,(c->>'total')::numeric,nullif(c->>'unit','inconnu'),ARRAY(SELECT x->>'name' FROM jsonb_array_elements(c->'vehicles') x WHERE x->>'stance'='accepte'),c->>'access','user_manual')
  ON CONFLICT(submission_id) DO UPDATE SET reception_conditions=excluded.reception_conditions,capacity_kind=excluded.capacity_kind,capacity_value=excluded.capacity_value,capacity_unit=excluded.capacity_unit,accepted_truck_codes=excluded.accepted_truck_codes,access_notes=excluded.access_notes,source='user_manual',updated_at=now();
  FOR item IN SELECT value FROM jsonb_array_elements(c->'materials') LOOP
   INSERT INTO public.submission_material_conditions(submission_id,condition_key,stance,source)
   VALUES(s.id,item->>'name',CASE item->>'stance' WHEN 'accepte' THEN 'accepted' WHEN 'refuse' THEN 'forbidden' ELSE 'unknown' END,'user_manual')
   ON CONFLICT(submission_id,condition_key) DO UPDATE SET stance=excluded.stance,source='user_manual',updated_at=now();
  END LOOP;
  UPDATE public.submissions SET quantity_value=(c->>'total')::numeric,quantity_unit=nullif(c->>'unit','inconnu'),
   remaining_capacity=CASE WHEN c->>'remaining' IS NULL THEN NULL ELSE (c->>'remaining')||' '||(c->>'unit') END,
   opening_hours=c->>'hours',truck_types_allowed=ARRAY(SELECT x->>'name' FROM jsonb_array_elements(c->'vehicles') x WHERE x->>'stance'='accepte'),
   access_details=coalesce(access_details,'{}'::jsonb)||jsonb_build_object('ownerReception',c->>'access'),availability_status='unavailable',revalidation_requested_at=now(),availability_updated_at=NULL,availability_source='owner_portal' WHERE id=s.id;
 ELSIF a IN ('pause','reprendre','fermer','confirmer') THEN
  IF a='confirmer' AND s.availability_status='suspended' THEN RETURN jsonb_build_object('denied',true); END IF;
  UPDATE public.submissions SET availability_status=CASE a WHEN 'pause' THEN 'suspended' WHEN 'fermer' THEN 'owner_closed' WHEN 'reprendre' THEN 'unavailable' ELSE 'available' END,
   revalidation_requested_at=CASE WHEN a='reprendre' THEN now() WHEN a='confirmer' THEN NULL ELSE revalidation_requested_at END,
   availability_updated_at=CASE WHEN a='confirmer' THEN now() ELSE availability_updated_at END,availability_source='owner_portal' WHERE id=s.id;
 ELSE RETURN jsonb_build_object('denied',true); END IF;
 SELECT target.* INTO s FROM public.submissions target WHERE target.id=(p->>'requestId')::uuid;
 INSERT INTO public.submission_portal_events(submission_id,action,version) VALUES(s.id,a,s.exec01_version);
 result:=public.exec01_projection(s.id);
 INSERT INTO public.submission_portal_operations(link_id,operation_id,input_hash,result) VALUES(l.id,(p->>'operationId')::uuid,p->>'inputHash',result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.exec01_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec01_dispatch(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.exec01_version_guard(),public.exec01_events_immutable() FROM PUBLIC,anon,authenticated;