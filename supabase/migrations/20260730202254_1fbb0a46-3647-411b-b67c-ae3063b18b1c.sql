
-- ============ Tables ============
CREATE TABLE IF NOT EXISTS public.jsc_bi_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  metric text NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'month',
  starts_on date NOT NULL DEFAULT date_trunc('month', now())::date,
  ends_on date NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_bi_goals TO authenticated;
GRANT ALL ON public.jsc_bi_goals TO service_role;
ALTER TABLE public.jsc_bi_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage BI goals" ON public.jsc_bi_goals;
CREATE POLICY "Admins manage BI goals" ON public.jsc_bi_goals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.jsc_bi_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mon tableau de bord',
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_bi_layouts TO authenticated;
GRANT ALL ON public.jsc_bi_layouts TO service_role;
ALTER TABLE public.jsc_bi_layouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage own BI layouts" ON public.jsc_bi_layouts;
CREATE POLICY "Admins manage own BI layouts" ON public.jsc_bi_layouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());

-- ============ Faits de commande (base de tous les calculs) ============
CREATE OR REPLACE FUNCTION public.jsc_bi_order_facts(_company_id uuid, _from date, _to date)
RETURNS TABLE (
  order_id uuid, occurred_on date, status text,
  client_id uuid, client_name text,
  material_id uuid, material_name text, category_name text,
  supplier_id uuid, supplier_name text,
  carrier_id uuid, carrier_name text, truck_id uuid,
  project_id uuid, city text, region text,
  quantity numeric, subtotal numeric, total numeric,
  material_cost numeric, transport_cost numeric,
  gross_margin numeric, net_margin numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    COALESCE(o.completed_at, o.created_at)::date,
    o.status,
    o.client_id, c.name,
    o.material_id, m.name, COALESCE(mc.name, m.category),
    o.supplier_id, s.name,
    o.carrier_id, car.name, o.truck_id,
    o.project_id,
    COALESCE(NULLIF(r.city, ''), p.city, c.city),
    COALESCE(z.region, 'Non classé'),
    COALESCE(o.delivered_quantity, r.quantity, 0),
    COALESCE(o.subtotal, 0),
    COALESCE(o.total, 0),
    COALESCE(m.purchase_price, 0) * COALESCE(o.delivered_quantity, r.quantity, 0),
    COALESCE(
      (SELECT SUM(COALESCE(d.estimated_cost, 0)) FROM jsc_deliveries d
        WHERE d.order_id = o.id AND d.archived_at IS NULL AND d.cancelled_at IS NULL),
      (SELECT e.transport_cost FROM jsc_estimates e WHERE e.request_id = o.request_id ORDER BY e.is_selected DESC NULLS LAST, e.created_at DESC LIMIT 1),
      0),
    COALESCE(o.subtotal, 0) - COALESCE(m.purchase_price, 0) * COALESCE(o.delivered_quantity, r.quantity, 0),
    COALESCE(o.subtotal, 0)
      - COALESCE(m.purchase_price, 0) * COALESCE(o.delivered_quantity, r.quantity, 0)
      - COALESCE(
          (SELECT SUM(COALESCE(d.estimated_cost, 0)) FROM jsc_deliveries d
            WHERE d.order_id = o.id AND d.archived_at IS NULL AND d.cancelled_at IS NULL),
          (SELECT e.transport_cost FROM jsc_estimates e WHERE e.request_id = o.request_id ORDER BY e.is_selected DESC NULLS LAST, e.created_at DESC LIMIT 1),
          0)
  FROM jsc_orders o
  LEFT JOIN jsc_clients c ON c.id = o.client_id
  LEFT JOIN jsc_materials m ON m.id = o.material_id
  LEFT JOIN jsc_material_categories mc ON mc.id = m.category_id
  LEFT JOIN jsc_suppliers s ON s.id = o.supplier_id
  LEFT JOIN jsc_companies car ON car.id = o.carrier_id
  LEFT JOIN jsc_requests r ON r.id = o.request_id
  LEFT JOIN jsc_projects p ON p.id = o.project_id
  LEFT JOIN jsc_zones z ON z.id = r.zone_id
  WHERE o.archived_at IS NULL
    AND o.status <> 'annulee'
    AND (_company_id IS NULL OR o.company_id = _company_id)
    AND COALESCE(o.completed_at, o.created_at)::date BETWEEN _from AND _to;
$$;
REVOKE ALL ON FUNCTION public.jsc_bi_order_facts(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_bi_order_facts(uuid, date, date) TO authenticated, service_role;

-- ============ Tableau de bord exécutif ============
CREATE OR REPLACE FUNCTION public.jsc_bi_overview(_company_id uuid DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f date := COALESCE(_from, date_trunc('year', now())::date);
  t date := COALESCE(_to, now()::date);
  span int := GREATEST((t - f) + 1, 1);
  pf date := f - span;
  pt date := f - 1;
  res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', f, 'to', t, 'previous_from', pf, 'previous_to', pt),
    'revenue', jsonb_build_object(
      'today', (SELECT COALESCE(SUM(total),0) FROM jsc_bi_order_facts(_company_id, now()::date, now()::date)),
      'week',  (SELECT COALESCE(SUM(total),0) FROM jsc_bi_order_facts(_company_id, date_trunc('week', now())::date, now()::date)),
      'month', (SELECT COALESCE(SUM(total),0) FROM jsc_bi_order_facts(_company_id, date_trunc('month', now())::date, now()::date)),
      'year',  (SELECT COALESCE(SUM(total),0) FROM jsc_bi_order_facts(_company_id, date_trunc('year', now())::date, now()::date)),
      'period', (SELECT COALESCE(SUM(total),0) FROM jsc_bi_order_facts(_company_id, f, t)),
      'previous', (SELECT COALESCE(SUM(total),0) FROM jsc_bi_order_facts(_company_id, pf, pt))
    ),
    'counts', jsonb_build_object(
      'requests', (SELECT COUNT(*) FROM jsc_requests x WHERE x.archived_at IS NULL AND (_company_id IS NULL OR x.company_id=_company_id) AND x.created_at::date BETWEEN f AND t),
      'requests_previous', (SELECT COUNT(*) FROM jsc_requests x WHERE x.archived_at IS NULL AND (_company_id IS NULL OR x.company_id=_company_id) AND x.created_at::date BETWEEN pf AND pt),
      'quotes', (SELECT COUNT(*) FROM jsc_quotes x WHERE x.archived_at IS NULL AND (_company_id IS NULL OR x.company_id=_company_id) AND x.created_at::date BETWEEN f AND t),
      'quotes_accepted', (SELECT COUNT(*) FROM jsc_quotes x WHERE x.archived_at IS NULL AND (_company_id IS NULL OR x.company_id=_company_id) AND x.accepted_at IS NOT NULL AND x.accepted_at::date BETWEEN f AND t),
      'orders', (SELECT COUNT(*) FROM jsc_bi_order_facts(_company_id, f, t)),
      'orders_previous', (SELECT COUNT(*) FROM jsc_bi_order_facts(_company_id, pf, pt)),
      'deliveries', (SELECT COUNT(*) FROM jsc_deliveries d WHERE d.archived_at IS NULL AND (_company_id IS NULL OR d.company_id=_company_id) AND COALESCE(d.delivered_at::date, d.scheduled_date) BETWEEN f AND t),
      'new_clients', (SELECT COUNT(*) FROM jsc_clients x WHERE x.archived_at IS NULL AND (_company_id IS NULL OR x.company_id=_company_id) AND x.created_at::date BETWEEN f AND t),
      'active_entrepreneurs', (SELECT COUNT(*) FROM entrepreneur_profiles ep WHERE ep.created_at::date <= t)
    ),
    'averages', jsonb_build_object(
      'order_value', (SELECT COALESCE(AVG(total),0) FROM jsc_bi_order_facts(_company_id, f, t)),
      'conversion_pct', (
        SELECT CASE WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * (SELECT COUNT(*) FROM jsc_bi_order_facts(_company_id, f, t)) / COUNT(*), 1) END
        FROM jsc_requests x WHERE x.archived_at IS NULL AND (_company_id IS NULL OR x.company_id=_company_id) AND x.created_at::date BETWEEN f AND t)
    ),
    'profitability', (
      SELECT jsonb_build_object(
        'revenue', COALESCE(SUM(subtotal),0),
        'material_cost', COALESCE(SUM(material_cost),0),
        'transport_cost', COALESCE(SUM(transport_cost),0),
        'gross_margin', COALESCE(SUM(gross_margin),0),
        'net_margin', COALESCE(SUM(net_margin),0),
        'gross_margin_pct', CASE WHEN COALESCE(SUM(subtotal),0)=0 THEN 0 ELSE ROUND(100*SUM(gross_margin)/SUM(subtotal),1) END,
        'net_margin_pct', CASE WHEN COALESCE(SUM(subtotal),0)=0 THEN 0 ELSE ROUND(100*SUM(net_margin)/SUM(subtotal),1) END,
        'profit_per_order', CASE WHEN COUNT(*)=0 THEN 0 ELSE ROUND(SUM(net_margin)/COUNT(*),2) END
      ) FROM jsc_bi_order_facts(_company_id, f, t)),
    'monthly', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x->>'month'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'month', to_char(date_trunc('month', occurred_on), 'YYYY-MM'),
          'revenue', ROUND(SUM(total),2),
          'orders', COUNT(*),
          'net_margin', ROUND(SUM(net_margin),2)
        ) AS x
        FROM jsc_bi_order_facts(_company_id, LEAST(f, (now() - interval '11 months')::date), t)
        GROUP BY date_trunc('month', occurred_on)
      ) q)
  ) INTO res;
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.jsc_bi_overview(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_bi_overview(uuid, date, date) TO authenticated, service_role;

-- ============ Analyses détaillées ============
CREATE OR REPLACE FUNCTION public.jsc_bi_analytics(_company_id uuid DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f date := COALESCE(_from, date_trunc('year', now())::date);
  t date := COALESCE(_to, now()::date);
  span int := GREATEST((t - f) + 1, 1);
  pf date := f - span; pt date := f - 1;
  res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _bi_facts ON COMMIT DROP AS SELECT * FROM jsc_bi_order_facts(NULL, '1900-01-01'::date, '1900-01-01'::date) WITH NO DATA;
  DELETE FROM _bi_facts;
  INSERT INTO _bi_facts SELECT * FROM jsc_bi_order_facts(_company_id, f, t);

  SELECT jsonb_build_object(
    'sales_by_material', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(material_name,'Non spécifié'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'quantity', ROUND(SUM(quantity),2), 'profit', ROUND(SUM(net_margin),2)) x
      FROM _bi_facts GROUP BY material_name) q),
    'sales_by_category', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(category_name,'Non classé'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM _bi_facts GROUP BY category_name) q),
    'sales_by_city', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(NULLIF(city,''),'Non spécifiée'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM _bi_facts GROUP BY city) q),
    'sales_by_region', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(region,'Non classé'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM _bi_facts GROUP BY region) q),
    'sales_by_carrier', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(carrier_name,'Non assigné'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2), 'transport_cost', ROUND(SUM(transport_cost),2)) x
      FROM _bi_facts GROUP BY carrier_name) q),
    'sales_by_supplier', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(supplier_name,'Non assigné'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2), 'purchase_value', ROUND(SUM(material_cost),2)) x
      FROM _bi_facts GROUP BY supplier_name) q),
    'sales_by_client', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(client_name,'Client inconnu'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM _bi_facts GROUP BY client_name) q),
    'profit_by_project', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'profit')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(p.name, 'Sans projet'), 'revenue', ROUND(SUM(bf.total),2), 'profit', ROUND(SUM(bf.net_margin),2), 'orders', COUNT(*)) x
      FROM _bi_facts bf LEFT JOIN jsc_projects p ON p.id = bf.project_id GROUP BY p.name) q),
    'clients', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'lifetime_value')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', COALESCE(c.name, 'Client inconnu'),
        'orders', COUNT(o.id),
        'lifetime_value', ROUND(COALESCE(SUM(o.total),0),2),
        'profit', ROUND(COALESCE(SUM(o.net_margin),0),2),
        'last_order', MAX(o.occurred_on),
        'frequency_days', CASE WHEN COUNT(o.id) < 2 THEN NULL
          ELSE ROUND(((MAX(o.occurred_on) - MIN(o.occurred_on))::numeric / (COUNT(o.id) - 1)), 1) END
      ) x
      FROM jsc_bi_order_facts(_company_id, '1900-01-01'::date, t) o
      LEFT JOIN jsc_clients c ON c.id = o.client_id
      GROUP BY c.id, c.name) q),
    'materials_trend', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', COALESCE(cur.material_name, 'Non spécifié'),
        'revenue', ROUND(SUM(cur.total),2),
        'quantity', ROUND(SUM(cur.quantity),2),
        'profit', ROUND(SUM(cur.net_margin),2),
        'previous_revenue', ROUND(COALESCE((SELECT SUM(pv.total) FROM jsc_bi_order_facts(_company_id, pf, pt) pv WHERE pv.material_name IS NOT DISTINCT FROM cur.material_name),0),2)
      ) x FROM _bi_facts cur GROUP BY cur.material_name) q),
    'carriers', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'deliveries')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', COALESCE(cc.name, 'Non assigné'),
        'deliveries', COUNT(d.id),
        'completed', COUNT(*) FILTER (WHERE d.delivered_at IS NOT NULL),
        'late', COUNT(*) FILTER (WHERE d.delivered_at IS NOT NULL AND d.delivered_at::date > d.scheduled_date),
        'cancelled', COUNT(*) FILTER (WHERE d.cancelled_at IS NOT NULL),
        'avg_minutes', ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.started_at))/60) FILTER (WHERE d.delivered_at IS NOT NULL AND d.started_at IS NOT NULL),0)::numeric,1),
        'cost', ROUND(COALESCE(SUM(d.estimated_cost),0),2)
      ) x
      FROM jsc_deliveries d LEFT JOIN jsc_companies cc ON cc.id = d.carrier_id
      WHERE d.archived_at IS NULL AND (_company_id IS NULL OR d.company_id=_company_id)
        AND COALESCE(d.delivered_at::date, d.scheduled_date, d.created_at::date) BETWEEN f AND t
      GROUP BY cc.name) q),
    'trucks', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'deliveries')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', tr.name, 'status', COALESCE(tr.operational_status, tr.availability, 'inconnu'),
        'deliveries', (SELECT COUNT(*) FROM jsc_deliveries d WHERE d.truck_id = tr.id AND d.archived_at IS NULL
                        AND COALESCE(d.delivered_at::date, d.scheduled_date, d.created_at::date) BETWEEN f AND t)
      ) x FROM jsc_trucks tr WHERE tr.archived_at IS NULL AND (_company_id IS NULL OR tr.company_id=_company_id)) q),
    'suppliers', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'purchase_value')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', s.name,
        'orders', COUNT(bf.order_id),
        'purchase_value', ROUND(COALESCE(SUM(bf.material_cost),0),2),
        'revenue', ROUND(COALESCE(SUM(bf.total),0),2),
        'materials', (SELECT COUNT(*) FROM jsc_materials m2 WHERE m2.archived_at IS NULL AND m2.is_active),
        'incidents', (SELECT COUNT(*) FROM jsc_incidents i JOIN jsc_orders o2 ON o2.id = i.order_id WHERE o2.supplier_id = s.id AND i.archived_at IS NULL)
      ) x
      FROM jsc_suppliers s LEFT JOIN _bi_facts bf ON bf.supplier_id = s.id
      WHERE s.archived_at IS NULL AND (_company_id IS NULL OR s.company_id=_company_id)
      GROUP BY s.id, s.name) q),
    'operations', (
      SELECT jsonb_build_object(
        'avg_request_to_delivery_days', ROUND(COALESCE((
          SELECT AVG(EXTRACT(EPOCH FROM (d.delivered_at - r.created_at))/86400)
          FROM jsc_deliveries d JOIN jsc_orders o ON o.id = d.order_id JOIN jsc_requests r ON r.id = o.request_id
          WHERE d.delivered_at IS NOT NULL AND d.delivered_at::date BETWEEN f AND t AND (_company_id IS NULL OR d.company_id=_company_id)),0)::numeric,1),
        'avg_prep_hours', ROUND(COALESCE((
          SELECT AVG(EXTRACT(EPOCH FROM (d.started_at - d.created_at))/3600) FROM jsc_deliveries d
          WHERE d.started_at IS NOT NULL AND d.started_at::date BETWEEN f AND t AND (_company_id IS NULL OR d.company_id=_company_id)),0)::numeric,1),
        'avg_loading_minutes', ROUND(COALESCE((
          SELECT AVG(EXTRACT(EPOCH FROM (d.loaded_at - d.started_at))/60) FROM jsc_deliveries d
          WHERE d.loaded_at IS NOT NULL AND d.started_at IS NOT NULL AND d.loaded_at::date BETWEEN f AND t AND (_company_id IS NULL OR d.company_id=_company_id)),0)::numeric,1),
        'avg_transport_minutes', ROUND(COALESCE((
          SELECT AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.loaded_at))/60) FROM jsc_deliveries d
          WHERE d.delivered_at IS NOT NULL AND d.loaded_at IS NOT NULL AND d.delivered_at::date BETWEEN f AND t AND (_company_id IS NULL OR d.company_id=_company_id)),0)::numeric,1),
        'incidents', (SELECT COUNT(*) FROM jsc_incidents i WHERE i.archived_at IS NULL AND (_company_id IS NULL OR i.company_id=_company_id) AND i.created_at::date BETWEEN f AND t),
        'incidents_open', (SELECT COUNT(*) FROM jsc_incidents i WHERE i.archived_at IS NULL AND i.resolved_at IS NULL AND (_company_id IS NULL OR i.company_id=_company_id)),
        'cancellations', (SELECT COUNT(*) FROM jsc_deliveries d WHERE d.cancelled_at IS NOT NULL AND d.cancelled_at::date BETWEEN f AND t AND (_company_id IS NULL OR d.company_id=_company_id)),
        'late_deliveries', (SELECT COUNT(*) FROM jsc_deliveries d WHERE d.archived_at IS NULL AND d.scheduled_date IS NOT NULL
          AND ((d.delivered_at IS NOT NULL AND d.delivered_at::date > d.scheduled_date) OR (d.delivered_at IS NULL AND d.cancelled_at IS NULL AND d.scheduled_date < now()::date))
          AND (_company_id IS NULL OR d.company_id=_company_id))
      ))
  ) INTO res;
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.jsc_bi_analytics(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_bi_analytics(uuid, date, date) TO authenticated, service_role;

-- ============ Prévisions, alertes et objectifs ============
CREATE OR REPLACE FUNCTION public.jsc_bi_forecast(_company_id uuid DEFAULT NULL, _months int DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; hist jsonb; avg3 numeric; avg12 numeric; growth numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', mo, 'revenue', rev, 'orders', ord) ORDER BY mo), '[]'::jsonb)
  INTO hist FROM (
    SELECT to_char(date_trunc('month', occurred_on), 'YYYY-MM') mo, ROUND(SUM(total),2) rev, COUNT(*) ord
    FROM jsc_bi_order_facts(_company_id, (date_trunc('month', now()) - make_interval(months => GREATEST(_months,3)))::date, now()::date)
    GROUP BY 1) q;

  SELECT COALESCE(AVG(rev),0) INTO avg3 FROM (
    SELECT SUM(total) rev FROM jsc_bi_order_facts(_company_id, (date_trunc('month', now()) - interval '2 months')::date, now()::date)
    GROUP BY date_trunc('month', occurred_on)) a;
  SELECT COALESCE(AVG(rev),0) INTO avg12 FROM (
    SELECT SUM(total) rev FROM jsc_bi_order_facts(_company_id, (date_trunc('month', now()) - interval '11 months')::date, now()::date)
    GROUP BY date_trunc('month', occurred_on)) b;
  growth := CASE WHEN avg12 = 0 THEN 0 ELSE ROUND(100*(avg3-avg12)/avg12, 1) END;

  res := jsonb_build_object(
    'history', hist,
    'avg_3m', ROUND(avg3,2),
    'avg_12m', ROUND(avg12,2),
    'growth_pct', growth,
    'projection', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', to_char(date_trunc('month', now()) + make_interval(months => g), 'YYYY-MM'),
        'forecast', ROUND(GREATEST(avg3 * POWER(1 + growth/100.0, g), 0), 2)) ORDER BY g), '[]'::jsonb)
      FROM generate_series(1, 6) g),
    'seasonality', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('month_number', mnum, 'label', lbl, 'revenue', rev) ORDER BY mnum), '[]'::jsonb)
      FROM (SELECT EXTRACT(MONTH FROM occurred_on)::int mnum, to_char(occurred_on, 'TMMonth') lbl, ROUND(SUM(total),2) rev
            FROM jsc_bi_order_facts(_company_id, '1900-01-01'::date, now()::date)
            GROUP BY 1,2) s)
  );
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.jsc_bi_forecast(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_bi_forecast(uuid, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jsc_bi_alerts(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE alerts jsonb := '[]'::jsonb; cur numeric; prev numeric; v numeric; r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  SELECT COALESCE(SUM(total),0) INTO cur FROM jsc_bi_order_facts(_company_id, (now() - interval '29 days')::date, now()::date);
  SELECT COALESCE(SUM(total),0) INTO prev FROM jsc_bi_order_facts(_company_id, (now() - interval '59 days')::date, (now() - interval '30 days')::date);
  IF prev > 0 AND cur < prev * 0.8 THEN
    alerts := alerts || jsonb_build_object('level','critical','type','ventes',
      'title','Baisse importante des ventes',
      'detail', 'Chiffre d''affaires 30 j en baisse de ' || ROUND(100*(prev-cur)/prev,1) || ' % par rapport aux 30 jours précédents.');
  END IF;

  SELECT COUNT(*) INTO v FROM jsc_deliveries d WHERE d.archived_at IS NULL AND d.cancelled_at IS NULL
    AND d.delivered_at IS NULL AND d.scheduled_date < now()::date AND (_company_id IS NULL OR d.company_id=_company_id);
  IF v > 0 THEN
    alerts := alerts || jsonb_build_object('level', CASE WHEN v > 5 THEN 'critical' ELSE 'warning' END, 'type','retards',
      'title','Livraisons en retard', 'detail', v || ' livraison(s) planifiée(s) non complétée(s) après la date prévue.');
  END IF;

  FOR r IN SELECT name FROM jsc_suppliers WHERE archived_at IS NULL AND is_active = false AND (_company_id IS NULL OR company_id=_company_id) LIMIT 5 LOOP
    alerts := alerts || jsonb_build_object('level','warning','type','fournisseur','title','Fournisseur indisponible','detail', r.name || ' est marqué inactif.');
  END LOOP;

  SELECT CASE WHEN COALESCE(SUM(subtotal),0)=0 THEN NULL ELSE ROUND(100*SUM(net_margin)/SUM(subtotal),1) END INTO v
  FROM jsc_bi_order_facts(_company_id, (now() - interval '29 days')::date, now()::date);
  IF v IS NOT NULL AND v < 15 THEN
    alerts := alerts || jsonb_build_object('level','critical','type','marge','title','Marge nette trop faible','detail','Marge nette de ' || v || ' % sur les 30 derniers jours (seuil 15 %).');
  END IF;

  FOR r IN
    SELECT tr.name, (SELECT COUNT(*) FROM jsc_deliveries d WHERE d.truck_id = tr.id AND d.archived_at IS NULL AND COALESCE(d.delivered_at::date, d.scheduled_date) > (now() - interval '30 days')::date) AS cnt
    FROM jsc_trucks tr WHERE tr.archived_at IS NULL AND tr.is_active AND (_company_id IS NULL OR tr.company_id=_company_id)
  LOOP
    IF r.cnt = 0 THEN
      alerts := alerts || jsonb_build_object('level','info','type','flotte','title','Camion sous-utilisé','detail', r.name || ' n''a aucune livraison depuis 30 jours.');
    END IF;
  END LOOP;

  FOR r IN
    SELECT c.name, MAX(o.occurred_on) last_order
    FROM jsc_clients c JOIN jsc_bi_order_facts(_company_id, '1900-01-01'::date, now()::date) o ON o.client_id = c.id
    WHERE c.archived_at IS NULL GROUP BY c.id, c.name
    HAVING MAX(o.occurred_on) < (now() - interval '90 days')::date LIMIT 5
  LOOP
    alerts := alerts || jsonb_build_object('level','info','type','client','title','Client inactif','detail', r.name || ' — dernière commande le ' || r.last_order || '.');
  END LOOP;

  FOR r IN SELECT name FROM jsc_materials WHERE archived_at IS NULL AND availability IS NOT NULL
      AND availability <> 'disponible' AND (_company_id IS NULL OR company_id=_company_id) LIMIT 5 LOOP
    alerts := alerts || jsonb_build_object('level','warning','type','materiau','title','Matériau non disponible','detail', r.name || ' n''est pas marqué disponible.');
  END LOOP;

  SELECT COUNT(*) INTO v FROM jsc_incidents i WHERE i.archived_at IS NULL AND i.resolved_at IS NULL AND (_company_id IS NULL OR i.company_id=_company_id);
  IF v > 0 THEN
    alerts := alerts || jsonb_build_object('level','warning','type','incident','title','Incidents non résolus','detail', v || ' incident(s) en attente de résolution.');
  END IF;

  RETURN jsonb_build_object('alerts', alerts, 'generated_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.jsc_bi_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_bi_alerts(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jsc_bi_goal_progress(_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'metric', g.metric, 'target_value', g.target_value,
    'period', g.period, 'starts_on', g.starts_on, 'ends_on', g.ends_on, 'notes', g.notes,
    'current_value', CASE g.metric
      WHEN 'revenue' THEN (SELECT COALESCE(SUM(total),0) FROM jsc_bi_order_facts(g.company_id, g.starts_on, g.ends_on))
      WHEN 'profit' THEN (SELECT COALESCE(SUM(net_margin),0) FROM jsc_bi_order_facts(g.company_id, g.starts_on, g.ends_on))
      WHEN 'orders' THEN (SELECT COUNT(*) FROM jsc_bi_order_facts(g.company_id, g.starts_on, g.ends_on))
      WHEN 'deliveries' THEN (SELECT COUNT(*) FROM jsc_deliveries d WHERE d.archived_at IS NULL AND (g.company_id IS NULL OR d.company_id=g.company_id) AND COALESCE(d.delivered_at::date, d.scheduled_date) BETWEEN g.starts_on AND g.ends_on)
      WHEN 'new_clients' THEN (SELECT COUNT(*) FROM jsc_clients c WHERE c.archived_at IS NULL AND (g.company_id IS NULL OR c.company_id=g.company_id) AND c.created_at::date BETWEEN g.starts_on AND g.ends_on)
      ELSE 0 END
  ) ORDER BY g.created_at DESC), '[]'::jsonb) INTO res
  FROM jsc_bi_goals g
  WHERE g.archived_at IS NULL AND g.is_active
    AND (_company_id IS NULL OR g.company_id IS NULL OR g.company_id = _company_id);
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.jsc_bi_goal_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_bi_goal_progress(uuid) TO authenticated, service_role;
