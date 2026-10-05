ALTER TABLE public.request_followups ADD COLUMN IF NOT EXISTS priority text NULL
  CHECK (priority IS NULL OR priority IN ('normale','prioritaire','urgente'));
COMMENT ON COLUMN public.request_followups.priority IS 'Priorité explicite fixée par un administrateur; NULL = non définie (jamais déduite de la date).';

CREATE OR REPLACE FUNCTION public.request_followups_log()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text := public.current_user_email(); v_changes jsonb := '{}'::jsonb; k text;
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
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
  FOREACH k IN ARRAY ARRAY['follow_status','assignee_email','next_action','next_reminder_at','reminder_reason','resolution_note','priority'] LOOP
    IF (to_jsonb(NEW)->k) IS DISTINCT FROM (to_jsonb(OLD)->k) THEN
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('avant', to_jsonb(OLD)->k, 'apres', to_jsonb(NEW)->k));
    END IF;
  END LOOP;
  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, detail, actor_id, actor_email)
    VALUES (NEW.id, NEW.entity_type, NEW.entity_id,
      CASE WHEN NEW.follow_status IS DISTINCT FROM OLD.follow_status THEN 'statut_suivi'
           WHEN NEW.priority IS DISTINCT FROM OLD.priority THEN 'priorite'
           ELSE 'modification' END,
      v_changes, auth.uid(), v_email);
  END IF;
  IF NEW.follow_status IN ('prise_en_charge','resolue') AND OLD.follow_status NOT IN ('prise_en_charge','resolue') THEN
    PERFORM public.crm_resolve(NEW.entity_type, NEW.entity_id, NULL, ARRAY['cc_rappel_1','cc_rappel_2','cc_critique']);
  END IF;
  IF NEW.follow_status = 'resolue' OR NEW.next_reminder_at IS DISTINCT FROM OLD.next_reminder_at THEN
    PERFORM public.crm_resolve(NEW.entity_type, NEW.entity_id, NULL, ARRAY['cc_rappel_programme']);
  END IF;
  RETURN NEW;
END $function$;