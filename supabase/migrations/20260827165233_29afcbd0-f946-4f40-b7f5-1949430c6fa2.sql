
-- =====================================================================
-- 1. TABLES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  category text NOT NULL,
  type text NOT NULL,
  priority text NOT NULL DEFAULT 'normale' CHECK (priority IN ('urgente','importante','normale','information')),
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  entity_label text,
  action_url text,
  client_name text,
  lead_number text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','in_progress','done','archived')),
  read_at timestamptz,
  resolved_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  push_status text NOT NULL DEFAULT 'pending' CHECK (push_status IN ('pending','sent','skipped','failed')),
  push_sent_at timestamptz,
  push_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.crm_notifications TO authenticated;
GRANT ALL ON public.crm_notifications TO service_role;
ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage crm notifications"
  ON public.crm_notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS crm_notifications_open_idx
  ON public.crm_notifications (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_notifications_entity_idx
  ON public.crm_notifications (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS crm_notifications_push_idx
  ON public.crm_notifications (push_status) WHERE push_status = 'pending';

-- Paramètres globaux (une seule ligne 'global')
CREATE TABLE IF NOT EXISTS public.crm_notification_settings (
  scope text PRIMARY KEY DEFAULT 'global',
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  push_categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  delays jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.crm_notification_settings TO authenticated;
GRANT ALL ON public.crm_notification_settings TO service_role;
ALTER TABLE public.crm_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage notification settings"
  ON public.crm_notification_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.crm_notification_settings (scope, categories, push_categories, delays)
VALUES (
  'global',
  '{"lead":true,"relance":true,"soumission":true,"livraison":true,"paiement":true,"facturation":true,"calendrier":true,"site":true,"alerte":true}'::jsonb,
  '{"lead":true,"relance":true,"soumission":true,"livraison":true,"paiement":true,"calendrier":true,"alerte":true}'::jsonb,
  '{"lead_untreated_hours":24,"quote_followup_days":2,"delivery_reminder_hours":24,"payment_overdue_days":0}'::jsonb
)
ON CONFLICT (scope) DO NOTHING;

-- Abonnements Web Push (iPhone / iPad / desktop)
CREATE TABLE IF NOT EXISTS public.crm_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_push_subscriptions TO authenticated;
GRANT ALL ON public.crm_push_subscriptions TO service_role;
ALTER TABLE public.crm_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push subscriptions"
  ON public.crm_push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER crm_notifications_touch
  BEFORE UPDATE ON public.crm_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER crm_notification_settings_touch
  BEFORE UPDATE ON public.crm_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER crm_push_subscriptions_touch
  BEFORE UPDATE ON public.crm_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 2. FONCTIONS CENTRALES
-- =====================================================================
CREATE OR REPLACE FUNCTION public.crm_notify(
  p_dedupe_key text,
  p_category text,
  p_type text,
  p_priority text,
  p_title text,
  p_body text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_action_url text DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_lead_number text DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_reopen boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_id uuid;
BEGIN
  SELECT coalesce((categories ->> p_category)::boolean, true) INTO v_enabled
  FROM public.crm_notification_settings WHERE scope = 'global';
  IF v_enabled IS FALSE THEN RETURN NULL; END IF;

  INSERT INTO public.crm_notifications AS n (
    dedupe_key, category, type, priority, title, body,
    entity_type, entity_id, action_url, client_name, lead_number, due_at, meta
  ) VALUES (
    p_dedupe_key, p_category, p_type, coalesce(p_priority,'normale'), p_title, p_body,
    p_entity_type, p_entity_id, p_action_url, p_client_name, p_lead_number, p_due_at,
    coalesce(p_meta,'{}'::jsonb)
  )
  ON CONFLICT (dedupe_key) DO UPDATE SET
    title = excluded.title,
    body = excluded.body,
    priority = excluded.priority,
    due_at = excluded.due_at,
    meta = excluded.meta,
    action_url = excluded.action_url,
    updated_at = now(),
    status = CASE WHEN p_reopen THEN 'unread' ELSE n.status END,
    read_at = CASE WHEN p_reopen THEN NULL ELSE n.read_at END,
    resolved_at = CASE WHEN p_reopen THEN NULL ELSE n.resolved_at END,
    push_status = CASE WHEN p_reopen THEN 'pending' ELSE n.push_status END
  WHERE p_reopen OR n.status NOT IN ('done','archived')
  RETURNING n.id INTO v_id;

  RETURN v_id;
END;
$$;

-- Résolution automatique (fermeture) d'une famille de notifications
CREATE OR REPLACE FUNCTION public.crm_resolve(
  p_entity_type text,
  p_entity_id uuid,
  p_categories text[] DEFAULT NULL,
  p_types text[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.crm_notifications
  SET status = 'done', resolved_at = now(), updated_at = now(),
      push_status = CASE WHEN push_status = 'pending' THEN 'skipped' ELSE push_status END
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND status NOT IN ('done','archived')
    AND (p_categories IS NULL OR category = ANY(p_categories))
    AND (p_types IS NULL OR type = ANY(p_types));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Statistiques « À faire maintenant » / « Aujourd'hui »
CREATE OR REPLACE FUNCTION public.crm_notification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'unread', count(*) FILTER (WHERE status = 'unread'),
    'open', count(*) FILTER (WHERE status IN ('unread','read','in_progress')),
    'urgent', count(*) FILTER (WHERE status IN ('unread','read','in_progress') AND priority = 'urgente'),
    'important', count(*) FILTER (WHERE status IN ('unread','read','in_progress') AND priority = 'importante'),
    'overdue', count(*) FILTER (WHERE status IN ('unread','read','in_progress') AND due_at IS NOT NULL AND due_at < now()),
    'today', count(*) FILTER (WHERE status IN ('unread','read','in_progress') AND due_at IS NOT NULL
              AND (due_at AT TIME ZONE 'America/Toronto')::date = (now() AT TIME ZONE 'America/Toronto')::date),
    'by_category', coalesce((
      SELECT jsonb_object_agg(category, c) FROM (
        SELECT category, count(*) c FROM public.crm_notifications
        WHERE status IN ('unread','read','in_progress') GROUP BY category
      ) x), '{}'::jsonb)
  )
  FROM public.crm_notifications
  WHERE public.has_role(auth.uid(), 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.crm_notification_stats() TO authenticated;

-- =====================================================================
-- 3. DÉCLENCHEURS SUR LES DONNÉES EXISTANTES (lecture seule sur ces tables)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.crm_notify_submission_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num text := coalesce(NEW.dompe_number, NEW.submission_number::text, '');
  v_mat text := coalesce(array_to_string(NEW.materials, ', '), NEW.other_material, 'Matériau à confirmer');
BEGIN
  PERFORM public.crm_notify(
    'lead:new:' || NEW.id::text, 'lead', 'lead_new', 'importante',
    'Nouveau lead reçu — ' || coalesce(NEW.name, 'Client à confirmer'),
    trim(both ' ' from concat_ws(' · ', nullif(v_mat,''), nullif(coalesce(NEW.quantity, NEW.tonnage::text),''),
         nullif(coalesce(NEW.city, NEW.address),''))),
    'submission', NEW.id, '/admin?lead=' || NEW.id::text,
    NEW.name, nullif(v_num,''), now(),
    jsonb_build_object('phone', NEW.phone, 'email', NEW.email, 'address', NEW.address,
                       'material', v_mat, 'request_type', NEW.request_type),
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_submission_insert_t ON public.submissions;
CREATE TRIGGER crm_notify_submission_insert_t
  AFTER INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.crm_notify_submission_insert();

CREATE OR REPLACE FUNCTION public.crm_notify_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num text := coalesce(NEW.dompe_number, NEW.submission_number::text, '');
  v_url text := '/admin?lead=' || NEW.id::text;
  v_name text := coalesce(NEW.name, 'Client');
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;

  -- Le lead n'est plus « nouveau » : la relance de traitement n'a plus lieu d'être
  IF OLD.status = 'nouveau' AND NEW.status <> 'nouveau' THEN
    PERFORM public.crm_resolve('submission', NEW.id, NULL, ARRAY['lead_untreated','lead_new']);
  END IF;

  IF NEW.status IN ('perdu','archivé') THEN
    PERFORM public.crm_resolve('submission', NEW.id);
    RETURN NULL;
  END IF;

  IF NEW.status = 'à rappeler' THEN
    PERFORM public.crm_notify('lead:recall:' || NEW.id::text, 'relance', 'lead_recall', 'importante',
      'Rappel client — ' || v_name, 'Rappeler ' || v_name || ' concernant sa demande.',
      'submission', NEW.id, v_url, NEW.name, nullif(v_num,''),
      coalesce(NEW.desired_date::timestamptz, now()),
      jsonb_build_object('phone', NEW.phone), true);

  ELSIF NEW.status = 'message texte envoyé' THEN
    PERFORM public.crm_notify('lead:quote_todo:' || NEW.id::text, 'soumission', 'quote_todo', 'importante',
      'Soumission à préparer — ' || v_name, 'Une soumission est requise pour ' || v_name || '.',
      'submission', NEW.id, v_url, NEW.name, nullif(v_num,''), now(),
      '{}'::jsonb, true);

  ELSIF NEW.status = 'soumission envoyée' THEN
    PERFORM public.crm_resolve('submission', NEW.id, NULL, ARRAY['quote_todo']);
    PERFORM public.crm_notify('lead:quote_sent:' || NEW.id::text, 'soumission', 'quote_sent', 'normale',
      'Soumission envoyée — ' || v_name, 'La soumission de ' || v_name || ' est en attente de réponse.',
      'submission', NEW.id, v_url, NEW.name, nullif(v_num,''), now(),
      '{}'::jsonb, true);

  ELSIF NEW.status = 'soumission acceptée' THEN
    PERFORM public.crm_resolve('submission', NEW.id, NULL, ARRAY['quote_sent','quote_todo','quote_followup']);
    PERFORM public.crm_notify('lead:delivery_plan:' || NEW.id::text, 'livraison', 'delivery_to_plan', 'importante',
      'Livraison à planifier — ' || v_name, 'La soumission est acceptée : planifier la livraison.',
      'submission', NEW.id, v_url, NEW.name, nullif(v_num,''), now(),
      '{}'::jsonb, true);

  ELSIF NEW.status = 'en attente de livraison' THEN
    PERFORM public.crm_notify('lead:delivery_pending:' || NEW.id::text, 'livraison', 'delivery_pending', 'normale',
      'Livraison en attente — ' || v_name, 'Confirmer la date de livraison pour ' || v_name || '.',
      'submission', NEW.id, v_url, NEW.name, nullif(v_num,''),
      coalesce(NEW.delivery_deadline::timestamptz, now()), '{}'::jsonb, true);

  ELSIF NEW.status = 'en attente de paiement' THEN
    PERFORM public.crm_resolve('submission', NEW.id, ARRAY['livraison']::text[], NULL);
    PERFORM public.crm_notify('lead:payment_due:' || NEW.id::text, 'paiement', 'payment_due', 'importante',
      'Paiement à recevoir — ' || v_name, 'Le paiement de ' || v_name || ' est attendu.',
      'submission', NEW.id, v_url, NEW.name, nullif(v_num,''), now(), '{}'::jsonb, true);

  ELSIF NEW.status = 'paiement effectué' THEN
    PERFORM public.crm_resolve('submission', NEW.id, ARRAY['paiement','facturation','livraison']::text[], NULL);
    PERFORM public.crm_notify('lead:paid:' || NEW.id::text, 'paiement', 'payment_received', 'information',
      'Paiement reçu — ' || v_name, 'Le dossier de ' || v_name || ' est réglé.',
      'submission', NEW.id, v_url, NEW.name, nullif(v_num,''), NULL, '{}'::jsonb, true);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_submission_status_t ON public.submissions;
CREATE TRIGGER crm_notify_submission_status_t
  AFTER UPDATE OF status ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.crm_notify_submission_status();

-- Demandes d'accès / transport
CREATE OR REPLACE FUNCTION public.crm_notify_transport_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.crm_notify(
    'transport:new:' || NEW.id::text, 'lead', 'transport_request_new', 'importante',
    'Nouvelle demande — ' || coalesce(NEW.client_name, 'Client'),
    concat_ws(' · ', nullif(coalesce(NEW.material_type,''),''),
              nullif(concat_ws(' ', NEW.quantity::text, NEW.quantity_unit),''),
              nullif(coalesce(NEW.site_city, NEW.site_address),'')),
    'transport_request', NEW.id, '/admin/demandes-acces?demande=' || NEW.id::text,
    NEW.client_name, NEW.request_number, now(),
    jsonb_build_object('phone', NEW.client_phone, 'email', NEW.client_email), true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_transport_request_t ON public.transport_requests;
CREATE TRIGGER crm_notify_transport_request_t
  AFTER INSERT ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.crm_notify_transport_request();

-- Facturation (lead_trips = factures existantes)
CREATE OR REPLACE FUNCTION public.crm_notify_lead_trip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := '/admin?lead=' || NEW.submission_id::text;
  v_label text := coalesce(NEW.invoice_number, 'Facture');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.crm_notify('invoice:issued:' || NEW.id::text, 'facturation', 'invoice_issued', 'normale',
      'Facture créée — ' || v_label,
      'Montant : ' || to_char(coalesce(NEW.total_with_tax, NEW.total_price, 0), 'FM999999990.00') || ' $',
      'lead_trip', NEW.id, v_url, NULL, NEW.invoice_number, NEW.due_date::timestamptz,
      '{}'::jsonb, true);
    RETURN NULL;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NEW.payment_status IN ('paye','payé','paid') THEN
      PERFORM public.crm_resolve('lead_trip', NEW.id);
      PERFORM public.crm_notify('invoice:paid:' || NEW.id::text, 'paiement', 'payment_received', 'information',
        'Paiement reçu — ' || v_label, NULL, 'lead_trip', NEW.id, v_url, NULL, NEW.invoice_number,
        NULL, '{}'::jsonb, true);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_lead_trip_ins ON public.lead_trips;
CREATE TRIGGER crm_notify_lead_trip_ins
  AFTER INSERT ON public.lead_trips
  FOR EACH ROW EXECUTE FUNCTION public.crm_notify_lead_trip();

DROP TRIGGER IF EXISTS crm_notify_lead_trip_upd ON public.lead_trips;
CREATE TRIGGER crm_notify_lead_trip_upd
  AFTER UPDATE OF payment_status ON public.lead_trips
  FOR EACH ROW EXECUTE FUNCTION public.crm_notify_lead_trip();

-- =====================================================================
-- 4. BALAYAGE PÉRIODIQUE (leads non traités, suivis, livraisons, retards)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.crm_notifications_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Leads « nouveau » non traités
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

  -- Suivi des soumissions envoyées
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

  -- Livraisons à venir (calendrier existant)
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

  -- Paiements en retard (factures existantes)
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

  -- Fermeture des rappels devenus sans objet
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

  RETURN jsonb_build_object('created', v_created, 'at', now());
END;
$$;

SELECT cron.schedule(
  'crm-notifications-sweep',
  '*/10 * * * *',
  $cron$SELECT public.crm_notifications_sweep();$cron$
);
