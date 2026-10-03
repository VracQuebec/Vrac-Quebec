CREATE TABLE public.obl_company_ids (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  neq text CHECK (neq IS NULL OR neq ~ '^[0-9]{10}$'),
  nir text, rcv_ref text, legal_form text,
  updated_by uuid DEFAULT auth.uid(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.obl_company_ids TO authenticated;
GRANT ALL ON public.obl_company_ids TO service_role;
ALTER TABLE public.obl_company_ids ENABLE ROW LEVEL SECURITY;
CREATE POLICY obl_ids_read ON public.obl_company_ids FOR SELECT TO authenticated USING (public.entcrm_can_read(company_id));

CREATE TABLE public.obl_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('req_declaration','req_droits','vq_profil','rpevl_maj','rpevl_frais','rcv_droits','transport_autre')),
  period_year int NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  authority text NOT NULL, title text NOT NULL, description text,
  applicability text NOT NULL DEFAULT 'a_confirmer' CHECK (applicability IN ('applicable','non_applicable','a_confirmer')),
  due_date date, due_source text CHECK (due_source IN ('avis','dossier','attestation','previsionnelle')),
  due_confirmed boolean NOT NULL DEFAULT false,
  joint_group uuid, amount numeric(12,2) CHECK (amount IS NULL OR amount >= 0),
  combined_with_tax boolean, responsible_user uuid,
  status text NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert','realise','desactive')),
  done_on date, paid_on date, done_by uuid, done_at timestamptz, profile_checked_at timestamptz,
  proofs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(proofs)='array'),
  fin_ref jsonb,
  reminder_offsets jsonb NOT NULL DEFAULT '[{"k":"m3","months":3},{"k":"m2","months":2},{"k":"m1","months":1},{"k":"j21","days":21},{"k":"j14","days":14},{"k":"j7","days":7},{"k":"j1","days":1},{"k":"j0","days":0}]'::jsonb CHECK (jsonb_typeof(reminder_offsets)='array'),
  late_weekly boolean NOT NULL DEFAULT true,
  snooze_until date, agd_event_id uuid,
  previous_id uuid REFERENCES public.obl_items(id),
  rev int NOT NULL DEFAULT 1,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX obl_items_unique_std ON public.obl_items(company_id, kind, period_year) WHERE kind <> 'transport_autre';
CREATE INDEX obl_items_open ON public.obl_items(status, due_date) WHERE status = 'ouvert';
GRANT SELECT ON public.obl_items TO authenticated;
GRANT ALL ON public.obl_items TO service_role;
ALTER TABLE public.obl_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY obl_items_read ON public.obl_items FOR SELECT TO authenticated USING (public.entcrm_can_read(company_id));

CREATE TABLE public.obl_events (
  id bigserial PRIMARY KEY, item_id uuid REFERENCES public.obl_items(id) ON DELETE CASCADE, company_id uuid NOT NULL,
  action text NOT NULL, actor uuid DEFAULT auth.uid(), at timestamptz NOT NULL DEFAULT now(), detail jsonb
);
GRANT SELECT ON public.obl_events TO authenticated;
GRANT ALL ON public.obl_events TO service_role;
ALTER TABLE public.obl_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY obl_events_read ON public.obl_events FOR SELECT TO authenticated USING (public.entcrm_can_read(company_id));

CREATE TABLE public.obl_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.obl_items(id) ON DELETE CASCADE, company_id uuid NOT NULL,
  period_year int NOT NULL, due_date date NOT NULL, step text NOT NULL,
  user_id uuid NOT NULL, channel text NOT NULL CHECK (channel IN ('app','email')),
  state text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, item_id, period_year, due_date, step, user_id, channel)
);
GRANT SELECT ON public.obl_deliveries TO authenticated;
GRANT ALL ON public.obl_deliveries TO service_role;
ALTER TABLE public.obl_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY obl_deliv_read ON public.obl_deliveries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.entcrm_can_admin(company_id));

CREATE POLICY obl_proofs_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='obl-proofs' AND public.entcrm_can_read(((storage.foldername(name))[1])::uuid));
CREATE POLICY obl_proofs_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='obl-proofs' AND public.entcrm_can_write(((storage.foldername(name))[1])::uuid));

CREATE OR REPLACE FUNCTION public.obl_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Toronto')::date $$;

