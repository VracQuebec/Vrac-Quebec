
CREATE OR REPLACE FUNCTION public.cpn_can_sub(_sub uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM submissions s WHERE s.id=_sub AND (
      s.created_by = auth.uid()
      OR (s.email IS NOT NULL AND lower(s.email) = lower(current_user_email()))
      OR s.assigned_entrepreneur IN (SELECT e.id FROM entrepreneurs e WHERE e.user_id = auth.uid())))
$$;
CREATE OR REPLACE FUNCTION public.cpn_my_entrepreneur() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM entrepreneurs WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.cpn_can_sub(uuid), public.cpn_my_entrepreneur() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpn_can_sub(uuid), public.cpn_my_entrepreneur() TO authenticated;

CREATE TABLE public.cpn_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('recu','livre')),
  kind text NOT NULL CHECK (kind IN ('voyage','total_jour')),
  trip_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Toronto')::date,
  count integer NOT NULL DEFAULT 1 CHECK (count BETWEEN 0 AND 500),
  occurred_at timestamptz,
  entrepreneur_label text,
  entrepreneur_id uuid REFERENCES public.entrepreneurs(id) ON DELETE SET NULL,
  driver_label text,
  truck_label text,
  destination text,
  coupon_number bigint,
  photo_path text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cpn_trips_sub_day ON public.cpn_trips(submission_id, trip_date);
GRANT SELECT ON public.cpn_trips TO authenticated;
GRANT ALL ON public.cpn_trips TO service_role;
ALTER TABLE public.cpn_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips read" ON public.cpn_trips FOR SELECT TO authenticated
  USING (public.cpn_can_sub(submission_id) OR entrepreneur_id = public.cpn_my_entrepreneur());

