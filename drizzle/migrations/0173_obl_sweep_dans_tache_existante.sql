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
  BEGIN PERFORM public.obl_reminders_sweep(); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'obl sweep: %', SQLERRM; END;

  RETURN jsonb_build_object('created', v_created, 'at', now());
END;
$function$