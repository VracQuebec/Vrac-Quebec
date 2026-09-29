-- Registre de suivi du Centre de contrôle : séparé des demandes, une ligne par demande réelle.
CREATE TABLE public.request_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('submission','transport_request')),
  entity_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  is_test boolean NOT NULL DEFAULT false,
  follow_status text NOT NULL DEFAULT 'nouvelle'
    CHECK (follow_status IN ('nouvelle','consultee','prise_en_charge','en_attente','resolue')),
  seen_at timestamptz, seen_by uuid, seen_by_email text,
  assignee_id uuid, assignee_email text,
  taken_at timestamptz,
  next_action text,
  next_reminder_at timestamptz,
  reminder_reason text,
  reminder_fired_at timestamptz,
  escalation_stage smallint NOT NULL DEFAULT 0,
  resolved_at timestamptz, resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE ON public.request_followups TO authenticated;
GRANT ALL ON public.request_followups TO service_role;
ALTER TABLE public.request_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read followups" ON public.request_followups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert followups" ON public.request_followups FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update followups" ON public.request_followups FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.request_followup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id uuid NOT NULL REFERENCES public.request_followups(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid, actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_followup_events_fu_idx ON public.request_followup_events(followup_id, created_at DESC);
GRANT SELECT ON public.request_followup_events TO authenticated;
GRANT ALL ON public.request_followup_events TO service_role;
ALTER TABLE public.request_followup_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read followup events" ON public.request_followup_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Journal automatique (historique figé, écrit par le serveur uniquement).
CREATE OR REPLACE FUNCTION public.request_followups_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text := public.current_user_email(); v_changes jsonb := '{}'::jsonb; k text;
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  -- Une demande résolue ou prise en charge ne peut pas redevenir « nouvelle ».
  IF NEW.follow_status = 'nouvelle' AND OLD.follow_status <> 'nouvelle' THEN
    NEW.follow_status := OLD.follow_status;
  END IF;
  IF NEW.follow_status = 'prise_en_charge' AND OLD.taken_at IS NULL THEN
    NEW.taken_at := coalesce(NEW.taken_at, now());
    NEW.assignee_id := coalesce(NEW.assignee_id, auth.uid());
    NEW.assignee_email := coalesce(NEW.assignee_email, v_email);
  END IF;
  IF NEW.follow_status = 'resolue' AND OLD.follow_status <> 'resolue' THEN
    IF coalesce(btrim(NEW.resolution_note),'') = '' THEN
      RAISE EXCEPTION 'Une résolution doit être documentée (note obligatoire).';
    END IF;
    NEW.resolved_at := now();
  END IF;
  IF NEW.next_reminder_at IS DISTINCT FROM OLD.next_reminder_at THEN
    NEW.reminder_fired_at := NULL;
  END IF;
  FOREACH k IN ARRAY ARRAY['follow_status','assignee_email','next_action','next_reminder_at','reminder_reason','resolution_note'] LOOP
    IF (to_jsonb(NEW)->k) IS DISTINCT FROM (to_jsonb(OLD)->k) THEN
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('avant', to_jsonb(OLD)->k, 'apres', to_jsonb(NEW)->k));
    END IF;
  END LOOP;
  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, detail, actor_id, actor_email)
    VALUES (NEW.id, NEW.entity_type, NEW.entity_id,
      CASE WHEN NEW.follow_status IS DISTINCT FROM OLD.follow_status THEN 'statut_suivi' ELSE 'modification' END,
      v_changes, auth.uid(), v_email);
  END IF;
  -- Une alerte ne disparaît qu'après une action réelle.
  IF NEW.follow_status IN ('prise_en_charge','resolue') AND OLD.follow_status NOT IN ('prise_en_charge','resolue') THEN
    PERFORM public.crm_resolve(NEW.entity_type, NEW.entity_id, NULL, ARRAY['cc_rappel_1','cc_rappel_2','cc_critique']);
  END IF;
  IF NEW.follow_status = 'resolue' OR NEW.next_reminder_at IS DISTINCT FROM OLD.next_reminder_at THEN
    PERFORM public.crm_resolve(NEW.entity_type, NEW.entity_id, NULL, ARRAY['cc_rappel_programme']);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER request_followups_log_t BEFORE INSERT OR UPDATE ON public.request_followups
  FOR EACH ROW EXECUTE FUNCTION public.request_followups_log();

