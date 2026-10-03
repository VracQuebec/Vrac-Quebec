CREATE TABLE public.log_trial_companies (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id),
  enabled_by uuid, enabled_at timestamptz NOT NULL DEFAULT now(), note text
);
GRANT SELECT ON public.log_trial_companies TO authenticated;
GRANT ALL ON public.log_trial_companies TO service_role;
ALTER TABLE public.log_trial_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log trial read" ON public.log_trial_companies FOR SELECT TO authenticated USING (public.fleet_can_access(company_id));

CREATE OR REPLACE FUNCTION public.log_enabled(_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.log_trial_companies WHERE company_id = _company)
$$;

CREATE OR REPLACE FUNCTION public.log_is_manager(_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR coalesce(public.fleet_member_role(_company) IN ('proprietaire','admin','gestionnaire'), false)
$$;

CREATE TABLE public.log_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  driver_user_id uuid NOT NULL,
  display_name text, license_number text, license_jurisdiction text,
  home_terminal text, home_terminal_address text,
  time_zone text NOT NULL DEFAULT 'America/Toronto',
  day_start time NOT NULL DEFAULT '00:00',
  cycle text NOT NULL DEFAULT 'a_determiner' CHECK (cycle IN ('cycle_1','cycle_2','a_determiner')),
  regime text NOT NULL DEFAULT 'a_determiner' CHECK (regime IN ('quebec_intraprovincial','federal','a_determiner')),
  history_status text NOT NULL DEFAULT 'incomplet' CHECK (history_status IN ('incomplet','partiel','complet_declare')),
  history_note text,
  current_truck_id uuid REFERENCES public.trucks(id),
  codriver_user_id uuid,
  version int NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, driver_user_id)
);
GRANT SELECT ON public.log_profiles TO authenticated;
GRANT ALL ON public.log_profiles TO service_role;
ALTER TABLE public.log_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log profiles read" ON public.log_profiles FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid() OR public.log_is_manager(company_id));

CREATE TABLE public.log_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.log_profiles(id),
  company_id uuid NOT NULL, driver_user_id uuid NOT NULL,
  version int NOT NULL, snapshot jsonb NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(), changed_by uuid,
  UNIQUE (profile_id, version)
);
GRANT SELECT ON public.log_profile_versions TO authenticated;
GRANT ALL ON public.log_profile_versions TO service_role;
ALTER TABLE public.log_profile_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log profile versions read" ON public.log_profile_versions FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid() OR public.log_is_manager(company_id));

