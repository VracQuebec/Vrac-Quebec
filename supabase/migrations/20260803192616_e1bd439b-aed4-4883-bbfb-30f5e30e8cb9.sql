-- 1. Rôles génériques multi-acteurs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' AND e.enumlabel='proprietaire') THEN
    ALTER TYPE public.app_role ADD VALUE 'proprietaire';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' AND e.enumlabel='transporteur') THEN
    ALTER TYPE public.app_role ADD VALUE 'transporteur';
  END IF;
END $$;

-- 2. Historique : consigner la création
CREATE OR REPLACE FUNCTION public.log_transport_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.transport_request_history (request_id, field_key, old_value, new_value, user_id, user_email)
  VALUES (NEW.id, 'created', NULL, COALESCE(NEW.request_number, NEW.id::text), NEW.user_id, NEW.client_email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tr_history_created ON public.transport_requests;
CREATE TRIGGER trg_tr_history_created
AFTER INSERT ON public.transport_requests
FOR EACH ROW EXECUTE FUNCTION public.log_transport_request_created();

-- 3. L'entrepreneur voit l'historique de ses propres demandes
DROP POLICY IF EXISTS "Owners view own request history" ON public.transport_request_history;
CREATE POLICY "Owners view own request history"
ON public.transport_request_history
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.transport_requests r
  WHERE r.id = transport_request_history.request_id
    AND r.user_id = auth.uid()
));

-- 4. Notification automatique de l'entrepreneur à chaque changement d'état
CREATE OR REPLACE FUNCTION public.notify_entrepreneur_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  v_label := CASE NEW.status::text
    WHEN 'nouvelle' THEN 'Votre demande d''accès a bien été reçue.'
    WHEN 'en_analyse' THEN 'Votre demande d''accès est en analyse.'
    WHEN 'a_rappeler' THEN 'Votre demande d''accès est en analyse.'
    WHEN 'en_attente_proprietaire' THEN 'Nous avons contacté le propriétaire de la dompe.'
    WHEN 'soumission_envoyee' THEN 'Nous avons contacté le propriétaire de la dompe.'
    WHEN 'acceptee' THEN 'Bonne nouvelle : votre demande d''accès est acceptée.'
    WHEN 'refusee' THEN 'Votre demande d''accès a été refusée.'
    WHEN 'terminee' THEN 'Votre demande d''accès est terminée.'
    WHEN 'annulee' THEN 'Votre demande d''accès a été annulée.'
    ELSE 'Le suivi de votre demande d''accès a été mis à jour.'
  END;

  INSERT INTO public.jsc_notifications (audience, user_id, channel, title, body, entity_type, entity_id, status)
  VALUES ('client', NEW.user_id, 'in_app',
          COALESCE(NEW.request_number, 'Demande d''accès'),
          v_label, 'access_request', NEW.id, 'sent');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_entrepreneur_status ON public.transport_requests;
CREATE TRIGGER trg_notify_entrepreneur_status
AFTER UPDATE ON public.transport_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_entrepreneur_status();

-- 5. Statistiques du tableau de bord des demandes d'accès
CREATE OR REPLACE FUNCTION public.access_requests_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'today', (SELECT count(*) FROM transport_requests WHERE created_at >= date_trunc('day', now())),
    'week', (SELECT count(*) FROM transport_requests WHERE created_at >= date_trunc('week', now())),
    'month', (SELECT count(*) FROM transport_requests WHERE created_at >= date_trunc('month', now())),
    'total', (SELECT count(*) FROM transport_requests),
    'accepted', (SELECT count(*) FROM transport_requests WHERE status::text IN ('acceptee','planifiee','en_cours')),
    'refused', (SELECT count(*) FROM transport_requests WHERE status::text = 'refusee'),
    'cancelled', (SELECT count(*) FROM transport_requests WHERE status::text = 'annulee'),
    'done', (SELECT count(*) FROM transport_requests WHERE status::text = 'terminee'),
    'pending', (SELECT count(*) FROM transport_requests WHERE status::text IN ('nouvelle','en_analyse','a_rappeler','en_attente_proprietaire','soumission_envoyee')),
    'avg_response_hours', (
      SELECT round(avg(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0)::numeric, 1)
      FROM transport_requests
      WHERE status::text NOT IN ('nouvelle') AND updated_at > created_at
    ),
    'top_cities', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT site_city AS name, count(*) AS n FROM transport_requests
        WHERE site_city IS NOT NULL AND site_city <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 5
      ) x), '[]'::jsonb),
    'top_materials', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT material_type AS name, count(*) AS n FROM transport_requests
        WHERE material_type IS NOT NULL AND material_type <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 5
      ) x), '[]'::jsonb),
    'top_dumps', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT dump_name AS name, count(*) AS n FROM transport_requests
        WHERE dump_name IS NOT NULL AND dump_name <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 5
      ) x), '[]'::jsonb),
    'active_entrepreneurs', (
      SELECT count(DISTINCT COALESCE(user_id::text, lower(client_email)))
      FROM transport_requests WHERE created_at >= now() - interval '30 days'
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.access_requests_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_requests_stats() TO authenticated;

-- 6. Index de performance
CREATE INDEX IF NOT EXISTS idx_tr_user_created ON public.transport_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tr_status_created ON public.transport_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tr_created ON public.transport_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trh_request ON public.transport_request_history (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jsc_notif_user ON public.jsc_notifications (user_id, created_at DESC);