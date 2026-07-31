
-- ============================================================
-- SPRINT PRODUCTION 2 — PLATEFORME SaaS MULTI-ENTREPRISES
-- ============================================================

-- 1. IDENTITÉ & PERSONNALISATION DE CHAQUE ENTREPRISE ---------
ALTER TABLE public.jsc_companies
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#7ED321',
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#111111',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS qst_number text,
  ADD COLUMN IF NOT EXISTS email_from text,
  ADD COLUMN IF NOT EXISTS email_signature text,
  ADD COLUMN IF NOT EXISTS sms_sender text,
  ADD COLUMN IF NOT EXISTS quote_terms text,
  ADD COLUMN IF NOT EXISTS invoice_terms text,
  ADD COLUMN IF NOT EXISTS document_footer text,
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT false;

-- 2. RÔLES OFFICIELS DE LA PLATEFORME -------------------------
CREATE TABLE IF NOT EXISTS public.jsc_roles (
  code text PRIMARY KEY,
  label text NOT NULL,
  description text,
  is_internal boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jsc_roles TO authenticated;
GRANT ALL ON public.jsc_roles TO service_role;
ALTER TABLE public.jsc_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roles readable by authenticated" ON public.jsc_roles;
CREATE POLICY "roles readable by authenticated" ON public.jsc_roles
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.jsc_roles (code, label, description, is_internal, sort_order) VALUES
  ('super_admin','Super administrateur','Accès complet à toutes les entreprises et à la configuration de la plateforme.',true,1),
  ('admin','Administrateur','Gestion complète d''une entreprise.',true,2),
  ('dispatcher','Répartiteur','Planification, répartition et suivi des livraisons.',true,3),
  ('manager','Gestionnaire','Suivi commercial et opérationnel.',true,4),
  ('accounting','Comptabilité','Facturation, paiements et rapports financiers.',true,5),
  ('driver','Chauffeur','Accès mobile à ses transports et preuves de livraison.',true,6),
  ('sales','Représentant','Demandes, soumissions et relation client.',true,7),
  ('client','Client','Portail client : demandes, soumissions, commandes, factures.',false,8),
  ('contractor','Entrepreneur','Portail entrepreneur : chantiers, projets et commandes récurrentes.',false,9)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description,
  is_internal = EXCLUDED.is_internal, sort_order = EXCLUDED.sort_order;

-- 3. LIENS PORTAILS (client / chauffeur) ----------------------
ALTER TABLE public.jsc_clients ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.jsc_drivers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS jsc_clients_user_idx ON public.jsc_clients(user_id);
CREATE INDEX IF NOT EXISTS jsc_drivers_user_idx ON public.jsc_drivers(user_id);

-- 4. PREUVE DE LIVRAISON (portail chauffeur) ------------------
ALTER TABLE public.jsc_deliveries
  ADD COLUMN IF NOT EXISTS signature_name text,
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS proof_photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS driver_notes text;

-- 5. MODÈLES ET PRÉFÉRENCES DE NOTIFICATION -------------------
CREATE TABLE IF NOT EXISTS public.jsc_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  subject text,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'internal',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_notification_templates TO authenticated;
GRANT ALL ON public.jsc_notification_templates TO service_role;
ALTER TABLE public.jsc_notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage notification templates" ON public.jsc_notification_templates;
CREATE POLICY "admins manage notification templates" ON public.jsc_notification_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. CLÉS D'API ET JOURNAL DES APPELS -------------------------
CREATE TABLE IF NOT EXISTS public.jsc_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{read}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jsc_api_keys_hash_idx ON public.jsc_api_keys(key_hash);
GRANT SELECT, INSERT, UPDATE ON public.jsc_api_keys TO authenticated;
GRANT ALL ON public.jsc_api_keys TO service_role;
ALTER TABLE public.jsc_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage api keys" ON public.jsc_api_keys;
CREATE POLICY "admins manage api keys" ON public.jsc_api_keys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.jsc_api_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.jsc_api_keys(id) ON DELETE SET NULL,
  company_id uuid,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer,
  ip_address text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jsc_api_requests_created_idx ON public.jsc_api_requests(created_at DESC);
GRANT SELECT ON public.jsc_api_requests TO authenticated;
GRANT ALL ON public.jsc_api_requests TO service_role;
ALTER TABLE public.jsc_api_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read api requests" ON public.jsc_api_requests;
CREATE POLICY "admins read api requests" ON public.jsc_api_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. HISTORIQUE DES CONNEXIONS --------------------------------
CREATE TABLE IF NOT EXISTS public.jsc_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  event text NOT NULL DEFAULT 'sign_in',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jsc_login_history_user_idx ON public.jsc_login_history(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.jsc_login_history TO authenticated;
GRANT ALL ON public.jsc_login_history TO service_role;
ALTER TABLE public.jsc_login_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users insert own login history" ON public.jsc_login_history;
CREATE POLICY "users insert own login history" ON public.jsc_login_history
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users read own login history" ON public.jsc_login_history;
CREATE POLICY "users read own login history" ON public.jsc_login_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 8. FONCTIONS D'ACCÈS MULTI-ENTREPRISES ----------------------
CREATE OR REPLACE FUNCTION public.jsc_is_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jsc_company_members m
    WHERE m.user_id = auth.uid() AND m.is_active AND m.archived_at IS NULL
      AND (_company_id IS NULL OR m.company_id = _company_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.jsc_can(_company_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1
    FROM public.jsc_company_members m
    JOIN public.jsc_role_permissions p
      ON p.role = m.role AND p.module = _module
     AND (p.company_id = m.company_id OR p.company_id IS NULL)
    WHERE m.user_id = auth.uid() AND m.is_active AND m.archived_at IS NULL
      AND m.company_id = _company_id
      AND p.is_active AND p.archived_at IS NULL
      AND CASE _action
            WHEN 'view' THEN p.can_view
            WHEN 'edit' THEN p.can_edit
            WHEN 'delete' THEN p.can_delete
            ELSE false
          END
  );
$$;

CREATE OR REPLACE FUNCTION public.jsc_my_client_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.jsc_clients WHERE user_id = auth.uid() AND archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.jsc_my_driver_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.jsc_drivers WHERE user_id = auth.uid() AND archived_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.jsc_is_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.jsc_can(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.jsc_my_client_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.jsc_my_driver_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_is_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jsc_can(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jsc_my_client_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jsc_my_driver_ids() TO authenticated, service_role;

-- 9. POLITIQUES DES PORTAILS ----------------------------------
DROP POLICY IF EXISTS "portal client reads own file" ON public.jsc_clients;
CREATE POLICY "portal client reads own file" ON public.jsc_clients
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "portal driver reads own file" ON public.jsc_drivers;
CREATE POLICY "portal driver reads own file" ON public.jsc_drivers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "portal client reads own requests" ON public.jsc_requests;
CREATE POLICY "portal client reads own requests" ON public.jsc_requests
  FOR SELECT TO authenticated USING (client_id IN (SELECT public.jsc_my_client_ids()));

DROP POLICY IF EXISTS "portal client reads own quotes" ON public.jsc_quotes;
CREATE POLICY "portal client reads own quotes" ON public.jsc_quotes
  FOR SELECT TO authenticated USING (client_id IN (SELECT public.jsc_my_client_ids()));

DROP POLICY IF EXISTS "portal client accepts own quotes" ON public.jsc_quotes;
CREATE POLICY "portal client accepts own quotes" ON public.jsc_quotes
  FOR UPDATE TO authenticated
  USING (client_id IN (SELECT public.jsc_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.jsc_my_client_ids()));

DROP POLICY IF EXISTS "portal client reads own orders" ON public.jsc_orders;
CREATE POLICY "portal client reads own orders" ON public.jsc_orders
  FOR SELECT TO authenticated USING (client_id IN (SELECT public.jsc_my_client_ids()));

DROP POLICY IF EXISTS "portal client reads own invoices" ON public.jsc_invoices;
CREATE POLICY "portal client reads own invoices" ON public.jsc_invoices
  FOR SELECT TO authenticated USING (client_id IN (SELECT public.jsc_my_client_ids()));

DROP POLICY IF EXISTS "portal reads own deliveries" ON public.jsc_deliveries;
CREATE POLICY "portal reads own deliveries" ON public.jsc_deliveries
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.jsc_my_client_ids())
      OR driver_id IN (SELECT public.jsc_my_driver_ids()));

DROP POLICY IF EXISTS "portal driver updates own deliveries" ON public.jsc_deliveries;
CREATE POLICY "portal driver updates own deliveries" ON public.jsc_deliveries
  FOR UPDATE TO authenticated
  USING (driver_id IN (SELECT public.jsc_my_driver_ids()))
  WITH CHECK (driver_id IN (SELECT public.jsc_my_driver_ids()));

DROP POLICY IF EXISTS "portal reads own notifications" ON public.jsc_notifications;
CREATE POLICY "portal reads own notifications" ON public.jsc_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "portal updates own notifications" ON public.jsc_notifications;
CREATE POLICY "portal updates own notifications" ON public.jsc_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 10. PERMISSIONS PAR DÉFAUT POUR CHAQUE NOUVELLE ENTREPRISE ---
CREATE OR REPLACE FUNCTION public.jsc_seed_role_permissions(_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  modules text[] := ARRAY['clients','requests','quotes','orders','deliveries','invoices','materials',
                          'suppliers','carriers','trucks','drivers','rates','settings','intelligence'];
  m text; r record; inserted integer := 0;
  v_view boolean; v_edit boolean; v_delete boolean;
BEGIN
  FOR r IN SELECT code FROM public.jsc_roles WHERE is_internal LOOP
    FOREACH m IN ARRAY modules LOOP
      v_view := true; v_edit := false; v_delete := false;
      IF r.code IN ('super_admin','admin') THEN
        v_edit := true; v_delete := true;
      ELSIF r.code = 'dispatcher' THEN
        v_edit := m IN ('deliveries','orders','drivers','trucks','requests');
      ELSIF r.code = 'manager' THEN
        v_edit := m IN ('clients','requests','quotes','orders','deliveries');
      ELSIF r.code = 'accounting' THEN
        v_edit := m IN ('invoices','clients');
      ELSIF r.code = 'sales' THEN
        v_edit := m IN ('clients','requests','quotes');
      ELSIF r.code = 'driver' THEN
        v_view := m IN ('deliveries','trucks');
        v_edit := m = 'deliveries';
      END IF;
      INSERT INTO public.jsc_role_permissions (company_id, role, module, can_view, can_edit, can_delete)
      SELECT _company_id, r.code, m, v_view, v_edit, v_delete
      WHERE NOT EXISTS (
        SELECT 1 FROM public.jsc_role_permissions p
        WHERE p.company_id = _company_id AND p.role = r.code AND p.module = m
      );
      inserted := inserted + 1;
    END LOOP;
  END LOOP;
  RETURN inserted;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.jsc_seed_role_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_seed_role_permissions(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jsc_company_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.jsc_seed_role_permissions(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS jsc_companies_seed_permissions ON public.jsc_companies;
CREATE TRIGGER jsc_companies_seed_permissions
AFTER INSERT ON public.jsc_companies
FOR EACH ROW EXECUTE FUNCTION public.jsc_company_after_insert();

-- Entreprises existantes
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM public.jsc_companies LOOP
    PERFORM public.jsc_seed_role_permissions(c.id);
  END LOOP;
END $$;

-- 11. CENTRE DE NOTIFICATIONS ---------------------------------
CREATE OR REPLACE FUNCTION public.jsc_notify(
  _company_id uuid, _event_code text, _title text, _body text,
  _audience text DEFAULT 'internal', _user_id uuid DEFAULT NULL,
  _entity_type text DEFAULT NULL, _entity_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.jsc_notifications (company_id, audience, user_id, channel, title, body, entity_type, entity_id, status)
  VALUES (_company_id, _audience, _user_id, 'in_app', _title,
          COALESCE(_body, _event_code), _entity_type, _entity_id, 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.jsc_notify(uuid, text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_notify(uuid, text, text, text, text, uuid, text, uuid) TO authenticated, service_role;

-- Modèles par défaut (une seule fois)
INSERT INTO public.jsc_notification_templates (company_id, event_code, channel, subject, body, audience, sort_order)
SELECT NULL, e.code, 'in_app', e.subject, e.body, e.audience, e.ord
FROM (VALUES
  ('request_created','Nouvelle demande reçue','Une nouvelle demande {{numero}} a été reçue de {{client}}.','internal',1),
  ('quote_sent','Nouvelle soumission','La soumission {{numero}} est disponible pour {{client}}.','client',2),
  ('order_accepted','Commande acceptée','La commande {{numero}} a été acceptée.','internal',3),
  ('delivery_scheduled','Livraison prévue','La livraison {{numero}} est prévue le {{date}}.','client',4),
  ('delivery_completed','Livraison terminée','La livraison {{numero}} est terminée.','client',5),
  ('invoice_generated','Facture générée','La facture {{numero}} est disponible.','client',6),
  ('incident_reported','Incident signalé','Un incident a été signalé sur {{numero}}.','internal',7),
  ('delivery_delayed','Retard de livraison','La livraison {{numero}} accuse un retard.','internal',8),
  ('internal_message','Message interne','{{message}}','internal',9)
) AS e(code, subject, body, audience, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.jsc_notification_templates t WHERE t.event_code = e.code AND t.company_id IS NULL
);

-- 12. VUES DES PORTAILS ---------------------------------------
CREATE OR REPLACE FUNCTION public.jsc_client_portal()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ids AS (SELECT id FROM public.jsc_clients WHERE user_id = auth.uid() AND archived_at IS NULL)
  SELECT jsonb_build_object(
    'client', (SELECT to_jsonb(c) - 'internal_notes' FROM public.jsc_clients c WHERE c.user_id = auth.uid() LIMIT 1),
    'requests', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'internal_notes' ORDER BY r.created_at DESC)
                          FROM public.jsc_requests r WHERE r.client_id IN (SELECT id FROM ids) AND r.archived_at IS NULL), '[]'::jsonb),
    'quotes', COALESCE((SELECT jsonb_agg(to_jsonb(q) - 'internal_notes' ORDER BY q.created_at DESC)
                        FROM public.jsc_quotes q WHERE q.client_id IN (SELECT id FROM ids) AND q.archived_at IS NULL), '[]'::jsonb),
    'orders', COALESCE((SELECT jsonb_agg(to_jsonb(o) - 'internal_notes' ORDER BY o.created_at DESC)
                        FROM public.jsc_orders o WHERE o.client_id IN (SELECT id FROM ids) AND o.archived_at IS NULL), '[]'::jsonb),
    'deliveries', COALESCE((SELECT jsonb_agg(to_jsonb(d) - 'internal_notes' - 'estimated_cost' ORDER BY d.scheduled_date DESC)
                            FROM public.jsc_deliveries d WHERE d.client_id IN (SELECT id FROM ids) AND d.archived_at IS NULL), '[]'::jsonb),
    'invoices', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC)
                          FROM public.jsc_invoices i WHERE i.client_id IN (SELECT id FROM ids) AND i.archived_at IS NULL), '[]'::jsonb),
    'generated_at', now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.jsc_client_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_client_portal() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jsc_driver_portal(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ids AS (SELECT id FROM public.jsc_drivers WHERE user_id = auth.uid() AND archived_at IS NULL)
  SELECT jsonb_build_object(
    'driver', (SELECT to_jsonb(d) - 'internal_notes' - 'hourly_cost' FROM public.jsc_drivers d WHERE d.user_id = auth.uid() LIMIT 1),
    'truck', (SELECT to_jsonb(t) FROM public.jsc_trucks t
              WHERE t.id = (SELECT default_truck_id FROM public.jsc_drivers WHERE user_id = auth.uid() LIMIT 1)),
    'deliveries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'delivery_number', d.delivery_number, 'status', d.status,
        'scheduled_date', d.scheduled_date, 'scheduled_time', d.scheduled_time,
        'delivery_address', d.delivery_address, 'city', d.city, 'postal_code', d.postal_code,
        'latitude', d.latitude, 'longitude', d.longitude,
        'quantity', d.quantity, 'quantity_unit', d.quantity_unit, 'distance_km', d.distance_km,
        'notes', d.notes, 'driver_notes', d.driver_notes,
        'signature_name', d.signature_name, 'proof_photos', d.proof_photos,
        'material', (SELECT m.name FROM public.jsc_materials m WHERE m.id = d.material_id),
        'pickup', (SELECT p.name FROM public.jsc_pickup_locations p WHERE p.id = d.pickup_location_id),
        'client', (SELECT c.name FROM public.jsc_clients c WHERE c.id = d.client_id)
      ) ORDER BY d.scheduled_date, d.scheduled_time)
      FROM public.jsc_deliveries d
      WHERE d.driver_id IN (SELECT id FROM ids) AND d.archived_at IS NULL
        AND (_from IS NULL OR d.scheduled_date >= _from)
        AND (_to IS NULL OR d.scheduled_date <= _to)), '[]'::jsonb),
    'generated_at', now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.jsc_driver_portal(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_driver_portal(date, date) TO authenticated, service_role;
