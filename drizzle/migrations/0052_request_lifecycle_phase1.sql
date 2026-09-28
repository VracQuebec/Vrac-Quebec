-- Phase 1 : cycle de vie des demandes (additif)
ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'a_valider',
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS loading_point text,
  ADD COLUMN IF NOT EXISTS trailer_type text,
  ADD COLUMN IF NOT EXISTS truck_config text,
  ADD COLUMN IF NOT EXISTS access_conditions text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_request_reason text;

UPDATE public.transport_requests SET lifecycle_status = CASE status::text
  WHEN 'annulee' THEN 'annulee' WHEN 'refusee' THEN 'refusee' WHEN 'terminee' THEN 'terminee'
  WHEN 'en_cours' THEN 'en_cours' WHEN 'planifiee' THEN 'prete_transport'
  WHEN 'acceptee' THEN 'confirmee' WHEN 'en_attente_proprietaire' THEN 'attente_confirmation_dompe'
  ELSE 'a_valider' END;

ALTER TABLE public.transport_requests ADD CONSTRAINT transport_requests_lifecycle_chk CHECK (lifecycle_status IN
 ('a_valider','attente_confirmation_dompe','confirmee','revalidation_requise','prete_transport','en_cours','terminee','annulee','refusee','expiree'));

CREATE TABLE public.request_critical_fields (field text PRIMARY KEY, label text NOT NULL, is_active boolean NOT NULL DEFAULT true);
GRANT SELECT ON public.request_critical_fields TO authenticated;
GRANT ALL ON public.request_critical_fields TO service_role;
ALTER TABLE public.request_critical_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read critical fields" ON public.request_critical_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage critical fields" ON public.request_critical_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.request_critical_fields(field,label) VALUES
 ('dump_submission_id','Dompe'),('site_address','Adresse du chantier'),('loading_point','Point de chargement'),
 ('truck_type','Type de camion'),('trailer_type','Type de remorque'),('truck_config','Configuration du camion'),
 ('material_type','Matériau'),('material_other','Matériau (autre)'),('desired_date','Date'),('desired_time','Heure'),
 ('quantity','Quantité'),('quantity_unit','Unité'),('estimated_trips','Nombre de voyages'),('access_conditions','Conditions d''accès');

CREATE TABLE public.request_lifecycle_transitions (from_status text NOT NULL, to_status text NOT NULL, PRIMARY KEY(from_status,to_status));
GRANT SELECT ON public.request_lifecycle_transitions TO authenticated;
GRANT ALL ON public.request_lifecycle_transitions TO service_role;
ALTER TABLE public.request_lifecycle_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read transitions" ON public.request_lifecycle_transitions FOR SELECT TO authenticated USING (true);
INSERT INTO public.request_lifecycle_transitions VALUES
 ('a_valider','attente_confirmation_dompe'),('a_valider','refusee'),('a_valider','expiree'),
 ('attente_confirmation_dompe','confirmee'),('attente_confirmation_dompe','a_valider'),('attente_confirmation_dompe','refusee'),('attente_confirmation_dompe','expiree'),
 ('revalidation_requise','attente_confirmation_dompe'),('revalidation_requise','confirmee'),('revalidation_requise','refusee'),
 ('confirmee','prete_transport'),('confirmee','revalidation_requise'),
 ('prete_transport','en_cours'),('prete_transport','revalidation_requise'),('prete_transport','annulee'),
 ('en_cours','terminee'),('en_cours','annulee');

CREATE TABLE public.transport_request_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.transport_requests(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, version));
GRANT SELECT ON public.transport_request_versions TO authenticated;
GRANT ALL ON public.transport_request_versions TO service_role;
ALTER TABLE public.transport_request_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versions owner or admin" ON public.transport_request_versions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.transport_requests r WHERE r.id=request_id AND r.user_id=auth.uid()));

CREATE TABLE public.transport_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.transport_requests(id) ON DELETE RESTRICT,
  action text NOT NULL, from_status text, to_status text, version integer,
  reason text, details jsonb NOT NULL DEFAULT '{}',
  actor_id uuid, actor_role text, origin text NOT NULL DEFAULT 'systeme',
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.transport_request_events(request_id, created_at);
GRANT SELECT ON public.transport_request_events TO authenticated;
GRANT ALL ON public.transport_request_events TO service_role;
ALTER TABLE public.transport_request_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events owner or admin" ON public.transport_request_events FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.transport_requests r WHERE r.id=request_id AND r.user_id=auth.uid()));