CREATE OR REPLACE FUNCTION public.cpn_trip_add(_sub uuid, _side text, _kind text, _date date, _count integer,
  _ent_label text, _driver text, _truck text, _destination text, _coupon bigint, _photo text, _key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _ent uuid := cpn_my_entrepreneur();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
  IF _side NOT IN ('recu','livre') THEN RAISE EXCEPTION 'Côté invalide'; END IF;
  IF _side='recu' AND NOT cpn_can_sub(_sub) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _side='livre' AND _ent IS NULL AND NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Compte entrepreneur requis' USING ERRCODE='42501'; END IF;
  IF _kind NOT IN ('voyage','total_jour') THEN RAISE EXCEPTION 'Type invalide'; END IF;
  IF _date > (now() AT TIME ZONE 'America/Toronto')::date THEN RAISE EXCEPTION 'Date future refusée'; END IF;
  SELECT id INTO _id FROM cpn_trips WHERE id=_key; IF FOUND THEN RETURN _id; END IF;
  INSERT INTO cpn_trips(id, submission_id, side, kind, trip_date, count, occurred_at, entrepreneur_label, entrepreneur_id,
    driver_label, truck_label, destination, coupon_number, photo_path, created_by)
  VALUES (_key, _sub, _side, _kind, _date, CASE WHEN _kind='voyage' THEN 1 ELSE greatest(_count,0) END,
    CASE WHEN _kind='voyage' THEN now() END, nullif(trim(_ent_label),''), CASE WHEN _side='livre' THEN _ent END,
    nullif(trim(_driver),''), nullif(trim(_truck),''), nullif(trim(_destination),''), _coupon, nullif(_photo,''), auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.cpn_trip_void(_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'Motif requis'; END IF;
  UPDATE cpn_trips SET voided_at=now(), void_reason=trim(_reason)
   WHERE id=_id AND voided_at IS NULL AND (created_by=auth.uid() OR has_role(auth.uid(),'admin'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Saisie introuvable ou non modifiable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.cpn_trip_add, public.cpn_trip_void FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpn_trip_add, public.cpn_trip_void TO authenticated;

CREATE OR REPLACE FUNCTION public.cpn_photo_ok(_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN cpn_can_sub(split_part(_name,'/',1)::uuid);
EXCEPTION WHEN others THEN RETURN false;
END $$;
GRANT EXECUTE ON FUNCTION public.cpn_photo_ok(text) TO authenticated;
CREATE POLICY "cpn photos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='cpn-photos' AND public.cpn_photo_ok(name));
CREATE POLICY "cpn photos write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='cpn-photos' AND public.cpn_photo_ok(name));

CREATE TABLE public.svc_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('pepine','camion_10','camion_12','materiaux','preparation','finition','analyse_sol')),
  status text NOT NULL DEFAULT 'nouvelle' CHECK (status IN ('nouvelle','soumission','rendez_vous','prelevement','resultats','confirmee','refusee','annulee')),
  requester_name text, requester_email text, requester_phone text, site_address text,
  note text,
  availability_ok boolean NOT NULL DEFAULT false,
  zone_ok boolean NOT NULL DEFAULT false,
  access_ok boolean NOT NULL DEFAULT false,
  quote_amount numeric(12,2),
  appointment_at timestamptz,
  sampled_at timestamptz,
  partner text,
  result_summary text,
  staff_note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.svc_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.svc_requests(id) ON DELETE CASCADE,
  action text NOT NULL, from_status text, to_status text, note text,
  actor uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.svc_requests, public.svc_request_events TO authenticated;
GRANT ALL ON public.svc_requests, public.svc_request_events TO service_role;
ALTER TABLE public.svc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svc_request_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc read" ON public.svc_requests FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR created_by = auth.uid());
CREATE POLICY "svc ev read" ON public.svc_request_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.svc_request_create(_kind text, _sub uuid, _note text, _key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; s submissions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
  IF _sub IS NOT NULL AND NOT cpn_can_sub(_sub) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT id INTO _id FROM svc_requests WHERE id=_key; IF FOUND THEN RETURN _id; END IF;
  IF _sub IS NOT NULL THEN SELECT * INTO s FROM submissions WHERE id=_sub; END IF;
  INSERT INTO svc_requests(id, submission_id, kind, note, requester_name, requester_email, requester_phone, site_address, created_by)
  VALUES (_key, _sub, _kind, nullif(left(trim(coalesce(_note,'')),1000),''), s.name, coalesce(s.email, current_user_email()), s.phone,
    nullif(concat_ws(', ', s.address, s.city),''), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO svc_request_events(request_id, action, to_status, actor) VALUES (_id, 'creation', 'nouvelle', auth.uid());
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.svc_request_update(_id uuid, _status text, _availability boolean, _zone boolean, _access boolean,
  _quote numeric, _appointment timestamptz, _sampled timestamptz, _partner text, _result text, _staff_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r svc_requests;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM svc_requests WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF r.status IN ('confirmee','refusee','annulee') THEN RAISE EXCEPTION 'Demande close'; END IF;
  IF _status='confirmee' AND r.kind <> 'analyse_sol' AND NOT (coalesce(_availability,false) AND coalesce(_zone,false) AND coalesce(_access,false)) THEN
    RAISE EXCEPTION 'Disponibilité, zone desservie et accès au terrain doivent être vérifiés avant confirmation'; END IF;
  IF _status='resultats' AND coalesce(trim(_result),'')='' THEN RAISE EXCEPTION 'Résumé des résultats requis'; END IF;
  IF _status IN ('refusee','annulee') AND coalesce(length(trim(_staff_note)),0) < 3 THEN RAISE EXCEPTION 'Motif requis'; END IF;
  UPDATE svc_requests SET status=_status, availability_ok=coalesce(_availability,false), zone_ok=coalesce(_zone,false),
    access_ok=coalesce(_access,false), quote_amount=_quote, appointment_at=_appointment, sampled_at=_sampled,
    partner=nullif(trim(_partner),''), result_summary=nullif(trim(_result),''), staff_note=nullif(trim(_staff_note),''), updated_at=now()
  WHERE id=_id;
  INSERT INTO svc_request_events(request_id, action, from_status, to_status, note, actor)
  VALUES (_id, 'mise_a_jour', r.status, _status, nullif(trim(_staff_note),''), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.svc_request_create, public.svc_request_update FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svc_request_create, public.svc_request_update TO authenticated;

CREATE TABLE public.drv_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  entrepreneur_id uuid REFERENCES public.entrepreneurs(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  driver_label text, truck_label text,
  consent_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.drv_points (
  id bigserial PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES public.drv_missions(id) ON DELETE CASCADE,
  lat double precision NOT NULL, lng double precision NOT NULL,
  accuracy double precision,
  recorded_at timestamptz NOT NULL
);
CREATE INDEX drv_points_mission ON public.drv_points(mission_id, recorded_at);
GRANT SELECT ON public.drv_missions, public.drv_points TO authenticated;
GRANT ALL ON public.drv_missions, public.drv_points TO service_role;
ALTER TABLE public.drv_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drv_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missions read" ON public.drv_missions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR entrepreneur_id = public.cpn_my_entrepreneur());
CREATE POLICY "points read" ON public.drv_points FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM drv_missions m WHERE m.id=mission_id AND (m.user_id=auth.uid() OR has_role(auth.uid(),'admin') OR m.entrepreneur_id=public.cpn_my_entrepreneur())));

CREATE OR REPLACE FUNCTION public.drv_mission_start(_sub uuid, _driver text, _truck text, _consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
  IF NOT coalesce(_consent,false) THEN RAISE EXCEPTION 'Activation explicite du suivi requise'; END IF;
  SELECT id INTO _id FROM drv_missions WHERE user_id=auth.uid() AND ended_at IS NULL;
  IF FOUND THEN RETURN _id; END IF;
  INSERT INTO drv_missions(user_id, entrepreneur_id, submission_id, driver_label, truck_label, consent_at)
  VALUES (auth.uid(), cpn_my_entrepreneur(), _sub, nullif(trim(_driver),''), nullif(trim(_truck),''), now()) RETURNING id INTO _id;
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.drv_mission_point(_mission uuid, _lat double precision, _lng double precision, _acc double precision, _at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'Mission inactive' USING ERRCODE='42501'; END IF;
  IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Position invalide'; END IF;
  INSERT INTO drv_points(mission_id, lat, lng, accuracy, recorded_at) VALUES (_mission, _lat, _lng, _acc, least(coalesce(_at, now()), now()));
END $$;
CREATE OR REPLACE FUNCTION public.drv_mission_end(_mission uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE drv_missions SET ended_at=now() WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.drv_mission_start, public.drv_mission_point, public.drv_mission_end FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drv_mission_start, public.drv_mission_point, public.drv_mission_end TO authenticated;
