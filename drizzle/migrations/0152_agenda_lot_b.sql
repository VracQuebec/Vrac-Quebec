CREATE TABLE public.agd_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  category text NOT NULL DEFAULT 'rendez_vous',
  color text NOT NULL DEFAULT 'bleu',
  status text NOT NULL DEFAULT 'planifie',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  owner_user_id uuid,
  client_id uuid REFERENCES public.ent_crm_clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.ent_crm_projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.ent_crm_tasks(id) ON DELETE SET NULL,
  recurrence text NOT NULL DEFAULT 'aucune',
  recurrence_until date,
  reminders jsonb NOT NULL DEFAULT '[{"minutes":60,"channels":["app"]}]'::jsonb,
  notify_client boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agd_events_chk CHECK (
    end_at >= start_at
    AND category IN ('rendez_vous','chantier','livraison','reunion','appel','visite','entretien','conge','autre')
    AND color IN ('gris','vert','bleu','jaune','orange','rouge','violet')
    AND status IN ('planifie','confirme','en_cours','termine','annule','reporte')
    AND recurrence IN ('aucune','quotidienne','hebdomadaire','aux_2_semaines','mensuelle')
    AND jsonb_typeof(reminders) = 'array')
);
GRANT SELECT, INSERT, UPDATE ON public.agd_events TO authenticated;
GRANT ALL ON public.agd_events TO service_role;
ALTER TABLE public.agd_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX agd_events_company_start_idx ON public.agd_events(company_id, start_at);

CREATE TABLE public.agd_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agd_events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  user_id uuid,
  name text, email text, phone text,
  response text NOT NULL DEFAULT 'en_attente',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agd_att_chk CHECK (response IN ('en_attente','accepte','refuse','peut_etre') AND (user_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)),
  UNIQUE (event_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agd_attendees TO authenticated;
GRANT ALL ON public.agd_attendees TO service_role;
ALTER TABLE public.agd_attendees ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agd_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agd_events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agd_event_log TO authenticated;
GRANT ALL ON public.agd_event_log TO service_role;
ALTER TABLE public.agd_event_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agd_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agd_events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  occurrence_at timestamptz NOT NULL,
  minutes int NOT NULL,
  recipient text NOT NULL,
  user_id uuid,
  channel text NOT NULL,
  state text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agd_del_chk CHECK (channel IN ('app','email','sms') AND state IN ('livre','simule','bloque_test','sans_adresse')),
  UNIQUE (event_id, occurrence_at, minutes, recipient, channel)
);
GRANT SELECT ON public.agd_deliveries TO authenticated;
GRANT ALL ON public.agd_deliveries TO service_role;
ALTER TABLE public.agd_deliveries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.agd_can_see(_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM agd_events e WHERE e.id = _event AND (
    public.entcrm_can_commercial(e.company_id)
    OR (public.entcrm_can_read(e.company_id) AND (e.owner_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM agd_attendees a WHERE a.event_id = e.id AND a.user_id = auth.uid())))))
$$;

CREATE POLICY r ON public.agd_events FOR SELECT TO authenticated USING (public.agd_can_see(id));
CREATE POLICY i ON public.agd_events FOR INSERT TO authenticated WITH CHECK (
  public.entcrm_can_write(company_id) OR (public.entcrm_can_field(company_id) AND owner_user_id = auth.uid()));
CREATE POLICY u ON public.agd_events FOR UPDATE TO authenticated
  USING (public.entcrm_can_write(company_id) OR (public.entcrm_can_field(company_id) AND owner_user_id = auth.uid()))
  WITH CHECK (public.entcrm_can_write(company_id) OR (public.entcrm_can_field(company_id) AND owner_user_id = auth.uid()));
CREATE POLICY r ON public.agd_attendees FOR SELECT TO authenticated USING (public.agd_can_see(event_id));
CREATE POLICY w ON public.agd_attendees FOR ALL TO authenticated
  USING (public.entcrm_can_write(company_id) OR EXISTS (SELECT 1 FROM agd_events e WHERE e.id = event_id AND e.owner_user_id = auth.uid()))
  WITH CHECK (public.entcrm_can_write(company_id) OR EXISTS (SELECT 1 FROM agd_events e WHERE e.id = event_id AND e.owner_user_id = auth.uid()));
CREATE POLICY r ON public.agd_event_log FOR SELECT TO authenticated USING (public.agd_can_see(event_id));
CREATE POLICY r ON public.agd_deliveries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.entcrm_can_write(company_id));