-- v1 pour l'existant (backfill)
INSERT INTO public.transport_request_versions(request_id,version,snapshot,created_at)
SELECT r.id,1,to_jsonb(r),r.created_at FROM public.transport_requests r;

-- Verrou : statut de cycle de vie modifiable seulement via fonctions
CREATE OR REPLACE FUNCTION public.trq_lifecycle_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status OR NEW.current_version IS DISTINCT FROM OLD.current_version
      OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at)
     AND coalesce(current_setting('vq.lifecycle', true),'') <> 'on'
     AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'lifecycle_locked: utiliser les fonctions serveur';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trq_lifecycle_guard BEFORE UPDATE ON public.transport_requests FOR EACH ROW EXECUTE FUNCTION public.trq_lifecycle_guard();

CREATE OR REPLACE FUNCTION public.trq_on_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO transport_request_versions(request_id,version,snapshot,created_by) VALUES (NEW.id,1,to_jsonb(NEW),auth.uid());
  INSERT INTO transport_request_events(request_id,action,to_status,version,actor_id,origin)
  VALUES (NEW.id,'creee',NEW.lifecycle_status,1,coalesce(auth.uid(),NEW.user_id),CASE WHEN NEW.user_id IS NOT NULL THEN 'entrepreneur' ELSE 'systeme' END);
  RETURN NEW;
END $$;
CREATE TRIGGER trq_on_insert AFTER INSERT ON public.transport_requests FOR EACH ROW EXECUTE FUNCTION public.trq_on_insert();