CREATE TABLE public.log_vehicle_ext (
  truck_id uuid PRIMARY KEY REFERENCES public.trucks(id),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  has_sleeper text NOT NULL DEFAULT 'a_confirmer' CHECK (has_sleeper IN ('oui','non','a_confirmer')),
  is_leased text NOT NULL DEFAULT 'a_confirmer' CHECK (is_leased IN ('oui','non','a_confirmer')),
  lessor text, device_installed text, updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.log_vehicle_ext TO authenticated;
GRANT ALL ON public.log_vehicle_ext TO service_role;
ALTER TABLE public.log_vehicle_ext ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log vehicle read" ON public.log_vehicle_ext FOR SELECT TO authenticated USING (public.fleet_can_access(company_id));

CREATE TABLE public.log_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  driver_user_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  hours_rules text NOT NULL DEFAULT 'a_determiner' CHECK (hours_rules IN ('assujetti','non_assujetti_declare','a_determiner')),
  report_obligation text NOT NULL DEFAULT 'a_determiner' CHECK (report_obligation IN ('rapport_requis','registre_local_potentiel','a_determiner')),
  dce_obligation text NOT NULL DEFAULT 'a_determiner' CHECK (dce_obligation IN ('dce_obligatoire','hors_obligation_dce','a_determiner')),
  solution_coverage text NOT NULL DEFAULT 'prototype_non_certifie' CHECK (solution_coverage IN ('prototype_non_certifie','non_pris_en_charge')),
  path text NOT NULL DEFAULT 'D' CHECK (path IN ('A','B','C','D')),
  reasons text,
  evidence_paths text[] NOT NULL DEFAULT '{}',
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.log_qualifications TO authenticated;
GRANT ALL ON public.log_qualifications TO service_role;
ALTER TABLE public.log_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log qualif read" ON public.log_qualifications FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid() OR public.log_is_manager(company_id));

CREATE TABLE public.log_dce_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  truck_id uuid REFERENCES public.trucks(id),
  provider text, model text, device_identifier text, certification_number text, software_version text,
  verification_status text NOT NULL DEFAULT 'non_connecte' CHECK (verification_status IN ('non_connecte','a_verifier','verifie_manuellement')),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.log_dce_devices TO authenticated;
GRANT ALL ON public.log_dce_devices TO service_role;
ALTER TABLE public.log_dce_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log dce read" ON public.log_dce_devices FOR SELECT TO authenticated USING (public.log_is_manager(company_id));

CREATE TABLE public.log_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  driver_user_id uuid NOT NULL,
  truck_id uuid REFERENCES public.trucks(id),
  codriver_user_id uuid,
  duty_status text NOT NULL CHECK (duty_status IN ('repos','couchette','conduite','travail')),
  category text CHECK (category IN ('ronde','chargement','attente','pesee','dechargement','carburant','entretien','autre')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  time_zone text NOT NULL,
  utc_offset_min int NOT NULL,
  entered_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','importe')),
  root_id uuid NOT NULL,
  supersedes_id uuid REFERENCES public.log_events(id),
  revision int NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'actif' CHECK (state IN ('actif','remplace','propose','refuse','retire')),
  correction_reason text,
  decided_by uuid, decided_at timestamptz, decision_note text,
  note text,
  refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_version int,
  client_request_id text NOT NULL,
  validation_label text NOT NULL DEFAULT 'Prototype LOG-01 — non certifié',
  CHECK (ended_at IS NULL OR ended_at > started_at),
  UNIQUE (company_id, client_request_id)
);
CREATE INDEX log_events_driver_time ON public.log_events (company_id, driver_user_id, started_at);
GRANT SELECT ON public.log_events TO authenticated;
GRANT ALL ON public.log_events TO service_role;
ALTER TABLE public.log_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log events read" ON public.log_events FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid() OR public.log_is_manager(company_id));

CREATE OR REPLACE FUNCTION public.log_events_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Événement de logbook jamais supprimé'; END IF;
  IF (NEW.duty_status, NEW.started_at, NEW.ended_at, NEW.entered_at, NEW.received_at, NEW.actor_id, NEW.driver_user_id, NEW.company_id, NEW.truck_id, NEW.root_id, NEW.revision)
     IS DISTINCT FROM (OLD.duty_status, OLD.started_at, OLD.ended_at, OLD.entered_at, OLD.received_at, OLD.actor_id, OLD.driver_user_id, OLD.company_id, OLD.truck_id, OLD.root_id, OLD.revision) THEN
    RAISE EXCEPTION 'Événement figé : une correction crée une nouvelle version liée';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER log_events_freeze BEFORE UPDATE OR DELETE ON public.log_events FOR EACH ROW EXECUTE FUNCTION public.log_events_freeze();

CREATE TABLE public.log_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  driver_user_id uuid NOT NULL,
  event_root_id uuid, day date,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL, mime_type text,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.log_attachments TO authenticated;
GRANT ALL ON public.log_attachments TO service_role;
ALTER TABLE public.log_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log att read" ON public.log_attachments FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid() OR public.log_is_manager(company_id));

CREATE POLICY "log files read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'log-files' AND (
    ((storage.foldername(name))[2] = auth.uid()::text AND public.fleet_can_access(((storage.foldername(name))[1])::uuid))
    OR public.log_is_manager(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "log files insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'log-files' AND public.log_enabled(((storage.foldername(name))[1])::uuid) AND (
    ((storage.foldername(name))[2] = auth.uid()::text AND public.fleet_can_access(((storage.foldername(name))[1])::uuid))
    OR public.log_is_manager(((storage.foldername(name))[1])::uuid)));