-- Journal « consultée » séparé (sans changement de statut de suivi possible à l'insertion).
CREATE OR REPLACE FUNCTION public.request_followup_mark_seen(_entity_type text, _entity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_email text := public.current_user_email();
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  INSERT INTO public.request_followups(entity_type, entity_id, received_at)
  VALUES (_entity_type, _entity_id, now()) ON CONFLICT (entity_type, entity_id) DO NOTHING;
  UPDATE public.request_followups SET
    seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, auth.uid()),
    seen_by_email = coalesce(seen_by_email, v_email),
    follow_status = CASE WHEN follow_status = 'nouvelle' THEN 'consultee' ELSE follow_status END
  WHERE entity_type = _entity_type AND entity_id = _entity_id RETURNING id INTO v_id;
  INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, actor_id, actor_email)
  VALUES (v_id, _entity_type, _entity_id, 'consultee', auth.uid(), v_email);
  UPDATE public.crm_notifications SET status = 'read', read_at = now()
  WHERE entity_type = _entity_type AND entity_id = _entity_id AND status = 'unread';
END $$;
GRANT EXECUTE ON FUNCTION public.request_followup_mark_seen(text, uuid) TO authenticated;

-- Création immédiate de l'entrée de suivi à l'arrivée d'une demande (la demande n'est pas modifiée).
CREATE OR REPLACE FUNCTION public.request_followups_on_new_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text := CASE TG_TABLE_NAME WHEN 'submissions' THEN 'submission' ELSE 'transport_request' END;
  v_email text := CASE TG_TABLE_NAME WHEN 'submissions' THEN to_jsonb(NEW)->>'email' ELSE to_jsonb(NEW)->>'client_email' END;
  v_id uuid;
BEGIN
  INSERT INTO public.request_followups(entity_type, entity_id, received_at, is_test)
  VALUES (v_type, NEW.id, coalesce(NEW.created_at, now()), coalesce(v_email ILIKE '%@test.invalid', false))
  ON CONFLICT (entity_type, entity_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, detail)
    VALUES (v_id, v_type, NEW.id, 'recue', jsonb_build_object('source', TG_TABLE_NAME));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Le suivi ne doit jamais empêcher l'enregistrement d'une demande.
  RAISE WARNING 'request_followups_on_new_request: %', SQLERRM;
  RETURN NULL;
END $$;
CREATE TRIGGER zz_request_followup_submission AFTER INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.request_followups_on_new_request();
CREATE TRIGGER zz_request_followup_transport AFTER INSERT ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.request_followups_on_new_request();

-- Avis liés à une adresse de test (@test.invalid) : jamais envoyés sur téléphone.
CREATE OR REPLACE FUNCTION public.crm_notifications_skip_test_push()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.push_status = 'pending' AND (
       coalesce(NEW.meta->>'email','') ILIKE '%@test.invalid'
       OR coalesce(NEW.meta->>'test','') = 'true') THEN
    NEW.push_status := 'skipped';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notifications_skip_test_push_t BEFORE INSERT OR UPDATE ON public.crm_notifications
  FOR EACH ROW EXECUTE FUNCTION public.crm_notifications_skip_test_push();

-- Rappels automatiques (appelé par la surveillance planifiée existante, toutes les 10 min).
CREATE OR REPLACE FUNCTION public.request_followups_sweep()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb; v_r1 int; v_r2 int; v_crit int; r record; v_new int := 0;
  v_label text; v_num text; v_email text; v_open boolean; v_age interval;
