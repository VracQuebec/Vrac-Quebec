
-- ============ Sprint 5 : Centre des Opérations ============

-- 1) Projets
CREATE TABLE public.jsc_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  project_number text,
  name text NOT NULL,
  client_id uuid REFERENCES public.jsc_clients(id),
  address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  status text NOT NULL DEFAULT 'actif',
  start_date date,
  end_date date,
  notes text,
  internal_notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, project_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_projects TO authenticated;
GRANT ALL ON public.jsc_projects TO service_role;
ALTER TABLE public.jsc_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage projects" ON public.jsc_projects
  FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid()))
  WITH CHECK (public.jsc_can_manage(auth.uid()));

ALTER TABLE public.jsc_requests ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.jsc_projects(id);
ALTER TABLE public.jsc_orders ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.jsc_projects(id);
ALTER TABLE public.jsc_orders ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normale';

-- 2) Livraisons (unité opérationnelle)
CREATE TABLE public.jsc_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  delivery_number text,
  order_id uuid REFERENCES public.jsc_orders(id),
  project_id uuid REFERENCES public.jsc_projects(id),
  client_id uuid REFERENCES public.jsc_clients(id),
  material_id uuid REFERENCES public.jsc_materials(id),
  supplier_id uuid REFERENCES public.jsc_suppliers(id),
  pickup_location_id uuid REFERENCES public.jsc_pickup_locations(id),
  carrier_id uuid,
  truck_id uuid REFERENCES public.jsc_trucks(id),
  driver_id uuid REFERENCES public.jsc_drivers(id),
  quantity numeric,
  quantity_unit text DEFAULT 'tonne',
  trip_index integer DEFAULT 1,
  delivery_address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  scheduled_date date,
  scheduled_time text,
  duration_minutes integer DEFAULT 60,
  priority text NOT NULL DEFAULT 'normale',
  status text NOT NULL DEFAULT 'a_planifier',
  group_key text,
  distance_km numeric,
  estimated_cost numeric,
  notes text,
  internal_notes text,
  started_at timestamptz,
  loaded_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, delivery_number)
);
CREATE INDEX idx_jsc_deliveries_sched ON public.jsc_deliveries (company_id, scheduled_date, status);
CREATE INDEX idx_jsc_deliveries_order ON public.jsc_deliveries (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_deliveries TO authenticated;
GRANT ALL ON public.jsc_deliveries TO service_role;
ALTER TABLE public.jsc_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage deliveries" ON public.jsc_deliveries
  FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid()))
  WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 3) Incidents
CREATE TABLE public.jsc_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  delivery_id uuid REFERENCES public.jsc_deliveries(id),
  order_id uuid REFERENCES public.jsc_orders(id),
  project_id uuid REFERENCES public.jsc_projects(id),
  incident_type text NOT NULL DEFAULT 'autre',
  severity text NOT NULL DEFAULT 'moyenne',
  status text NOT NULL DEFAULT 'ouvert',
  description text NOT NULL,
  resolution text,
  reported_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_incidents TO authenticated;
GRANT ALL ON public.jsc_incidents TO service_role;
ALTER TABLE public.jsc_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage incidents" ON public.jsc_incidents
  FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid()))
  WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 4) Historique des statuts
CREATE TABLE public.jsc_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_label text,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_jsc_status_history_entity ON public.jsc_status_history (entity_type, entity_id, created_at DESC);
GRANT SELECT, INSERT ON public.jsc_status_history TO authenticated;
GRANT ALL ON public.jsc_status_history TO service_role;
ALTER TABLE public.jsc_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read status history" ON public.jsc_status_history
  FOR SELECT TO authenticated USING (public.jsc_can_manage(auth.uid()));
CREATE POLICY "Admins write status history" ON public.jsc_status_history
  FOR INSERT TO authenticated WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 5) Notifications
CREATE TABLE public.jsc_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  audience text NOT NULL DEFAULT 'repartiteur',
  user_id uuid,
  channel text NOT NULL DEFAULT 'interne',
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'en_attente',
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_jsc_notifications_feed ON public.jsc_notifications (company_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.jsc_notifications TO authenticated;
GRANT ALL ON public.jsc_notifications TO service_role;
ALTER TABLE public.jsc_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage notifications" ON public.jsc_notifications
  FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid()) OR user_id = auth.uid())
  WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 6) Flotte : statut opérationnel
ALTER TABLE public.jsc_trucks ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'disponible';
ALTER TABLE public.jsc_trucks ADD COLUMN IF NOT EXISTS current_driver_id uuid;
ALTER TABLE public.jsc_drivers ADD COLUMN IF NOT EXISTS schedule text;

-- 7) Numérotation + updated_at + audit
INSERT INTO public.jsc_settings (key, value, label, company_id)
SELECT k.key, k.value, k.label, c.id
FROM public.jsc_companies c
CROSS JOIN (VALUES
  ('numbering_project_prefix','PRJ-','Préfixe des numéros de projet'),
  ('numbering_delivery_prefix','LIV-','Préfixe des numéros de livraison')
) AS k(key, value, label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.jsc_settings s WHERE s.key = k.key AND s.company_id = c.id
);

CREATE TRIGGER jsc_projects_number BEFORE INSERT ON public.jsc_projects
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('project_number', 'project');
CREATE TRIGGER jsc_deliveries_number BEFORE INSERT ON public.jsc_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('delivery_number', 'delivery');