CREATE OR REPLACE FUNCTION public.trq_actor_role(_rid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN public.has_role(auth.uid(),'admin') THEN 'admin'
              WHEN EXISTS(SELECT 1 FROM transport_requests WHERE id=_rid AND user_id=auth.uid()) THEN 'entrepreneur' END $$;

-- Modification
CREATE OR REPLACE FUNCTION public.request_update(_id uuid, _changes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r transport_requests; role text; k text; changed text[] := '{}'; crit text[] := '{}';
  allowed text[] := ARRAY['dump_submission_id','site_address','loading_point','truck_type','trailer_type','truck_config','material_type','material_other','desired_date','desired_time','quantity','quantity_unit','estimated_trips','access_conditions','client_notes'];
  newst text; newver int;
BEGIN
  role := trq_actor_role(_id);
  IF role IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO r FROM transport_requests WHERE id=_id FOR UPDATE;
  IF r.lifecycle_status IN ('terminee','annulee','refusee','expiree','en_cours') THEN RAISE EXCEPTION 'not_editable'; END IF;
  IF role='entrepreneur' AND (r.lifecycle_status='prete_transport' OR r.driver_id IS NOT NULL OR r.truck_id IS NOT NULL) THEN
    RAISE EXCEPTION 'transport_assigned: contacter Vrac Québec'; END IF;
  PERFORM set_config('vq.lifecycle','on',true);
  FOR k IN SELECT jsonb_object_keys(_changes) LOOP
    IF NOT k = ANY(allowed) THEN RAISE EXCEPTION 'field_not_allowed: %', k; END IF;
    IF (to_jsonb(r)->k) IS DISTINCT FROM (_changes->k) THEN
      EXECUTE format('UPDATE transport_requests SET %I = ($1->>%L)::%s WHERE id=$2', k, k,
        (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.transport_requests'::regclass AND attname=k))
      USING _changes, _id;
      changed := changed || k;
      IF EXISTS(SELECT 1 FROM request_critical_fields WHERE field=k AND is_active) THEN crit := crit || k; END IF;
    END IF;
  END LOOP;
  IF array_length(changed,1) IS NULL THEN RETURN jsonb_build_object('changed',false); END IF;
  newst := r.lifecycle_status; newver := r.current_version;
  IF array_length(crit,1) IS NOT NULL THEN
    newver := r.current_version + 1;
    IF r.lifecycle_status IN ('attente_confirmation_dompe','confirmee','prete_transport') THEN newst := 'revalidation_requise'; END IF;
    UPDATE transport_requests SET current_version=newver, lifecycle_status=newst, updated_at=now() WHERE id=_id;
    INSERT INTO transport_request_versions(request_id,version,snapshot,changed_fields,created_by)
      SELECT _id,newver,to_jsonb(t),crit,auth.uid() FROM transport_requests t WHERE t.id=_id;
  END IF;
  INSERT INTO transport_request_events(request_id,action,from_status,to_status,version,details,actor_id,actor_role,origin)
  VALUES (_id, CASE WHEN newst<>r.lifecycle_status THEN 'revalidation_requise' ELSE 'modifiee' END, r.lifecycle_status,newst,newver,
    jsonb_build_object('changed',changed,'critical',crit,'before',(SELECT jsonb_object_agg(c, to_jsonb(r)->c) FROM unnest(changed) c)),
    auth.uid(),role,role);
  RETURN jsonb_build_object('changed',true,'version',newver,'status',newst,'critical',crit);
END $$;

-- Annulation directe
CREATE OR REPLACE FUNCTION public.request_cancel(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r transport_requests; role text;
BEGIN
  role := trq_actor_role(_id);
  IF role IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO r FROM transport_requests WHERE id=_id FOR UPDATE;
  IF r.lifecycle_status IN ('terminee','annulee','refusee','expiree') THEN RAISE EXCEPTION 'not_cancellable'; END IF;
  IF role='entrepreneur' AND (r.lifecycle_status IN ('prete_transport','en_cours') OR r.driver_id IS NOT NULL OR r.truck_id IS NOT NULL) THEN
    RAISE EXCEPTION 'transport_assigned: soumettre une demande d''annulation'; END IF;
  PERFORM set_config('vq.lifecycle','on',true);
  UPDATE transport_requests SET lifecycle_status='annulee', cancelled_at=now(), cancelled_by=auth.uid(), cancel_reason=_reason, updated_at=now() WHERE id=_id;
  INSERT INTO transport_request_events(request_id,action,from_status,to_status,version,reason,details,actor_id,actor_role,origin)
  VALUES (_id,'annulee',r.lifecycle_status,'annulee',r.current_version,_reason,
    jsonb_build_object('dompe_was_confirmed', r.lifecycle_status IN ('confirmee','prete_transport')),auth.uid(),role,role);
  RETURN jsonb_build_object('status','annulee');
END $$;

-- Demande d'annulation (après assignation)
CREATE OR REPLACE FUNCTION public.request_cancel_request(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r transport_requests; role text;
BEGIN
  role := trq_actor_role(_id);
  IF role IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO r FROM transport_requests WHERE id=_id FOR UPDATE;
  IF r.lifecycle_status IN ('terminee','annulee','refusee','expiree') THEN RAISE EXCEPTION 'not_cancellable'; END IF;
  UPDATE transport_requests SET cancellation_requested_at=now(), cancellation_request_reason=_reason WHERE id=_id;
  INSERT INTO transport_request_events(request_id,action,from_status,to_status,version,reason,actor_id,actor_role,origin)
  VALUES (_id,'annulation_demandee',r.lifecycle_status,r.lifecycle_status,r.current_version,_reason,auth.uid(),role,role);
  RETURN jsonb_build_object('requested',true);
END $$;

-- Transition admin
CREATE OR REPLACE FUNCTION public.request_transition(_id uuid, _to text, _reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r transport_requests;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO r FROM transport_requests WHERE id=_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM request_lifecycle_transitions WHERE from_status=r.lifecycle_status AND to_status=_to) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> %', r.lifecycle_status, _to; END IF;
  PERFORM set_config('vq.lifecycle','on',true);
  UPDATE transport_requests SET lifecycle_status=_to,
    cancelled_at = CASE WHEN _to='annulee' THEN now() ELSE cancelled_at END,
    cancelled_by = CASE WHEN _to='annulee' THEN auth.uid() ELSE cancelled_by END,
    cancel_reason = CASE WHEN _to='annulee' THEN coalesce(_reason,cancellation_request_reason) ELSE cancel_reason END,
    updated_at=now() WHERE id=_id;
  INSERT INTO transport_request_events(request_id,action,from_status,to_status,version,reason,actor_id,actor_role,origin)
  VALUES (_id,'transition',r.lifecycle_status,_to,r.current_version,_reason,auth.uid(),'admin','admin');
  RETURN jsonb_build_object('status',_to);
END $$;

REVOKE ALL ON FUNCTION public.request_update(uuid,jsonb), public.request_cancel(uuid,text), public.request_cancel_request(uuid,text), public.request_transition(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_update(uuid,jsonb), public.request_cancel(uuid,text), public.request_cancel_request(uuid,text), public.request_transition(uuid,text,text) TO authenticated;

CREATE OR REPLACE VIEW public.transport_requests_a_identifier WITH (security_invoker=on) AS
  SELECT id, request_number, client_name, client_company, client_email, client_phone, created_at, status, lifecycle_status
  FROM public.transport_requests WHERE user_id IS NULL;
GRANT SELECT ON public.transport_requests_a_identifier TO authenticated;