CREATE OR REPLACE FUNCTION public.obl_log(_item uuid, _company uuid, _action text, _detail jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO obl_events(item_id, company_id, action, detail) VALUES (_item, _company, _action, _detail)
$$;
REVOKE EXECUTE ON FUNCTION public.obl_log(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obl_sync_agenda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ev uuid; show boolean; owner uuid; s timestamptz;
BEGIN
  show := NEW.due_date IS NOT NULL AND NEW.applicability <> 'non_applicable' AND NEW.status <> 'desactive';
  owner := CASE WHEN EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id=NEW.company_id AND user_id=NEW.responsible_user AND is_active AND archived_at IS NULL) THEN NEW.responsible_user END;
  s := (NEW.due_date::timestamp AT TIME ZONE 'America/Toronto');
  IF NEW.agd_event_id IS NULL AND show THEN
    INSERT INTO agd_events(company_id,title,description,category,color,status,start_at,end_at,all_day,owner_user_id,reminders)
    VALUES (NEW.company_id, 'Échéance : '||NEW.title||' ('||NEW.period_year||')', NEW.authority||CASE WHEN NOT NEW.due_confirmed THEN ' · échéance à confirmer' ELSE '' END,
            'autre', CASE WHEN NEW.status='realise' THEN 'vert' ELSE 'orange' END, CASE WHEN NEW.status='realise' THEN 'termine' ELSE 'planifie' END,
            s, s + interval '23 hours 59 minutes', true, owner, '[]'::jsonb)
    RETURNING id INTO ev;
    UPDATE obl_items SET agd_event_id = ev WHERE id = NEW.id;
  ELSIF NEW.agd_event_id IS NOT NULL THEN
    UPDATE agd_events SET
      title = 'Échéance : '||NEW.title||' ('||NEW.period_year||')',
      description = NEW.authority||CASE WHEN NOT NEW.due_confirmed THEN ' · échéance à confirmer' ELSE '' END,
      start_at = coalesce(s, start_at), end_at = coalesce(s + interval '23 hours 59 minutes', end_at),
      owner_user_id = owner,
      color = CASE WHEN NEW.status='realise' THEN 'vert' ELSE 'orange' END,
      status = CASE WHEN NEW.status='realise' THEN 'termine' ELSE 'planifie' END,
      archived_at = CASE WHEN show THEN NULL ELSE coalesce(archived_at, now()) END
    WHERE id = NEW.agd_event_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER obl_items_agenda AFTER INSERT OR UPDATE OF due_date, status, applicability, title, responsible_user, due_confirmed ON public.obl_items
FOR EACH ROW WHEN (pg_trigger_depth() < 1) EXECUTE FUNCTION public.obl_sync_agenda();

CREATE OR REPLACE FUNCTION public.obl_ids_save(_company uuid, _neq text, _nir text, _rcv text, _form text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.entcrm_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  INSERT INTO obl_company_ids(company_id, neq, nir, rcv_ref, legal_form) VALUES (_company, nullif(regexp_replace(coalesce(_neq,''),'\s','','g'),''), nullif(trim(_nir),''), nullif(trim(_rcv),''), nullif(trim(_form),''))
  ON CONFLICT (company_id) DO UPDATE SET neq=excluded.neq, nir=excluded.nir, rcv_ref=excluded.rcv_ref, legal_form=excluded.legal_form, updated_by=auth.uid(), updated_at=now();
  PERFORM obl_log(NULL, _company, 'identifiants', jsonb_build_object('neq',_neq,'nir',_nir,'rcv',_rcv,'forme',_form));
END $$;
GRANT EXECUTE ON FUNCTION public.obl_ids_save(uuid,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.obl_seed(_company uuid, _year int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int := 0; r record; nid uuid;
BEGIN
  IF NOT public.entcrm_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('req_declaration','Registraire des entreprises du Québec','Déclaration de mise à jour annuelle','applicable'),
    ('req_droits','Registraire des entreprises du Québec','Droits annuels d''immatriculation','applicable'),
    ('vq_profil','Vrac Québec','Vérification annuelle du profil d''entreprise','applicable'),
    ('rpevl_maj','Commission des transports du Québec','Mise à jour annuelle au Registre des propriétaires et des exploitants de véhicules lourds (RPEVL)','a_confirmer'),
    ('rpevl_frais','Commission des transports du Québec','Frais de la mise à jour annuelle au RPEVL','a_confirmer'),
    ('rcv_droits','Commission des transports du Québec','Droits annuels de maintien au Registre du camionnage en vrac (RCV)','a_confirmer')
  ) AS v(kind, auth, title, app) LOOP
    nid := NULL;
    INSERT INTO obl_items(company_id, kind, period_year, authority, title, applicability) VALUES (_company, r.kind, _year, r.auth, r.title, r.app)
    ON CONFLICT DO NOTHING RETURNING id INTO nid;
    IF nid IS NOT NULL THEN n := n + 1; PERFORM obl_log(nid, _company, 'creation', jsonb_build_object('annee',_year)); END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.obl_seed(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.obl_item_save(_id uuid, _company uuid, _f jsonb, _rev int) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it obl_items; nid uuid; d date;
BEGIN
  IF _id IS NULL THEN
    IF NOT public.entcrm_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
    IF nullif(trim(_f->>'authority'),'') IS NULL OR nullif(trim(_f->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Organisme et description requis'; END IF;
    INSERT INTO obl_items(company_id, kind, period_year, authority, title, description, applicability)
    VALUES (_company, 'transport_autre', coalesce(nullif(_f->>'period_year','')::int, extract(year FROM obl_today())::int), trim(_f->>'authority'), trim(_f->>'title'), _f->>'description', 'applicable')
    RETURNING id INTO nid;
    PERFORM obl_log(nid, _company, 'creation', _f);
    _id := nid; _rev := 1;
  END IF;
  SELECT * INTO it FROM obl_items WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR NOT public.entcrm_can_write(it.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _rev IS DISTINCT FROM it.rev THEN RAISE EXCEPTION 'Modifiée entre-temps : rechargez' USING ERRCODE='P0409'; END IF;
  IF nullif(_f->>'responsible_user','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id=it.company_id AND user_id=(_f->>'responsible_user')::uuid AND is_active AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Le responsable doit être un membre actif de l''entreprise'; END IF;
  d := CASE WHEN _f ? 'due_date' THEN nullif(_f->>'due_date','')::date ELSE it.due_date END;
  UPDATE obl_items SET
    applicability = CASE WHEN _f ? 'applicability' THEN _f->>'applicability' ELSE applicability END,
    due_date = d,
    due_source = CASE WHEN d IS NULL THEN NULL WHEN _f ? 'due_source' THEN nullif(_f->>'due_source','') ELSE due_source END,
    due_confirmed = (CASE WHEN _f ? 'due_confirmed' THEN (_f->>'due_confirmed')::boolean ELSE due_confirmed END) AND d IS NOT NULL,
    amount = CASE WHEN _f ? 'amount' THEN nullif(_f->>'amount','')::numeric ELSE amount END,
    combined_with_tax = CASE WHEN _f ? 'combined_with_tax' THEN (_f->>'combined_with_tax')::boolean ELSE combined_with_tax END,
    responsible_user = CASE WHEN _f ? 'responsible_user' THEN nullif(_f->>'responsible_user','')::uuid ELSE responsible_user END,
    description = CASE WHEN _f ? 'description' THEN _f->>'description' ELSE description END,
    authority = CASE WHEN it.kind='transport_autre' AND _f ? 'authority' THEN trim(_f->>'authority') ELSE authority END,
    title = CASE WHEN it.kind='transport_autre' AND _f ? 'title' THEN trim(_f->>'title') ELSE title END,
    reminder_offsets = CASE WHEN _f ? 'reminder_offsets' THEN _f->'reminder_offsets' ELSE reminder_offsets END,
    late_weekly = CASE WHEN _f ? 'late_weekly' THEN (_f->>'late_weekly')::boolean ELSE late_weekly END,
    fin_ref = CASE WHEN _f ? 'fin_ref' THEN _f->'fin_ref' ELSE fin_ref END,
    joint_group = CASE WHEN _f ? 'joint_group' THEN nullif(_f->>'joint_group','')::uuid ELSE joint_group END,
    rev = rev + 1, updated_at = now()
  WHERE id = _id RETURNING * INTO it;
  IF it.joint_group IS NOT NULL AND _f ? 'due_date' THEN
    UPDATE obl_items SET due_date=it.due_date, due_source=it.due_source, due_confirmed=it.due_confirmed, rev=rev+1, updated_at=now()
     WHERE joint_group=it.joint_group AND id<>it.id AND company_id=it.company_id AND status='ouvert';
  END IF;
  PERFORM obl_log(_id, it.company_id, 'modification', _f);
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.obl_item_save(uuid,uuid,jsonb,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.obl_item_action(_id uuid, _action text, _p jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it obl_items;
BEGIN
  SELECT * INTO it FROM obl_items WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR NOT public.entcrm_can_write(it.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _action = 'completer' THEN
    IF it.status <> 'ouvert' THEN RAISE EXCEPTION 'Obligation déjà fermée'; END IF;
    IF it.kind = 'vq_profil' THEN
      UPDATE obl_items SET status='realise', profile_checked_at=now(), done_on=obl_today(), done_by=auth.uid(), done_at=now(), rev=rev+1, updated_at=now() WHERE id=_id;
    ELSE
      IF nullif(_p->>'done_on','') IS NULL THEN RAISE EXCEPTION 'Date de réalisation déclarée requise'; END IF;
      IF (_p->>'done_on')::date > obl_today() OR (nullif(_p->>'paid_on','') IS NOT NULL AND (_p->>'paid_on')::date > obl_today()) THEN RAISE EXCEPTION 'Date dans le futur refusée'; END IF;
      UPDATE obl_items SET status='realise', done_on=(_p->>'done_on')::date, paid_on=nullif(_p->>'paid_on','')::date, done_by=auth.uid(), done_at=now(), rev=rev+1, updated_at=now() WHERE id=_id;
    END IF;
    PERFORM obl_log(_id, it.company_id, CASE WHEN it.kind IN ('req_droits','rpevl_frais','rcv_droits') THEN 'paiement_declare' ELSE 'realisation_declaree' END, _p);
  ELSIF _action = 'rouvrir' THEN
    IF nullif(trim(_p->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motif requis'; END IF;
    UPDATE obl_items SET status='ouvert', done_on=NULL, paid_on=NULL, done_by=NULL, done_at=NULL, rev=rev+1, updated_at=now() WHERE id=_id;
    PERFORM obl_log(_id, it.company_id, 'reouverture', _p);
  ELSIF _action = 'desactiver' THEN
    IF nullif(trim(_p->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motif requis'; END IF;
    UPDATE obl_items SET status='desactive', rev=rev+1, updated_at=now() WHERE id=_id;
    PERFORM obl_log(_id, it.company_id, 'desactivation', _p);
  ELSIF _action = 'note' THEN
    IF nullif(trim(_p->>'text'),'') IS NULL THEN RAISE EXCEPTION 'Note vide'; END IF;
    PERFORM obl_log(_id, it.company_id, 'note', jsonb_build_object('text', left(_p->>'text', 2000)));
  ELSIF _action = 'justificatif' THEN
    IF coalesce(_p->>'path','') NOT LIKE it.company_id::text || '/%' THEN RAISE EXCEPTION 'Fichier hors du dossier de l''entreprise'; END IF;
    UPDATE obl_items SET proofs = proofs || jsonb_build_array(jsonb_build_object('path',_p->>'path','name',left(_p->>'name',200),'at',now(),'by',auth.uid())), rev=rev+1, updated_at=now()
     WHERE id=_id OR (it.joint_group IS NOT NULL AND joint_group=it.joint_group AND company_id=it.company_id);
    PERFORM obl_log(_id, it.company_id, 'justificatif', _p);
  ELSIF _action = 'reporter_rappel' THEN
    IF nullif(_p->>'until','') IS NULL OR (_p->>'until')::date <= obl_today() THEN RAISE EXCEPTION 'Date de report future requise'; END IF;
    UPDATE obl_items SET snooze_until=(_p->>'until')::date, rev=rev+1, updated_at=now() WHERE id=_id;
    PERFORM obl_log(_id, it.company_id, 'rappel_reporte', _p);
  ELSE RAISE EXCEPTION 'Action inconnue';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.obl_item_action(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.obl_renew(_company uuid, _from_year int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r obl_items; n int := 0; nid uuid; grp_map jsonb := '{}'::jsonb; g uuid;
BEGIN
  IF NOT public.entcrm_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  FOR r IN SELECT * FROM obl_items WHERE company_id=_company AND period_year=_from_year AND status<>'desactive' LOOP
    CONTINUE WHEN r.kind <> 'transport_autre' AND EXISTS (SELECT 1 FROM obl_items WHERE company_id=_company AND kind=r.kind AND period_year=_from_year+1);
    CONTINUE WHEN r.kind = 'transport_autre' AND EXISTS (SELECT 1 FROM obl_items WHERE previous_id=r.id);
    g := NULL;
    IF r.joint_group IS NOT NULL THEN
      IF NOT grp_map ? r.joint_group::text THEN grp_map := grp_map || jsonb_build_object(r.joint_group::text, gen_random_uuid()); END IF;
      g := (grp_map->>r.joint_group::text)::uuid;
    END IF;
    INSERT INTO obl_items(company_id, kind, period_year, authority, title, description, applicability, due_date, due_source, due_confirmed, joint_group, combined_with_tax, responsible_user, reminder_offsets, late_weekly, previous_id)
    VALUES (_company, r.kind, _from_year+1, r.authority, r.title, r.description, CASE WHEN r.applicability='applicable' THEN 'applicable' ELSE 'a_confirmer' END,
            CASE WHEN r.due_date IS NOT NULL THEN (r.due_date + interval '1 year')::date END, CASE WHEN r.due_date IS NOT NULL THEN 'previsionnelle' END, false,
            g, r.combined_with_tax, r.responsible_user, r.reminder_offsets, r.late_weekly, r.id)
    RETURNING id INTO nid;
    PERFORM obl_log(nid, _company, 'creation', jsonb_build_object('reconduction_de', r.id, 'previsionnelle', true));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.obl_renew(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.obl_reminders_sweep(_today date DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t date := coalesce(_today, obl_today()); it obl_items; o jsonb; th date; best date; step text; w int; n int := 0; r record; ch text; st text;
BEGIN
  FOR it IN SELECT * FROM obl_items WHERE status='ouvert' AND applicability='applicable' AND due_date IS NOT NULL AND (snooze_until IS NULL OR snooze_until <= t) LOOP
    best := NULL; step := NULL;
    FOR o IN SELECT * FROM jsonb_array_elements(it.reminder_offsets) LOOP
      th := CASE WHEN o ? 'months' THEN (it.due_date - make_interval(months => (o->>'months')::int))::date ELSE it.due_date - coalesce((o->>'days')::int, 0) END;
      IF th <= t AND (best IS NULL OR th > best) THEN best := th; step := coalesce(o->>'k', 'r'||(it.due_date - th)); END IF;
    END LOOP;
    IF it.late_weekly AND t > it.due_date THEN
      w := (t - it.due_date) / 7;
      IF w >= 1 THEN step := 'retard_s'||w; END IF;
    END IF;
    CONTINUE WHEN step IS NULL;
    FOR r IN
      SELECT m.user_id, m.email FROM jsc_company_members m
       WHERE m.company_id=it.company_id AND m.is_active AND m.archived_at IS NULL AND m.user_id IS NOT NULL
         AND (m.user_id = it.responsible_user OR (it.responsible_user IS NULL AND m.role IN ('proprietaire','gestionnaire')))
    LOOP
      FOREACH ch IN ARRAY ARRAY['app','email'] LOOP
        st := CASE WHEN ch='app' THEN 'livre'
                   WHEN r.email IS NULL THEN 'sans_adresse'
                   WHEN r.email ~* '(\.invalid|\.test|\.example|@example\.com)$' THEN 'bloque_test'
                   ELSE 'simule' END;
        INSERT INTO obl_deliveries(item_id, company_id, period_year, due_date, step, user_id, channel, state)
        VALUES (it.id, it.company_id, it.period_year, it.due_date, step, r.user_id, ch, st) ON CONFLICT DO NOTHING;
        IF FOUND THEN n := n + 1; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.obl_reminders_sweep(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obl_my_bell(_limit int DEFAULT 30)
RETURNS TABLE(delivery_id uuid, item_id uuid, company_id uuid, title text, step text, due_date date, read_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT d.id, i.id, i.company_id, i.title||' ('||i.period_year||')', d.step, d.due_date, d.read_at, d.created_at
  FROM obl_deliveries d JOIN obl_items i ON i.id=d.item_id
  WHERE d.user_id=auth.uid() AND d.channel='app' AND public.entcrm_can_read(i.company_id)
  ORDER BY d.created_at DESC LIMIT least(greatest(_limit,1),100)
$$;
GRANT EXECUTE ON FUNCTION public.obl_my_bell(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.obl_mark_read(_delivery uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE obl_deliveries SET read_at=coalesce(read_at, now()) WHERE id=_delivery AND user_id=auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.obl_mark_read(uuid) TO authenticated;