CREATE TRIGGER jsc_projects_updated BEFORE UPDATE ON public.jsc_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER jsc_deliveries_updated BEFORE UPDATE ON public.jsc_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER jsc_incidents_updated BEFORE UPDATE ON public.jsc_incidents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER jsc_projects_audit AFTER INSERT OR UPDATE OR DELETE ON public.jsc_projects
  FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger();
CREATE TRIGGER jsc_deliveries_audit AFTER INSERT OR UPDATE OR DELETE ON public.jsc_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger();
CREATE TRIGGER jsc_incidents_audit AFTER INSERT OR UPDATE OR DELETE ON public.jsc_incidents
  FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger();

-- 8) Historisation automatique des transitions
CREATE OR REPLACE FUNCTION public.jsc_track_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new jsonb := to_jsonb(NEW);
  v_label text;
BEGIN
  IF TG_OP = 'UPDATE' AND (v_old ->> 'status') IS NOT DISTINCT FROM (v_new ->> 'status') THEN
    RETURN NEW;
  END IF;
  v_label := COALESCE(
    v_new ->> 'delivery_number', v_new ->> 'order_number', v_new ->> 'quote_number',
    v_new ->> 'request_number', v_new ->> 'project_number', v_new ->> 'name'
  );
  INSERT INTO public.jsc_status_history (
    company_id, entity_type, entity_id, entity_label, from_status, to_status, actor_id, actor_email
  ) VALUES (
    NULLIF(v_new ->> 'company_id', '')::uuid, TG_ARGV[0], NEW.id, v_label,
    v_old ->> 'status', v_new ->> 'status', auth.uid(), public.current_user_email()
  );
  RETURN NEW;
END $$;

CREATE TRIGGER jsc_deliveries_status AFTER INSERT OR UPDATE ON public.jsc_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('delivery');
CREATE TRIGGER jsc_orders_status AFTER INSERT OR UPDATE ON public.jsc_orders
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('order');
CREATE TRIGGER jsc_quotes_status AFTER INSERT OR UPDATE ON public.jsc_quotes
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('quote');
CREATE TRIGGER jsc_requests_status AFTER INSERT OR UPDATE ON public.jsc_requests
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('request');

-- 9) Tableau de bord opérationnel
CREATE OR REPLACE FUNCTION public.jsc_ops_dashboard(_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Toronto')::date;
  v_result jsonb;
BEGIN
  IF NOT public.jsc_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'requests_today', (SELECT count(*) FROM jsc_requests r WHERE (_company_id IS NULL OR r.company_id = _company_id) AND r.created_at::date = v_today),
    'estimates_today', (SELECT count(*) FROM jsc_estimates e WHERE (_company_id IS NULL OR e.company_id = _company_id) AND e.created_at::date = v_today),
    'quotes_pending', (SELECT count(*) FROM jsc_quotes q WHERE (_company_id IS NULL OR q.company_id = _company_id) AND q.status IN ('brouillon','envoyee','envoyée')),
    'orders_to_plan', (SELECT count(*) FROM jsc_orders o WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL AND (o.scheduled_date IS NULL OR o.status IN ('a_planifier','nouvelle'))),
    'deliveries_today', (SELECT count(*) FROM jsc_deliveries d WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.scheduled_date = v_today AND d.archived_at IS NULL),
    'deliveries_in_progress', (SELECT count(*) FROM jsc_deliveries d WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.status IN ('en_chargement','en_livraison')),
    'deliveries_done_today', (SELECT count(*) FROM jsc_deliveries d WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.status IN ('livree','terminee') AND d.scheduled_date = v_today),
    'orders_late', (SELECT count(*) FROM jsc_deliveries d WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.scheduled_date < v_today AND d.status NOT IN ('livree','terminee','annulee') AND d.archived_at IS NULL),
    'trucks_available', (SELECT count(*) FROM jsc_trucks t WHERE (_company_id IS NULL OR t.company_id = _company_id) AND t.archived_at IS NULL AND t.operational_status = 'disponible'),
    'trucks_busy', (SELECT count(*) FROM jsc_trucks t WHERE (_company_id IS NULL OR t.company_id = _company_id) AND t.archived_at IS NULL AND t.operational_status IN ('reserve','en_chargement','en_livraison','retour')),
    'drivers_available', (SELECT count(*) FROM jsc_drivers dr WHERE (_company_id IS NULL OR dr.company_id = _company_id) AND dr.archived_at IS NULL AND COALESCE(dr.status,'disponible') = 'disponible'),
    'revenue_today', (SELECT COALESCE(sum(o.total),0) FROM jsc_orders o WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL AND o.created_at::date = v_today),
    'revenue_month', (SELECT COALESCE(sum(o.total),0) FROM jsc_orders o WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL AND date_trunc('month', o.created_at) = date_trunc('month', now())),
    'incidents_open', (SELECT count(*) FROM jsc_incidents i WHERE (_company_id IS NULL OR i.company_id = _company_id) AND i.status = 'ouvert'),
    'projects_active', (SELECT count(*) FROM jsc_projects p WHERE (_company_id IS NULL OR p.company_id = _company_id) AND p.archived_at IS NULL AND p.status = 'actif'),
    'week_series', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x->>'day'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'day', g::date,
          'deliveries', (SELECT count(*) FROM jsc_deliveries d WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.scheduled_date = g::date AND d.archived_at IS NULL)
        ) AS x
        FROM generate_series(v_today - 6, v_today, interval '1 day') g
      ) s
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.jsc_ops_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_ops_dashboard(uuid) TO authenticated, service_role;
