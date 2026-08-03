-- ============ Sprint Production 7 — Orchestrateur Global & Digital Twin ============

-- 1. Événements
CREATE TABLE public.jsc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  label text,
  severity text NOT NULL DEFAULT 'info',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jsc_events TO authenticated;
GRANT ALL ON public.jsc_events TO service_role;
ALTER TABLE public.jsc_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage platform events" ON public.jsc_events
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));
CREATE INDEX idx_jsc_events_created ON public.jsc_events (created_at DESC);
CREATE INDEX idx_jsc_events_type ON public.jsc_events (event_type, created_at DESC);

-- 2. Risques
CREATE TABLE public.jsc_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  code text NOT NULL,
  category text NOT NULL DEFAULT 'operation',
  title text NOT NULL,
  detail text,
  level text NOT NULL DEFAULT 'low',
  score numeric NOT NULL DEFAULT 0,
  entity_type text,
  entity_id uuid,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.jsc_risks TO authenticated;
GRANT ALL ON public.jsc_risks TO service_role;
ALTER TABLE public.jsc_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage risks" ON public.jsc_risks
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));
CREATE UNIQUE INDEX uq_jsc_risks_open ON public.jsc_risks (code, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';

-- 3. Simulations
CREATE TABLE public.jsc_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  name text NOT NULL,
  scenario_type text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  projection jsonb NOT NULL DEFAULT '{}'::jsonb,
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_simulations TO authenticated;
GRANT ALL ON public.jsc_simulations TO service_role;
ALTER TABLE public.jsc_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage simulations" ON public.jsc_simulations
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 4. Recommandations stratégiques
CREATE TABLE public.jsc_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  kind text NOT NULL,
  title text NOT NULL,
  rationale text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  impact_estimate numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  horizon text NOT NULL DEFAULT 'court_terme',
  status text NOT NULL DEFAULT 'proposed',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.jsc_strategies TO authenticated;
GRANT ALL ON public.jsc_strategies TO service_role;
ALTER TABLE public.jsc_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage strategies" ON public.jsc_strategies
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 5. Règles d'orchestration configurables
CREATE TABLE public.jsc_orch_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  code text NOT NULL,
  label text NOT NULL,
  description text,
  metric text NOT NULL,
  operator text NOT NULL DEFAULT 'lt',
  threshold numeric NOT NULL DEFAULT 0,
  action_type text NOT NULL DEFAULT 'alert',
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'warning',
  is_active boolean NOT NULL DEFAULT true,
  cooldown_minutes integer NOT NULL DEFAULT 720,
  trigger_count integer NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,
  last_value numeric,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_orch_rules TO authenticated;
GRANT ALL ON public.jsc_orch_rules TO service_role;
ALTER TABLE public.jsc_orch_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage orchestration rules" ON public.jsc_orch_rules
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

CREATE TRIGGER trg_jsc_risks_updated BEFORE UPDATE ON public.jsc_risks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_simulations_updated BEFORE UPDATE ON public.jsc_simulations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_strategies_updated BEFORE UPDATE ON public.jsc_strategies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_orch_rules_updated BEFORE UPDATE ON public.jsc_orch_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Moteurs serveur ============

-- Journalisation d'un événement de plateforme
CREATE OR REPLACE FUNCTION public.jsc_emit_event(
  _company_id uuid, _event_type text, _label text DEFAULT NULL,
  _entity_type text DEFAULT NULL, _entity_id uuid DEFAULT NULL,
  _severity text DEFAULT 'info', _payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.jsc_events (company_id, event_type, entity_type, entity_id, label, severity, payload, created_by)
  VALUES (_company_id, _event_type, _entity_type, _entity_id, _label, coalesce(_severity,'info'), coalesce(_payload,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Indicateurs temps réel
CREATE OR REPLACE FUNCTION public.jsc_orch_kpis(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_from date := current_date - 90;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  WITH f AS (
    SELECT * FROM public.jsc_bi_order_facts(_company_id, v_from, current_date)
  ), d AS (
    SELECT * FROM public.jsc_deliveries
    WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)
      AND created_at >= (current_date - 90)
  ), o AS (
    SELECT * FROM public.jsc_orders
    WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)
  ), r AS (
    SELECT * FROM public.jsc_requests
    WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)
      AND created_at >= (current_date - 90)
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'revenue_today', (SELECT coalesce(sum(total),0) FROM o WHERE created_at::date = current_date),
    'revenue_month', (SELECT coalesce(sum(total),0) FROM o WHERE created_at >= date_trunc('month', now())),
    'revenue_90d', (SELECT coalesce(sum(total),0) FROM f),
    'profit_90d', (SELECT coalesce(sum(net_margin),0) FROM f),
    'avg_margin_pct', (SELECT CASE WHEN coalesce(sum(total),0) > 0
        THEN round(100 * sum(net_margin) / sum(total), 2) ELSE 0 END FROM f),
    'open_orders', (SELECT count(*) FROM o WHERE status NOT IN ('termine','annule','facture','paye')),
    'requests_90d', (SELECT count(*) FROM r),
    'conversion_pct', (SELECT CASE WHEN (SELECT count(*) FROM r) > 0
        THEN round(100.0 * (SELECT count(*) FROM f) / (SELECT count(*) FROM r), 2) ELSE 0 END),
    'tonnes_90d', (SELECT coalesce(sum(quantity),0) FROM f),
    'cost_per_tonne', (SELECT CASE WHEN coalesce(sum(quantity),0) > 0
        THEN round((sum(material_cost) + sum(transport_cost)) / sum(quantity), 2) ELSE 0 END FROM f),
    'km_90d', (SELECT coalesce(sum(distance_km),0) FROM d),
    'cost_per_km', (SELECT CASE WHEN coalesce(sum(distance_km),0) > 0
        THEN round(coalesce(sum(estimated_cost),0) / sum(distance_km), 2) ELSE 0 END FROM d),
    'cost_per_delivery', (SELECT CASE WHEN count(*) > 0
        THEN round(coalesce(sum(estimated_cost),0) / count(*), 2) ELSE 0 END FROM d),
    'deliveries_90d', (SELECT count(*) FROM d),
    'deliveries_late', (SELECT count(*) FROM d WHERE delivered_at IS NULL AND scheduled_date < current_date AND status <> 'annule'),
    'outstanding', (SELECT coalesce(sum(balance),0) FROM public.jsc_invoices
        WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id) AND status <> 'paye'),
    'capacity_used_pct', (
      SELECT CASE WHEN t.total > 0 THEN round(100.0 * b.busy / t.total, 2) ELSE 0 END
      FROM (SELECT count(*)::numeric total FROM public.jsc_trucks
            WHERE archived_at IS NULL AND is_active AND (_company_id IS NULL OR company_id = _company_id)) t,
           (SELECT count(DISTINCT truck_id)::numeric busy FROM public.jsc_deliveries
            WHERE archived_at IS NULL AND truck_id IS NOT NULL AND scheduled_date = current_date
              AND (_company_id IS NULL OR company_id = _company_id)) b),
    'ai_decisions_7d', (SELECT count(*) FROM public.jsc_decisions WHERE created_at >= now() - interval '7 days'),
    'ai_savings', (SELECT coalesce(sum(estimated_saving),0) FROM public.jsc_intel_optimizations WHERE status = 'applied'),
    'ai_pending', (SELECT count(*) FROM public.jsc_intel_optimizations WHERE status = 'pending'),
    'satisfaction_pct', (
      SELECT CASE WHEN count(*) > 0 THEN round(avg(rating) * 20, 1) ELSE NULL END
      FROM public.jsc_marketplace_reviews)
  ) INTO v;
  RETURN v;
END $$;

-- Jumeau numérique
CREATE OR REPLACE FUNCTION public.jsc_orch_twin(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'companies', (SELECT count(*) FROM jsc_companies WHERE archived_at IS NULL),
      'suppliers', (SELECT count(*) FROM jsc_suppliers WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)),
      'carriers', (SELECT count(*) FROM jsc_marketplace_profiles WHERE profile_type = 'transporteur'),
      'trucks', (SELECT count(*) FROM jsc_trucks WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)),
      'drivers', (SELECT count(*) FROM jsc_drivers WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)),
      'clients', (SELECT count(*) FROM jsc_clients WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)),
      'materials', (SELECT count(*) FROM jsc_materials WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)),
      'pickup_locations', (SELECT count(*) FROM jsc_pickup_locations WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)),
      'projects', (SELECT count(*) FROM jsc_projects WHERE archived_at IS NULL AND (_company_id IS NULL OR company_id = _company_id)),
      'orders_open', (SELECT count(*) FROM jsc_orders WHERE archived_at IS NULL AND status NOT IN ('termine','annule','facture','paye') AND (_company_id IS NULL OR company_id = _company_id)),
      'deliveries_today', (SELECT count(*) FROM jsc_deliveries WHERE archived_at IS NULL AND scheduled_date = current_date AND (_company_id IS NULL OR company_id = _company_id)),
      'incidents_open', (SELECT count(*) FROM jsc_incidents WHERE archived_at IS NULL AND status <> 'resolu' AND (_company_id IS NULL OR company_id = _company_id))
    ),
    'trucks', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT t.id, t.name, t.truck_type, t.capacity_tonnes, t.availability, t.operational_status,
               (SELECT count(*) FROM jsc_deliveries d WHERE d.truck_id = t.id AND d.scheduled_date = current_date AND d.archived_at IS NULL) AS today_deliveries
        FROM jsc_trucks t WHERE t.archived_at IS NULL AND t.is_active
          AND (_company_id IS NULL OR t.company_id = _company_id)
        ORDER BY t.sort_order, t.name LIMIT 200) x),
    'drivers', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT dr.id, (dr.first_name || ' ' || dr.last_name) AS name, dr.status,
               (SELECT count(*) FROM jsc_deliveries d WHERE d.driver_id = dr.id AND d.scheduled_date = current_date AND d.archived_at IS NULL) AS today_deliveries
        FROM jsc_drivers dr WHERE dr.archived_at IS NULL AND dr.is_active
          AND (_company_id IS NULL OR dr.company_id = _company_id)
        ORDER BY dr.last_name LIMIT 200) x),
    'suppliers', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT s.id, s.name, s.city,
               (SELECT count(*) FROM jsc_orders o WHERE o.supplier_id = s.id AND o.archived_at IS NULL AND o.created_at >= now() - interval '90 days') AS orders_90d
        FROM jsc_suppliers s WHERE s.archived_at IS NULL AND s.is_active
          AND (_company_id IS NULL OR s.company_id = _company_id)
        ORDER BY s.name LIMIT 200) x),
    'materials', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT m.id, m.name, m.unit, m.availability, m.selling_price,
               (SELECT count(*) FROM jsc_orders o WHERE o.material_id = m.id AND o.archived_at IS NULL AND o.created_at >= now() - interval '90 days') AS orders_90d
        FROM jsc_materials m WHERE m.archived_at IS NULL AND m.is_active
          AND (_company_id IS NULL OR m.company_id = _company_id)
        ORDER BY m.name LIMIT 300) x),
    'deliveries', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT d.id, d.delivery_number, d.status, d.city, d.scheduled_date, d.latitude, d.longitude
        FROM jsc_deliveries d WHERE d.archived_at IS NULL
          AND d.scheduled_date BETWEEN current_date - 1 AND current_date + 7
          AND (_company_id IS NULL OR d.company_id = _company_id)
        ORDER BY d.scheduled_date LIMIT 500) x)
  ) INTO v;
  RETURN v;