CREATE OR REPLACE FUNCTION public.agd_events_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id = NEW.client_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Client d''une autre entreprise.' USING ERRCODE='42501'; END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_projects WHERE id = NEW.project_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Chantier d''une autre entreprise.' USING ERRCODE='42501'; END IF;
  IF NEW.task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_tasks WHERE id = NEW.task_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Tâche d''une autre entreprise.' USING ERRCODE='42501'; END IF;
  IF NEW.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id = NEW.company_id AND user_id = NEW.owner_user_id AND is_active AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Le responsable doit être un employé actif de l''entreprise.' USING ERRCODE='42501'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'Changement d''entreprise interdit.' USING ERRCODE='42501'; END IF;
    IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
      INSERT INTO agd_event_log(event_id, company_id, action, detail) VALUES (NEW.id, NEW.company_id, 'transfert', jsonb_build_object('de', OLD.owner_user_id, 'a', NEW.owner_user_id));
    END IF;
    IF NEW.start_at <> OLD.start_at OR NEW.end_at <> OLD.end_at THEN
      INSERT INTO agd_event_log(event_id, company_id, action, detail) VALUES (NEW.id, NEW.company_id, 'deplacement', jsonb_build_object('avant', OLD.start_at, 'apres', NEW.start_at));
    END IF;
    IF NEW.status <> OLD.status THEN
      INSERT INTO agd_event_log(event_id, company_id, action, detail) VALUES (NEW.id, NEW.company_id, 'statut', jsonb_build_object('avant', OLD.status, 'apres', NEW.status));
    END IF;
    IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
      INSERT INTO agd_event_log(event_id, company_id, action) VALUES (NEW.id, NEW.company_id, 'archive');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agd_events_guard BEFORE INSERT OR UPDATE ON public.agd_events FOR EACH ROW EXECUTE FUNCTION public.agd_events_guard();
CREATE OR REPLACE FUNCTION public.agd_events_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO agd_event_log(event_id, company_id, action) VALUES (NEW.id, NEW.company_id, 'creation'); RETURN NULL; END $$;
CREATE TRIGGER agd_events_created AFTER INSERT ON public.agd_events FOR EACH ROW EXECUTE FUNCTION public.agd_events_created();

CREATE OR REPLACE FUNCTION public.agd_att_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM agd_events WHERE id = NEW.event_id;
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND is_active AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Participant hors de l''entreprise.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agd_att_guard BEFORE INSERT OR UPDATE ON public.agd_attendees FOR EACH ROW EXECUTE FUNCTION public.agd_att_guard();