BEGIN
  SELECT delays INTO d FROM public.crm_notification_settings WHERE scope = 'global';
  v_r1 := coalesce((d->>'cc_first_reminder_min')::int, 15);
  v_r2 := coalesce((d->>'cc_second_reminder_min')::int, 60);
  v_crit := coalesce((d->>'cc_critical_hours')::int, 24);

  FOR r IN SELECT * FROM public.request_followups
           WHERE follow_status IN ('nouvelle','consultee') AND taken_at IS NULL AND escalation_stage < 3 LOOP
    IF r.entity_type = 'submission' THEN
      SELECT s.status = 'nouveau', coalesce(s.company, s.name), coalesce(s.dompe_number, '#'||s.submission_number), s.email
        INTO v_open, v_label, v_num, v_email FROM public.submissions s WHERE s.id = r.entity_id;
    ELSE
      SELECT t.status::text = 'nouvelle', coalesce(t.client_company, t.client_name), t.request_number, t.client_email
        INTO v_open, v_label, v_num, v_email FROM public.transport_requests t WHERE t.id = r.entity_id;
    END IF;
    IF NOT coalesce(v_open, false) THEN CONTINUE; END IF;  -- statut déjà avancé : plus de rappel
    v_age := now() - r.received_at;
    IF v_age >= make_interval(hours => v_crit) AND r.escalation_stage < 3 THEN
      PERFORM public.crm_notify('cc:'||r.id||':critique','alerte','cc_critique','urgente',
        'CRITIQUE — demande '||coalesce(v_num,'')||' non traitée depuis '||v_crit||' h', v_label,
        r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
        v_label, v_num, now(), jsonb_build_object('email', v_email, 'test', r.is_test), false);
      UPDATE public.request_followups SET escalation_stage = 3 WHERE id = r.id; v_new := v_new + 1;
    ELSIF v_age >= make_interval(mins => v_r2) AND r.escalation_stage < 2 THEN
      PERFORM public.crm_notify('cc:'||r.id||':r2','lead','cc_rappel_2','urgente',
        'Rappel — demande '||coalesce(v_num,'')||' toujours non prise en charge', v_label,
        r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
        v_label, v_num, now(), jsonb_build_object('email', v_email, 'test', r.is_test), false);
      UPDATE public.request_followups SET escalation_stage = 2 WHERE id = r.id; v_new := v_new + 1;
    ELSIF v_age >= make_interval(mins => v_r1) AND r.escalation_stage < 1 THEN
      PERFORM public.crm_notify('cc:'||r.id||':r1','lead','cc_rappel_1','importante',
        'Rappel — nouvelle demande '||coalesce(v_num,'')||' sans prise en charge', v_label,
        r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
        v_label, v_num, now(), jsonb_build_object('email', v_email, 'test', r.is_test), false);
      UPDATE public.request_followups SET escalation_stage = 1 WHERE id = r.id; v_new := v_new + 1;
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM public.request_followups
           WHERE follow_status <> 'resolue' AND next_reminder_at IS NOT NULL
             AND next_reminder_at <= now() AND reminder_fired_at IS NULL LOOP
    PERFORM public.crm_notify('cc:'||r.id||':prog:'||extract(epoch FROM r.next_reminder_at)::bigint,
      'relance','cc_rappel_programme','importante',
      'Rappel programmé : '||coalesce(r.reminder_reason, r.next_action, 'suivi de la demande'), r.next_action,
      r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
      NULL, NULL, r.next_reminder_at, jsonb_build_object('test', r.is_test), false);
    UPDATE public.request_followups SET reminder_fired_at = now() WHERE id = r.id;
    INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, detail)
    VALUES (r.id, r.entity_type, r.entity_id, 'rappel_declenche', jsonb_build_object('prevu', r.next_reminder_at));
    v_new := v_new + 1;
  END LOOP;
  RETURN jsonb_build_object('notifications', v_new, 'at', now());
END $$;
REVOKE ALL ON FUNCTION public.request_followups_sweep() FROM PUBLIC, anon, authenticated;