END $$;

-- Carte opérationnelle
CREATE OR REPLACE FUNCTION public.jsc_orch_map(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT jsonb_build_object(
    'generated_at', now(),
    'deliveries', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT d.id, d.delivery_number, d.status, d.city, d.scheduled_date, d.latitude, d.longitude,
             d.truck_id, t.name AS truck_name
      FROM jsc_deliveries d LEFT JOIN jsc_trucks t ON t.id = d.truck_id
      WHERE d.archived_at IS NULL AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
        AND d.scheduled_date BETWEEN current_date - 1 AND current_date + 7
        AND (_company_id IS NULL OR d.company_id = _company_id) LIMIT 800) x),
    'pickups', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT p.id, p.name, p.city, p.latitude, p.longitude, s.name AS supplier_name
      FROM jsc_pickup_locations p LEFT JOIN jsc_suppliers s ON s.id = p.supplier_id
      WHERE p.archived_at IS NULL AND p.latitude IS NOT NULL
        AND (_company_id IS NULL OR p.company_id = _company_id) LIMIT 400) x),
    'suppliers', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT s.id, s.name, s.city, s.latitude, s.longitude FROM jsc_suppliers s
      WHERE s.archived_at IS NULL AND s.latitude IS NOT NULL
        AND (_company_id IS NULL OR s.company_id = _company_id) LIMIT 400) x),
    'clients', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT c.id, c.name, c.city, c.latitude, c.longitude FROM jsc_clients c
      WHERE c.archived_at IS NULL AND c.latitude IS NOT NULL
        AND (_company_id IS NULL OR c.company_id = _company_id) LIMIT 500) x),
    'projects', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT p.id, p.name, p.city, p.latitude, p.longitude, p.status FROM jsc_projects p
      WHERE p.archived_at IS NULL AND p.latitude IS NOT NULL
        AND (_company_id IS NULL OR p.company_id = _company_id) LIMIT 400) x),
    'incidents', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT i.id, i.incident_type, i.severity, i.status, d.city, d.latitude, d.longitude
      FROM jsc_incidents i JOIN jsc_deliveries d ON d.id = i.delivery_id
      WHERE i.archived_at IS NULL AND d.latitude IS NOT NULL
        AND (_company_id IS NULL OR i.company_id = _company_id) LIMIT 200) x),
    'city_stats', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT f.city, count(*) AS orders, round(sum(f.total),2) AS revenue,
             round(sum(f.net_margin),2) AS margin,
             CASE WHEN sum(f.total) > 0 THEN round(100*sum(f.net_margin)/sum(f.total),1) ELSE 0 END AS margin_pct
      FROM public.jsc_bi_order_facts(_company_id, current_date - 180, current_date) f
      WHERE f.city IS NOT NULL GROUP BY f.city ORDER BY sum(f.total) DESC LIMIT 40) x),
    'shortage_cities', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT r.city, count(*) AS requests
      FROM jsc_requests r
      WHERE r.archived_at IS NULL AND r.city IS NOT NULL AND r.created_at >= now() - interval '90 days'
        AND NOT EXISTS (SELECT 1 FROM jsc_pickup_locations p WHERE p.city = r.city AND p.archived_at IS NULL)
        AND (_company_id IS NULL OR r.company_id = _company_id)
      GROUP BY r.city ORDER BY count(*) DESC LIMIT 20) x)
  ) INTO v;
  RETURN v;