CREATE OR REPLACE FUNCTION public.agd_respond(_event uuid, _response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _response NOT IN ('accepte','refuse','peut_etre') THEN RAISE EXCEPTION 'Réponse invalide.'; END IF;
  UPDATE agd_attendees SET response = _response WHERE event_id = _event AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Vous n''êtes pas invité à cet événement.' USING ERRCODE='42501'; END IF;
  INSERT INTO agd_event_log(event_id, company_id, action, detail) SELECT _event, company_id, 'reponse', jsonb_build_object('reponse', _response) FROM agd_events WHERE id = _event;
END $$;
GRANT EXECUTE ON FUNCTION public.agd_respond(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.agd_occurrences(_e public.agd_events, _from timestamptz, _to timestamptz)
RETURNS SETOF timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s FROM (
    SELECT CASE _e.recurrence
      WHEN 'quotidienne' THEN _e.start_at + make_interval(days => n)
      WHEN 'hebdomadaire' THEN _e.start_at + make_interval(weeks => n)
      WHEN 'aux_2_semaines' THEN _e.start_at + make_interval(weeks => 2*n)
      WHEN 'mensuelle' THEN _e.start_at + make_interval(months => n)
      ELSE CASE WHEN n = 0 THEN _e.start_at END END AS s
    FROM generate_series(0, CASE WHEN _e.recurrence = 'aucune' THEN 0 ELSE 800 END) n
  ) x
  WHERE s IS NOT NULL AND s >= _from AND s < _to
    AND (_e.recurrence_until IS NULL OR s::date <= _e.recurrence_until)
$$;

CREATE OR REPLACE FUNCTION public.agd_reminders_sweep()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e agd_events; occ timestamptz; rem jsonb; ch text; mins int; n int := 0; r record; st text;
BEGIN
  FOR e IN SELECT * FROM agd_events WHERE archived_at IS NULL AND status NOT IN ('annule','termine')
           AND (recurrence <> 'aucune' OR start_at BETWEEN now() - interval '1 day' AND now() + interval '31 days') LOOP
    FOR occ IN SELECT public.agd_occurrences(e, now(), now() + interval '31 days') LOOP
      FOR rem IN SELECT * FROM jsonb_array_elements(e.reminders) LOOP
        mins := coalesce((rem->>'minutes')::int, 60);
        CONTINUE WHEN occ - make_interval(mins => mins) > now();
        FOR ch IN SELECT jsonb_array_elements_text(coalesce(rem->'channels','["app"]'::jsonb)) LOOP
          FOR r IN
            SELECT m.user_id, m.email, NULL::text AS phone FROM jsc_company_members m
             WHERE m.company_id = e.company_id AND m.is_active AND m.archived_at IS NULL
               AND (m.user_id = e.owner_user_id OR m.user_id IN (SELECT user_id FROM agd_attendees WHERE event_id = e.id AND response <> 'refuse'))
            UNION ALL
            SELECT NULL, a.email, a.phone FROM agd_attendees a WHERE a.event_id = e.id AND a.user_id IS NULL AND a.response <> 'refuse'
            UNION ALL
            SELECT NULL, c.email, c.phone FROM ent_crm_clients c WHERE e.notify_client AND c.id = e.client_id
          LOOP
            CONTINUE WHEN ch = 'app' AND r.user_id IS NULL;
            st := CASE
              WHEN ch = 'app' THEN 'livre'
              WHEN (ch = 'email' AND r.email IS NULL) OR (ch = 'sms' AND r.phone IS NULL) THEN 'sans_adresse'
              WHEN ch = 'email' AND r.email ~* '(\.invalid|\.test|\.example|@example\.com)$' THEN 'bloque_test'
              ELSE 'simule' END;
            INSERT INTO agd_deliveries(event_id, company_id, occurrence_at, minutes, recipient, user_id, channel, state)
            VALUES (e.id, e.company_id, occ, mins, coalesce(r.user_id::text, CASE ch WHEN 'sms' THEN r.phone ELSE r.email END, 'inconnu'), r.user_id, ch, st)
            ON CONFLICT DO NOTHING;
            IF FOUND THEN n := n + 1; END IF;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.agd_reminders_sweep() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agd_my_bell(_limit int DEFAULT 30)
RETURNS TABLE(delivery_id uuid, event_id uuid, company_id uuid, title text, start_at timestamptz, location text, read_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, e.id, e.company_id, e.title, d.occurrence_at, e.location, d.read_at, d.created_at
  FROM agd_deliveries d JOIN agd_events e ON e.id = d.event_id
  WHERE d.user_id = auth.uid() AND d.channel = 'app' AND e.archived_at IS NULL AND public.entcrm_can_read(e.company_id)
  ORDER BY d.created_at DESC LIMIT least(greatest(_limit,1),100)
$$;
CREATE OR REPLACE FUNCTION public.agd_mark_read(_delivery uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE agd_deliveries SET read_at = coalesce(read_at, now()) WHERE id = _delivery AND user_id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.agd_my_bell(int), public.agd_mark_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_notifications_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d jsonb;
  v_lead_hours int; v_quote_days int; v_delivery_hours int; v_pay_days int;
  v_created int := 0;
  r record;
BEGIN
  SELECT delays INTO d FROM public.crm_notification_settings WHERE scope = 'global';
  v_lead_hours := coalesce((d->>'lead_untreated_hours')::int, 24);
  v_quote_days := coalesce((d->>'quote_followup_days')::int, 2);
  v_delivery_hours := coalesce((d->>'delivery_reminder_hours')::int, 24);
  v_pay_days := coalesce((d->>'payment_overdue_days')::int, 0);

  FOR r IN
    SELECT s.id, s.name, s.dompe_number, s.submission_number, s.phone
    FROM public.submissions s
    WHERE s.status = 'nouveau'
      AND s.created_at < now() - make_interval(hours => v_lead_hours)
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications n
                      WHERE n.dedupe_key = 'lead:untreated:' || s.id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('lead:untreated:' || r.id::text, 'relance', 'lead_untreated', 'urgente',
      'Relance nécessaire — ' || coalesce(r.name,'Client'),
      'Le lead est toujours en attente de traitement depuis plus de ' || v_lead_hours || ' h.',
      'submission', r.id, '/admin?lead=' || r.id::text, r.name,
      coalesce(r.dompe_number, r.submission_number::text), now(),
      jsonb_build_object('phone', r.phone), false);
    v_created := v_created + 1;
  END LOOP;

  FOR r IN
    SELECT n.entity_id AS id, n.client_name, n.lead_number
    FROM public.crm_notifications n
    JOIN public.submissions s ON s.id = n.entity_id
    WHERE n.type = 'quote_sent'
      AND n.created_at < now() - make_interval(days => v_quote_days)
      AND s.status = 'soumission envoyée'
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications x
                      WHERE x.dedupe_key = 'lead:quote_followup:' || n.entity_id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('lead:quote_followup:' || r.id::text, 'soumission', 'quote_followup', 'importante',
      'Relance de soumission — ' || coalesce(r.client_name,'Client'),
      'Aucune réponse depuis ' || v_quote_days || ' jour(s).',
      'submission', r.id, '/admin?lead=' || r.id::text, r.client_name, r.lead_number, now(),
      '{}'::jsonb, false);
    v_created := v_created + 1;
  END LOOP;

  FOR r IN
    SELECT e.id, e.title, e.client_name, e.dompe_number, e.start_at, e.delivery_address,
           e.material_type, e.trips_planned, e.submission_id
    FROM public.calendar_events e
    WHERE e.start_at BETWEEN now() AND now() + make_interval(hours => v_delivery_hours)
      AND e.status IN ('planifie','a_planifier','en_cours')
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications n
                      WHERE n.dedupe_key = 'delivery:soon:' || e.id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('delivery:soon:' || r.id::text, 'livraison', 'delivery_soon', 'importante',
      'Livraison à venir — ' || coalesce(r.client_name, r.title, 'Client'),
      concat_ws(' · ', to_char(r.start_at AT TIME ZONE 'America/Toronto', 'DD/MM HH24:MI'),
                nullif(coalesce(r.material_type,''),''), nullif(coalesce(r.delivery_address,''),'')),
      'calendar_event', r.id, '/admin/calendrier?event=' || r.id::text,
      r.client_name, r.dompe_number, r.start_at,
      jsonb_build_object('trips', r.trips_planned, 'submission_id', r.submission_id), false);
    v_created := v_created + 1;
  END LOOP;

  FOR r IN
    SELECT t.id, t.invoice_number, t.due_date, t.submission_id, t.total_with_tax, t.total_price,
           s.name AS client_name
    FROM public.lead_trips t
    LEFT JOIN public.submissions s ON s.id = t.submission_id
    WHERE t.due_date IS NOT NULL
      AND t.due_date < (now() AT TIME ZONE 'America/Toronto')::date - v_pay_days
      AND coalesce(t.payment_status,'') NOT IN ('paye','payé','paid')
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications n
                      WHERE n.dedupe_key = 'invoice:overdue:' || t.id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('invoice:overdue:' || r.id::text, 'paiement', 'payment_overdue', 'urgente',
      'Paiement en retard — ' || coalesce(r.client_name, r.invoice_number, 'Client'),
      'En retard de ' || ((now() AT TIME ZONE 'America/Toronto')::date - r.due_date) || ' jour(s).',
      'lead_trip', r.id,
      CASE WHEN r.submission_id IS NOT NULL THEN '/admin?lead=' || r.submission_id::text ELSE '/admin' END,
      r.client_name, r.invoice_number, r.due_date::timestamptz, '{}'::jsonb, false);
    v_created := v_created + 1;
  END LOOP;

  UPDATE public.crm_notifications n
  SET status = 'done', resolved_at = now(), updated_at = now(),
      push_status = CASE WHEN n.push_status = 'pending' THEN 'skipped' ELSE n.push_status END
  FROM public.submissions s
  WHERE n.entity_type = 'submission' AND n.entity_id = s.id
    AND n.status NOT IN ('done','archived')
    AND s.status IN ('perdu','archivé');

  UPDATE public.crm_notifications n
  SET status = 'done', resolved_at = now(), updated_at = now(),
      push_status = CASE WHEN n.push_status = 'pending' THEN 'skipped' ELSE n.push_status END
  FROM public.lead_trips t
  WHERE n.entity_type = 'lead_trip' AND n.entity_id = t.id
    AND n.status NOT IN ('done','archived')
    AND n.category IN ('paiement','facturation')
    AND coalesce(t.payment_status,'') IN ('paye','payé','paid');

  BEGIN PERFORM public.agd_reminders_sweep(); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'agd sweep: %', SQLERRM; END;

  RETURN jsonb_build_object('created', v_created, 'at', now());
END;
$function$;