CREATE OR REPLACE FUNCTION public.log_my_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT m.company_id, m.role, c.name INTO r FROM public.jsc_company_members m
  JOIN public.jsc_companies c ON c.id = m.company_id AND c.archived_at IS NULL
  WHERE m.user_id = auth.uid() AND m.is_active AND m.archived_at IS NULL
  ORDER BY (m.role='proprietaire') DESC, m.created_at LIMIT 1;
  IF r.company_id IS NULL THEN RETURN jsonb_build_object('company_id', null); END IF;
  RETURN jsonb_build_object('company_id', r.company_id, 'company_name', r.name, 'role', r.role,
    'enabled', public.log_enabled(r.company_id), 'manager', public.log_is_manager(r.company_id));
END $$;

CREATE OR REPLACE FUNCTION public.log_guard(_company uuid, _driver uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF NOT public.log_enabled(_company) THEN RAISE EXCEPTION 'Logbook non activé pour cette entreprise (essai privé)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jsc_company_members WHERE company_id=_company AND user_id=_driver AND is_active AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Conducteur hors de cette entreprise'; END IF;
  IF _driver <> auth.uid() AND NOT public.log_is_manager(_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_save_profile(p_company uuid, p_driver uuid, p jsonb, p_expected_version int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur public.log_profiles; v int;
BEGIN
  PERFORM public.log_guard(p_company, p_driver);
  IF nullif(p->>'current_truck_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trucks WHERE id=(p->>'current_truck_id')::uuid AND company_id=p_company) THEN
    RAISE EXCEPTION 'Véhicule hors de cette entreprise'; END IF;
  SELECT * INTO cur FROM public.log_profiles WHERE company_id=p_company AND driver_user_id=p_driver FOR UPDATE;
  IF cur.id IS NULL THEN
    INSERT INTO public.log_profiles (company_id, driver_user_id, version, updated_by) VALUES (p_company, p_driver, 0, auth.uid()) RETURNING * INTO cur;
  ELSIF p_expected_version IS DISTINCT FROM cur.version THEN
    RAISE EXCEPTION 'Conflit : le profil a été modifié par quelqu''un d''autre (version %). Rechargez.', cur.version;
  END IF;
  v := cur.version + 1;
  UPDATE public.log_profiles SET
    display_name = nullif(p->>'display_name',''), license_number = nullif(p->>'license_number',''),
    license_jurisdiction = nullif(p->>'license_jurisdiction',''), home_terminal = nullif(p->>'home_terminal',''),
    home_terminal_address = nullif(p->>'home_terminal_address',''),
    time_zone = coalesce(nullif(p->>'time_zone',''),'America/Toronto'),
    day_start = coalesce(nullif(p->>'day_start','')::time,'00:00'),
    cycle = coalesce(nullif(p->>'cycle',''),'a_determiner'), regime = coalesce(nullif(p->>'regime',''),'a_determiner'),
    history_status = coalesce(nullif(p->>'history_status',''),'incomplet'), history_note = nullif(p->>'history_note',''),
    current_truck_id = nullif(p->>'current_truck_id','')::uuid, codriver_user_id = nullif(p->>'codriver_user_id','')::uuid,
    version = v, updated_by = auth.uid(), updated_at = now()
  WHERE id = cur.id RETURNING * INTO cur;
  INSERT INTO public.log_profile_versions (profile_id, company_id, driver_user_id, version, snapshot, changed_by)
  VALUES (cur.id, p_company, p_driver, v, to_jsonb(cur), auth.uid());
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.log_save_vehicle(p_truck uuid, p jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  SELECT company_id INTO c FROM public.trucks WHERE id = p_truck;
  IF c IS NULL OR NOT public.log_is_manager(c) OR NOT public.log_enabled(c) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  INSERT INTO public.log_vehicle_ext (truck_id, company_id, has_sleeper, is_leased, lessor, device_installed, updated_by)
  VALUES (p_truck, c, coalesce(p->>'has_sleeper','a_confirmer'), coalesce(p->>'is_leased','a_confirmer'), nullif(p->>'lessor',''), nullif(p->>'device_installed',''), auth.uid())
  ON CONFLICT (truck_id) DO UPDATE SET has_sleeper=EXCLUDED.has_sleeper, is_leased=EXCLUDED.is_leased, lessor=EXCLUDED.lessor,
    device_installed=EXCLUDED.device_installed, updated_by=auth.uid(), updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.log_save_qualification(p_company uuid, p_driver uuid, p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a jsonb := coalesce(p->'answers','{}'::jsonb); pth text; dce text; rep text; hrs text; nid uuid;
BEGIN
  PERFORM public.log_guard(p_company, p_driver);
  hrs := coalesce(nullif(p->>'hours_rules',''),'a_determiner');
  rep := coalesce(nullif(p->>'report_obligation',''),'a_determiner');
  dce := coalesce(nullif(p->>'dce_obligation',''),'a_determiner');
  IF rep = 'registre_local_potentiel' AND NOT (coalesce((a->>'rayon_km_verifie')::boolean,false)
       AND coalesce((a->>'retour_terminus_verifie')::boolean,false)
       AND coalesce((a->>'repos_verifie')::boolean,false)
       AND coalesce((a->>'registres_exploitant_verifies')::boolean,false)) THEN
    rep := 'a_determiner';
  END IF;
  IF hrs = 'non_assujetti_declare' AND nullif(p->>'reasons','') IS NULL THEN hrs := 'a_determiner'; END IF;
  IF hrs <> 'assujetti' THEN pth := 'D';
  ELSIF dce = 'dce_obligatoire' THEN pth := 'C';
  ELSIF rep = 'registre_local_potentiel' AND dce = 'hors_obligation_dce' THEN pth := 'A';
  ELSIF rep = 'rapport_requis' AND dce = 'hors_obligation_dce' THEN pth := 'B';
  ELSE pth := 'D'; END IF;
  INSERT INTO public.log_qualifications (company_id, driver_user_id, answers, hours_rules, report_obligation, dce_obligation,
    solution_coverage, path, reasons, evidence_paths, reviewed_by)
  VALUES (p_company, p_driver, a, hrs, rep, dce, CASE WHEN pth IN ('C','D') THEN 'non_pris_en_charge' ELSE 'prototype_non_certifie' END,
    pth, nullif(p->>'reasons',''), coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'evidence_paths','[]'::jsonb))),'{}'), auth.uid())
  RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.log_overlap(p_company uuid, p_driver uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.log_events WHERE company_id=p_company AND driver_user_id=p_driver AND state='actif'
    AND (p_ignore IS NULL OR root_id <> p_ignore)
    AND tstzrange(started_at, coalesce(ended_at,'infinity')) && tstzrange(p_start, coalesce(p_end,'infinity'))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.log_add_event(p_company uuid, p_driver uuid, p jsonb, p_client_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex public.log_events; s timestamptz; e timestamptz; nid uuid := gen_random_uuid(); st text; pv int; tr uuid;
BEGIN
  PERFORM public.log_guard(p_company, p_driver);
  IF coalesce(p_client_id,'') = '' THEN RAISE EXCEPTION 'Identifiant de soumission requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('log:' || p_company::text || p_client_id));
  SELECT * INTO ex FROM public.log_events WHERE company_id=p_company AND client_request_id=p_client_id;
  IF ex.id IS NOT NULL THEN RETURN jsonb_build_object('id', ex.id, 'state', ex.state, 'duplicate', true); END IF;
  s := (p->>'started_at')::timestamptz; e := nullif(p->>'ended_at','')::timestamptz;
  IF s > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Activité future refusée'; END IF;
  IF e IS NOT NULL AND e > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Fin future refusée'; END IF;
  tr := nullif(p->>'truck_id','')::uuid;
  IF tr IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trucks WHERE id=tr AND company_id=p_company) THEN RAISE EXCEPTION 'Véhicule hors de cette entreprise'; END IF;
  st := CASE WHEN p_driver = auth.uid() THEN 'actif' ELSE 'propose' END;
  PERFORM pg_advisory_xact_lock(hashtext('logdrv:' || p_driver::text));
  IF st = 'actif' AND public.log_overlap(p_company, p_driver, s, e, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Chevauchement avec une activité existante'; END IF;
  SELECT version INTO pv FROM public.log_profiles WHERE company_id=p_company AND driver_user_id=p_driver;
  INSERT INTO public.log_events (id, company_id, driver_user_id, truck_id, codriver_user_id, duty_status, category, started_at, ended_at,
    time_zone, utc_offset_min, entered_at, actor_id, source, root_id, state, note, refs, profile_version, client_request_id, correction_reason)
  VALUES (nid, p_company, p_driver, tr, nullif(p->>'codriver_user_id','')::uuid, p->>'duty_status', nullif(p->>'category',''), s, e,
    coalesce(p->>'time_zone','America/Toronto'), coalesce((p->>'utc_offset_min')::int,0),
    coalesce(nullif(p->>'entered_at','')::timestamptz, now()), auth.uid(), 'manuel', nid, st, nullif(p->>'note',''),
    coalesce(p->'refs','{}'::jsonb), pv, p_client_id, CASE WHEN st='propose' THEN coalesce(nullif(p->>'reason',''),'Ajout proposé par le gestionnaire') END);
  RETURN jsonb_build_object('id', nid, 'state', st, 'duplicate', false);
END $$;

CREATE OR REPLACE FUNCTION public.log_correct_event(p_event uuid, p jsonb, p_reason text, p_client_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.log_events; ex public.log_events; s timestamptz; e timestamptz; nid uuid := gen_random_uuid(); st text; maxrev int;
BEGIN
  SELECT * INTO o FROM public.log_events WHERE id = p_event FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Événement introuvable'; END IF;
  PERFORM public.log_guard(o.company_id, o.driver_user_id);
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'Motif de correction requis'; END IF;
  SELECT * INTO ex FROM public.log_events WHERE company_id=o.company_id AND client_request_id=p_client_id;
  IF ex.id IS NOT NULL THEN RETURN jsonb_build_object('id', ex.id, 'state', ex.state, 'duplicate', true); END IF;
  IF o.state <> 'actif' THEN RAISE EXCEPTION 'Conflit : cette version n''est plus la version courante. Rechargez.'; END IF;
  s := coalesce(nullif(p->>'started_at','')::timestamptz, o.started_at);
  e := CASE WHEN p ? 'ended_at' THEN nullif(p->>'ended_at','')::timestamptz ELSE o.ended_at END;
  IF s > now() + interval '5 minutes' OR (e IS NOT NULL AND e > now() + interval '5 minutes') THEN RAISE EXCEPTION 'Heure future refusée'; END IF;
  st := CASE WHEN o.driver_user_id = auth.uid() THEN 'actif' ELSE 'propose' END;
  IF st = 'actif' AND public.log_overlap(o.company_id, o.driver_user_id, s, e, o.root_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Chevauchement avec une activité existante'; END IF;
  SELECT max(revision) INTO maxrev FROM public.log_events WHERE root_id = o.root_id;
  INSERT INTO public.log_events (id, company_id, driver_user_id, truck_id, codriver_user_id, duty_status, category, started_at, ended_at,
    time_zone, utc_offset_min, entered_at, actor_id, source, root_id, supersedes_id, revision, state, correction_reason, note, refs, profile_version, client_request_id)
  VALUES (nid, o.company_id, o.driver_user_id, o.truck_id, o.codriver_user_id, coalesce(nullif(p->>'duty_status',''), o.duty_status),
    CASE WHEN p ? 'category' THEN nullif(p->>'category','') ELSE o.category END, s, e, o.time_zone, coalesce((p->>'utc_offset_min')::int, o.utc_offset_min),
    coalesce(nullif(p->>'entered_at','')::timestamptz, now()), auth.uid(), o.source, o.root_id, o.id, maxrev + 1, st, p_reason,
    CASE WHEN p ? 'note' THEN nullif(p->>'note','') ELSE o.note END, o.refs, o.profile_version, p_client_id);
  IF st = 'actif' THEN UPDATE public.log_events SET state='remplace' WHERE id=o.id; END IF;
  RETURN jsonb_build_object('id', nid, 'state', st, 'duplicate', false);
END $$;

CREATE OR REPLACE FUNCTION public.log_decide(p_proposal uuid, p_accept boolean, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr public.log_events; base public.log_events;
BEGIN
  SELECT * INTO pr FROM public.log_events WHERE id = p_proposal FOR UPDATE;
  IF pr.id IS NULL OR pr.state <> 'propose' THEN RAISE EXCEPTION 'Proposition introuvable ou déjà traitée'; END IF;
  IF pr.driver_user_id <> auth.uid() THEN RAISE EXCEPTION 'Seul le chauffeur concerné accepte ou refuse'; END IF;
  IF NOT public.log_enabled(pr.company_id) THEN RAISE EXCEPTION 'Logbook non activé'; END IF;
  IF NOT p_accept THEN
    UPDATE public.log_events SET state='refuse', decided_by=auth.uid(), decided_at=now(), decision_note=p_note WHERE id=pr.id; RETURN;
  END IF;
  IF pr.supersedes_id IS NOT NULL THEN
    SELECT * INTO base FROM public.log_events WHERE id = pr.supersedes_id FOR UPDATE;
    IF base.state <> 'actif' THEN RAISE EXCEPTION 'Conflit : l''original a changé depuis la proposition'; END IF;
  END IF;
  IF public.log_overlap(pr.company_id, pr.driver_user_id, pr.started_at, pr.ended_at, pr.root_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Chevauchement avec une activité existante'; END IF;
  IF base.id IS NOT NULL THEN UPDATE public.log_events SET state='remplace' WHERE id=base.id; END IF;
  UPDATE public.log_events SET state='actif', decided_by=auth.uid(), decided_at=now(), decision_note=p_note WHERE id=pr.id;
END $$;

CREATE OR REPLACE FUNCTION public.log_register_attachment(p_company uuid, p_driver uuid, p_path text, p_name text, p_mime text, p_day date, p_root uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid;
BEGIN
  PERFORM public.log_guard(p_company, p_driver);
  IF split_part(p_path,'/',1) <> p_company::text OR split_part(p_path,'/',2) <> p_driver::text THEN RAISE EXCEPTION 'Chemin invalide'; END IF;
  INSERT INTO public.log_attachments (company_id, driver_user_id, event_root_id, day, storage_path, file_name, mime_type, uploaded_by)
  VALUES (p_company, p_driver, p_root, p_day, p_path, p_name, p_mime, auth.uid()) RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.log_save_dce(p_company uuid, p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid;
BEGIN
  IF NOT public.log_is_manager(p_company) OR NOT public.log_enabled(p_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  INSERT INTO public.log_dce_devices (company_id, truck_id, provider, model, device_identifier, certification_number, software_version, verification_status, created_by)
  VALUES (p_company, nullif(p->>'truck_id','')::uuid, nullif(p->>'provider',''), nullif(p->>'model',''), nullif(p->>'device_identifier',''),
    nullif(p->>'certification_number',''), nullif(p->>'software_version',''), 'non_connecte', auth.uid())
  RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.log_admin_set_trial(p_company uuid, p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé au super admin'; END IF;
  IF p_enabled THEN
    INSERT INTO public.log_trial_companies (company_id, enabled_by) VALUES (p_company, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.log_trial_companies WHERE company_id = p_company; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_company_drivers(p_company uuid) RETURNS TABLE(user_id uuid, role text, email text, display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.log_is_manager(p_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY SELECT m.user_id, m.role::text, u.email::text, p.display_name
  FROM public.jsc_company_members m JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.log_profiles p ON p.company_id = m.company_id AND p.driver_user_id = m.user_id
  WHERE m.company_id = p_company AND m.is_active AND m.archived_at IS NULL ORDER BY u.email;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_add_event(uuid,uuid,jsonb,text), public.log_correct_event(uuid,jsonb,text,text), public.log_decide(uuid,boolean,text),
  public.log_save_profile(uuid,uuid,jsonb,int), public.log_save_qualification(uuid,uuid,jsonb), public.log_save_vehicle(uuid,jsonb),
  public.log_register_attachment(uuid,uuid,text,text,text,date,uuid), public.log_save_dce(uuid,jsonb), public.log_admin_set_trial(uuid,boolean),
  public.log_company_drivers(uuid), public.log_my_context() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.log_add_event(uuid,uuid,jsonb,text), public.log_correct_event(uuid,jsonb,text,text), public.log_decide(uuid,boolean,text),
  public.log_save_profile(uuid,uuid,jsonb,int), public.log_save_qualification(uuid,uuid,jsonb), public.log_save_vehicle(uuid,jsonb),
  public.log_register_attachment(uuid,uuid,text,text,text,date,uuid), public.log_save_dce(uuid,jsonb), public.log_admin_set_trial(uuid,boolean),
  public.log_company_drivers(uuid), public.log_my_context() TO authenticated;