END $$;

-- Détection de risques
CREATE OR REPLACE FUNCTION public.jsc_orch_detect_risks(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new int := 0; rec record; v_total numeric;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  CREATE TEMP TABLE _f ON COMMIT DROP AS
    SELECT * FROM public.jsc_bi_order_facts(_company_id, current_date - 180, current_date);
  SELECT coalesce(sum(total),0) INTO v_total FROM _f;

  -- Dépendance fournisseur (> 50 % du volume d'affaires)
  IF v_total > 0 THEN
    FOR rec IN
      SELECT supplier_id, supplier_name, sum(total) AS rev, round(100*sum(total)/v_total,1) AS share
      FROM _f WHERE supplier_id IS NOT NULL GROUP BY 1,2 HAVING 100*sum(total)/v_total >= 50
    LOOP
      INSERT INTO public.jsc_risks (company_id, code, category, title, detail, level, score, entity_type, entity_id, metrics)
      VALUES (_company_id, 'supplier_dependency', 'approvisionnement',
        'Dépendance au fournisseur ' || coalesce(rec.supplier_name,'inconnu'),
        format('%s %% du chiffre d''affaires des 180 derniers jours provient de ce fournisseur.', rec.share),
        CASE WHEN rec.share >= 75 THEN 'critical' WHEN rec.share >= 60 THEN 'high' ELSE 'medium' END,
        rec.share, 'supplier', rec.supplier_id,
        jsonb_build_object('share_pct', rec.share, 'revenue', rec.rev))
      ON CONFLICT DO NOTHING;
      v_new := v_new + 1;
    END LOOP;

    -- Dépendance client
    FOR rec IN
      SELECT client_id, client_name, sum(total) AS rev, round(100*sum(total)/v_total,1) AS share
      FROM _f WHERE client_id IS NOT NULL GROUP BY 1,2 HAVING 100*sum(total)/v_total >= 40
    LOOP
      INSERT INTO public.jsc_risks (company_id, code, category, title, detail, level, score, entity_type, entity_id, metrics)
      VALUES (_company_id, 'client_concentration', 'commercial',
        'Concentration sur le client ' || coalesce(rec.client_name,'inconnu'),
        format('%s %% du chiffre d''affaires dépend de ce client.', rec.share),
        CASE WHEN rec.share >= 60 THEN 'high' ELSE 'medium' END,
        rec.share, 'client', rec.client_id, jsonb_build_object('share_pct', rec.share, 'revenue', rec.rev))
      ON CONFLICT DO NOTHING;
      v_new := v_new + 1;
    END LOOP;

    -- Baisse de marge globale
    FOR rec IN
      SELECT round(100*sum(net_margin)/nullif(sum(total),0),1) AS margin_pct FROM _f
      WHERE occurred_on >= current_date - 30
    LOOP
      IF rec.margin_pct IS NOT NULL AND rec.margin_pct < 15 THEN
        INSERT INTO public.jsc_risks (company_id, code, category, title, detail, level, score, metrics)
        VALUES (_company_id, 'margin_drop', 'financier', 'Marge nette faible sur 30 jours',
          format('La marge nette moyenne est de %s %% sur les 30 derniers jours.', rec.margin_pct),
          CASE WHEN rec.margin_pct < 5 THEN 'critical' WHEN rec.margin_pct < 10 THEN 'high' ELSE 'medium' END,
          100 - rec.margin_pct, jsonb_build_object('margin_pct', rec.margin_pct))
        ON CONFLICT DO NOTHING;
        v_new := v_new + 1;
      END IF;
    END LOOP;
  END IF;

  -- Surcharge transporteur / camion
  FOR rec IN
    SELECT d.truck_id, t.name, count(*) AS trips
    FROM jsc_deliveries d JOIN jsc_trucks t ON t.id = d.truck_id
    WHERE d.archived_at IS NULL AND d.scheduled_date BETWEEN current_date AND current_date + 6
      AND (_company_id IS NULL OR d.company_id = _company_id)
    GROUP BY 1,2 HAVING count(*) > 25
  LOOP
    INSERT INTO public.jsc_risks (company_id, code, category, title, detail, level, score, entity_type, entity_id, metrics)
    VALUES (_company_id, 'carrier_overload', 'operation', 'Surcharge du camion ' || rec.name,
      format('%s livraisons planifiées sur les 7 prochains jours.', rec.trips),
      CASE WHEN rec.trips > 40 THEN 'high' ELSE 'medium' END, rec.trips, 'truck', rec.truck_id,
      jsonb_build_object('trips_7d', rec.trips))
    ON CONFLICT DO NOTHING;
    v_new := v_new + 1;
  END LOOP;

  -- Retards critiques
  FOR rec IN
    SELECT count(*) AS late FROM jsc_deliveries
    WHERE archived_at IS NULL AND delivered_at IS NULL AND status <> 'annule'
      AND scheduled_date < current_date AND (_company_id IS NULL OR company_id = _company_id)
  LOOP
    IF rec.late > 0 THEN
      INSERT INTO public.jsc_risks (company_id, code, category, title, detail, level, score, metrics)
      VALUES (_company_id, 'critical_delays', 'operation', 'Livraisons en retard',
        format('%s livraisons planifiées ne sont toujours pas livrées.', rec.late),
        CASE WHEN rec.late > 20 THEN 'critical' WHEN rec.late > 5 THEN 'high' ELSE 'medium' END,
        rec.late, jsonb_build_object('late', rec.late))
      ON CONFLICT DO NOTHING;
      v_new := v_new + 1;
    END IF;
  END LOOP;

  -- Manque de capacité (livraisons du jour sans camion assigné)
  FOR rec IN
    SELECT count(*) AS unassigned FROM jsc_deliveries
    WHERE archived_at IS NULL AND truck_id IS NULL AND status <> 'annule'
      AND scheduled_date BETWEEN current_date AND current_date + 2
      AND (_company_id IS NULL OR company_id = _company_id)
  LOOP
    IF rec.unassigned > 0 THEN
      INSERT INTO public.jsc_risks (company_id, code, category, title, detail, level, score, metrics)
      VALUES (_company_id, 'capacity_gap', 'capacite', 'Capacité de transport insuffisante',
        format('%s livraisons des 3 prochains jours n''ont aucun camion assigné.', rec.unassigned),
        CASE WHEN rec.unassigned > 10 THEN 'high' ELSE 'medium' END, rec.unassigned,
        jsonb_build_object('unassigned', rec.unassigned))
      ON CONFLICT DO NOTHING;
      v_new := v_new + 1;
    END IF;
  END LOOP;

  -- Baisse des ventes (30 j vs 30 j précédents)
  FOR rec IN
    SELECT
      (SELECT coalesce(sum(total),0) FROM _f WHERE occurred_on >= current_date - 30) AS cur,
      (SELECT coalesce(sum(total),0) FROM _f WHERE occurred_on >= current_date - 60 AND occurred_on < current_date - 30) AS prev
  LOOP
    IF rec.prev > 0 AND rec.cur < rec.prev * 0.8 THEN
      INSERT INTO public.jsc_risks (company_id, code, category, title, detail, level, score, metrics)
      VALUES (_company_id, 'sales_drop', 'commercial', 'Baisse des ventes',
        format('Ventes en baisse de %s %% sur 30 jours.', round(100*(1 - rec.cur/rec.prev))),
        CASE WHEN rec.cur < rec.prev * 0.6 THEN 'high' ELSE 'medium' END,
        round(100*(1 - rec.cur/rec.prev)), jsonb_build_object('current', rec.cur, 'previous', rec.prev))
      ON CONFLICT DO NOTHING;
      v_new := v_new + 1;
    END IF;
  END LOOP;

  PERFORM public.jsc_emit_event(_company_id, 'risk_scan', 'Analyse des risques exécutée', 'system', NULL, 'info',
    jsonb_build_object('detected', v_new));
  RETURN jsonb_build_object('scanned_at', now(), 'detected', v_new,
    'open', (SELECT count(*) FROM public.jsc_risks WHERE status = 'open'));
END $$;

-- Simulateur
CREATE OR REPLACE FUNCTION public.jsc_orch_simulate(
  _company_id uuid, _name text, _scenario_type text, _inputs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b_rev numeric; b_mat numeric; b_tr numeric; b_qty numeric; b_orders int;
  p_rev numeric; p_mat numeric; p_tr numeric; p_qty numeric;
  sell_pct numeric := coalesce((_inputs->>'selling_price_pct')::numeric, 0);
  mat_pct  numeric := coalesce((_inputs->>'material_cost_pct')::numeric, 0);
  tr_pct   numeric := coalesce((_inputs->>'transport_cost_pct')::numeric, 0);
  vol_pct  numeric := coalesce((_inputs->>'volume_pct')::numeric, 0);
  fixed    numeric := coalesce((_inputs->>'fixed_cost')::numeric, 0);
  excl     uuid := nullif(_inputs->>'exclude_supplier_id','')::uuid;
  elasticity numeric := coalesce((_inputs->>'price_elasticity')::numeric, -0.5);
  baseline jsonb; projection jsonb; delta jsonb; v_id uuid; v_qty_pct numeric;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT coalesce(sum(total),0), coalesce(sum(material_cost),0), coalesce(sum(transport_cost),0),
         coalesce(sum(quantity),0), count(*)
    INTO b_rev, b_mat, b_tr, b_qty, b_orders
  FROM public.jsc_bi_order_facts(_company_id, current_date - 180, current_date)
  WHERE excl IS NULL OR supplier_id IS DISTINCT FROM excl;

  -- élasticité : une hausse de prix réduit le volume, une baisse l'augmente
  v_qty_pct := vol_pct + (sell_pct * elasticity);
  p_qty := b_qty * (1 + v_qty_pct/100);
  p_rev := b_rev * (1 + sell_pct/100) * (1 + v_qty_pct/100);
  p_mat := b_mat * (1 + mat_pct/100) * (1 + v_qty_pct/100);
  p_tr  := b_tr  * (1 + tr_pct/100)  * (1 + v_qty_pct/100) + fixed;

  baseline := jsonb_build_object('period_days', 180, 'orders', b_orders, 'revenue', round(b_rev,2),
    'material_cost', round(b_mat,2), 'transport_cost', round(b_tr,2), 'quantity', round(b_qty,2),
    'profit', round(b_rev - b_mat - b_tr,2),
    'margin_pct', CASE WHEN b_rev > 0 THEN round(100*(b_rev-b_mat-b_tr)/b_rev,2) ELSE 0 END);
  projection := jsonb_build_object('revenue', round(p_rev,2), 'material_cost', round(p_mat,2),
    'transport_cost', round(p_tr,2), 'quantity', round(p_qty,2),
    'profit', round(p_rev - p_mat - p_tr,2),
    'margin_pct', CASE WHEN p_rev > 0 THEN round(100*(p_rev-p_mat-p_tr)/p_rev,2) ELSE 0 END,
    'volume_change_pct', round(v_qty_pct,2));
  delta := jsonb_build_object(
    'revenue', round(p_rev - b_rev,2),
    'profit', round((p_rev-p_mat-p_tr) - (b_rev-b_mat-b_tr),2),
    'revenue_pct', CASE WHEN b_rev > 0 THEN round(100*(p_rev-b_rev)/b_rev,2) ELSE 0 END,
    'profit_pct', CASE WHEN (b_rev-b_mat-b_tr) <> 0 THEN round(100*((p_rev-p_mat-p_tr)-(b_rev-b_mat-b_tr))/abs(b_rev-b_mat-b_tr),2) ELSE 0 END);

  INSERT INTO public.jsc_simulations (company_id, name, scenario_type, inputs, baseline, projection, delta, created_by)
  VALUES (_company_id, _name, _scenario_type, _inputs, baseline, projection, delta, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.jsc_emit_event(_company_id, 'simulation', _name, 'simulation', v_id, 'info', delta);
  RETURN jsonb_build_object('id', v_id, 'baseline', baseline, 'projection', projection, 'delta', delta);
END $$;

-- Évaluation des règles configurables
CREATE OR REPLACE FUNCTION public.jsc_orch_rules_eval(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k jsonb; r record; val numeric; fired int := 0; hit boolean; results jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  k := public.jsc_orch_kpis(_company_id);

  FOR r IN SELECT * FROM public.jsc_orch_rules
           WHERE is_active AND archived_at IS NULL
             AND (_company_id IS NULL OR company_id = _company_id OR company_id IS NULL)
           ORDER BY sort_order
  LOOP
    val := nullif(k->>r.metric, '')::numeric;
    CONTINUE WHEN val IS NULL;
    hit := CASE r.operator
      WHEN 'lt' THEN val < r.threshold
      WHEN 'lte' THEN val <= r.threshold
      WHEN 'gt' THEN val > r.threshold
      WHEN 'gte' THEN val >= r.threshold
      WHEN 'eq' THEN val = r.threshold
      WHEN 'neq' THEN val <> r.threshold
      ELSE false END;

    IF hit AND (r.last_triggered_at IS NULL OR r.last_triggered_at < now() - make_interval(mins => r.cooldown_minutes)) THEN
      PERFORM public.jsc_emit_event(coalesce(r.company_id, _company_id), 'rule_triggered', r.label,
        'orch_rule', r.id, r.severity,
        jsonb_build_object('metric', r.metric, 'value', val, 'operator', r.operator, 'threshold', r.threshold,
                           'action', r.action_type, 'config', r.action_config));
      IF r.action_type IN ('alert','notify') THEN
        PERFORM public.jsc_notify(coalesce(r.company_id, _company_id), 'orch_rule', r.label,
          coalesce(r.action_config->>'message',
            format('%s = %s (seuil %s)', r.metric, val, r.threshold)), 'internal');
      END IF;
      UPDATE public.jsc_orch_rules
        SET trigger_count = trigger_count + 1, last_triggered_at = now(), last_value = val
        WHERE id = r.id;
      fired := fired + 1;
      results := results || jsonb_build_object('code', r.code, 'label', r.label, 'value', val);
    ELSE
      UPDATE public.jsc_orch_rules SET last_value = val WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('evaluated_at', now(), 'fired', fired, 'rules', results);
END $$;

-- Centre de contrôle
CREATE OR REPLACE FUNCTION public.jsc_orch_control(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE k jsonb; v_health numeric; v_risks jsonb;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  k := public.jsc_orch_kpis(_company_id);

  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE status = 'open'),
    'critical', count(*) FILTER (WHERE status = 'open' AND level = 'critical'),
    'high', count(*) FILTER (WHERE status = 'open' AND level = 'high')
  ) INTO v_risks FROM public.jsc_risks
  WHERE (_company_id IS NULL OR company_id = _company_id);

  v_health := greatest(0, least(100,
    100
    - coalesce((v_risks->>'critical')::numeric,0) * 15
    - coalesce((v_risks->>'high')::numeric,0) * 7
    - least(20, coalesce((k->>'deliveries_late')::numeric,0))
    - CASE WHEN coalesce((k->>'avg_margin_pct')::numeric,0) < 15
        THEN (15 - coalesce((k->>'avg_margin_pct')::numeric,0)) ELSE 0 END));

  RETURN jsonb_build_object(
    'generated_at', now(),
    'health_score', round(v_health),
    'kpis', k,
    'risks', v_risks,
    'rules', (SELECT jsonb_build_object(
        'active', count(*) FILTER (WHERE is_active AND archived_at IS NULL),
        'fired_24h', count(*) FILTER (WHERE last_triggered_at >= now() - interval '24 hours'))
      FROM public.jsc_orch_rules),
    'events_24h', (SELECT count(*) FROM public.jsc_events WHERE created_at >= now() - interval '24 hours'),
    'pending_decisions', (SELECT count(*) FROM public.jsc_decisions WHERE status = 'pending'),
    'strategies_pending', (SELECT count(*) FROM public.jsc_strategies WHERE status = 'proposed'),
    'recent_events', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT id, event_type, label, severity, entity_type, created_at
        FROM public.jsc_events
        WHERE (_company_id IS NULL OR company_id = _company_id OR company_id IS NULL)
        ORDER BY created_at DESC LIMIT 40) x),
    'top_risks', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT id, code, category, title, detail, level, score, entity_type, entity_id, metrics, detected_at
        FROM public.jsc_risks WHERE status = 'open'
          AND (_company_id IS NULL OR company_id = _company_id)
        ORDER BY CASE level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, score DESC
        LIMIT 30) x)
  );
END $$;

-- Règles par défaut (configurables et modifiables)
INSERT INTO public.jsc_orch_rules (company_id, code, label, description, metric, operator, threshold, action_type, severity, sort_order)
VALUES
  (NULL, 'margin_low', 'Marge moyenne sous 15 %', 'Alerte quand la marge nette moyenne sur 90 jours passe sous le seuil.', 'avg_margin_pct', 'lt', 15, 'alert', 'warning', 10),
  (NULL, 'late_deliveries', 'Livraisons en retard', 'Alerte quand des livraisons planifiées ne sont pas livrées.', 'deliveries_late', 'gt', 0, 'alert', 'warning', 20),
  (NULL, 'capacity_saturated', 'Capacité saturée', 'Alerte quand plus de 90 % des camions sont mobilisés aujourd''hui.', 'capacity_used_pct', 'gte', 90, 'alert', 'warning', 30),
  (NULL, 'receivables_high', 'Comptes à recevoir élevés', 'Alerte quand le solde impayé dépasse le seuil configuré.', 'outstanding', 'gt', 25000, 'alert', 'critical', 40);