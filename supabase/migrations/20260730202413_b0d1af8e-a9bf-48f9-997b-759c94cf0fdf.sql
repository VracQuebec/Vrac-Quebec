
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

  WITH facts AS (SELECT * FROM jsc_bi_order_facts(_company_id, f, t)),
       prev AS (SELECT material_name, SUM(total) AS revenue FROM jsc_bi_order_facts(_company_id, pf, pt) GROUP BY material_name),
       lifetime AS (SELECT * FROM jsc_bi_order_facts(_company_id, '1900-01-01'::date, t))
  SELECT jsonb_build_object(
    'sales_by_material', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(material_name,'Non spécifié'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'quantity', ROUND(SUM(quantity),2), 'profit', ROUND(SUM(net_margin),2)) x
      FROM facts GROUP BY material_name) q),
    'sales_by_category', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(category_name,'Non classé'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM facts GROUP BY category_name) q),
    'sales_by_city', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(NULLIF(city,''),'Non spécifiée'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM facts GROUP BY city) q),
    'sales_by_region', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(region,'Non classé'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM facts GROUP BY region) q),
    'sales_by_carrier', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(carrier_name,'Non assigné'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2), 'transport_cost', ROUND(SUM(transport_cost),2)) x
      FROM facts GROUP BY carrier_name) q),
    'sales_by_supplier', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(supplier_name,'Non assigné'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2), 'purchase_value', ROUND(SUM(material_cost),2)) x
      FROM facts GROUP BY supplier_name) q),
    'sales_by_client', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(client_name,'Client inconnu'), 'revenue', ROUND(SUM(total),2), 'orders', COUNT(*), 'profit', ROUND(SUM(net_margin),2)) x
      FROM facts GROUP BY client_name) q),
    'profit_by_project', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'profit')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('name', COALESCE(p.name, 'Sans projet'), 'revenue', ROUND(SUM(bf.total),2), 'profit', ROUND(SUM(bf.net_margin),2), 'orders', COUNT(*)) x
      FROM facts bf LEFT JOIN jsc_projects p ON p.id = bf.project_id GROUP BY p.name) q),
    'clients', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'lifetime_value')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', COALESCE(c.name, 'Client inconnu'),
        'orders', COUNT(o.order_id),
        'lifetime_value', ROUND(COALESCE(SUM(o.total),0),2),
        'profit', ROUND(COALESCE(SUM(o.net_margin),0),2),
        'last_order', MAX(o.occurred_on),
        'frequency_days', CASE WHEN COUNT(o.order_id) < 2 THEN NULL
          ELSE ROUND(((MAX(o.occurred_on) - MIN(o.occurred_on))::numeric / (COUNT(o.order_id) - 1)), 1) END) x
      FROM lifetime o LEFT JOIN jsc_clients c ON c.id = o.client_id GROUP BY c.id, c.name) q),
    'materials_trend', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', COALESCE(cur.material_name, 'Non spécifié'),
        'revenue', ROUND(SUM(cur.total),2),
        'quantity', ROUND(SUM(cur.quantity),2),
        'profit', ROUND(SUM(cur.net_margin),2),
        'previous_revenue', ROUND(COALESCE(MAX(pv.revenue),0),2)) x
      FROM facts cur LEFT JOIN prev pv ON pv.material_name IS NOT DISTINCT FROM cur.material_name
      GROUP BY cur.material_name) q),
    'carriers', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'deliveries')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', COALESCE(cc.name, 'Non assigné'),
        'deliveries', COUNT(d.id),
        'completed', COUNT(*) FILTER (WHERE d.delivered_at IS NOT NULL),
        'late', COUNT(*) FILTER (WHERE d.delivered_at IS NOT NULL AND d.delivered_at::date > d.scheduled_date),
        'cancelled', COUNT(*) FILTER (WHERE d.cancelled_at IS NOT NULL),
        'avg_minutes', ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.started_at))/60) FILTER (WHERE d.delivered_at IS NOT NULL AND d.started_at IS NOT NULL),0)::numeric,1),
        'cost', ROUND(COALESCE(SUM(d.estimated_cost),0),2)) x
      FROM jsc_deliveries d LEFT JOIN jsc_companies cc ON cc.id = d.carrier_id
      WHERE d.archived_at IS NULL AND (_company_id IS NULL OR d.company_id=_company_id)
        AND COALESCE(d.delivered_at::date, d.scheduled_date, d.created_at::date) BETWEEN f AND t
      GROUP BY cc.name) q),
    'trucks', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'deliveries')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', tr.name, 'status', COALESCE(tr.operational_status, tr.availability, 'inconnu'),
        'deliveries', (SELECT COUNT(*) FROM jsc_deliveries d WHERE d.truck_id = tr.id AND d.archived_at IS NULL
                        AND COALESCE(d.delivered_at::date, d.scheduled_date, d.created_at::date) BETWEEN f AND t)) x
      FROM jsc_trucks tr WHERE tr.archived_at IS NULL AND (_company_id IS NULL OR tr.company_id=_company_id)) q),
    'suppliers', (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'purchase_value')::numeric DESC), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'name', s.name,
        'orders', COUNT(bf.order_id),
        'purchase_value', ROUND(COALESCE(SUM(bf.material_cost),0),2),
        'revenue', ROUND(COALESCE(SUM(bf.total),0),2),
        'incidents', (SELECT COUNT(*) FROM jsc_incidents i JOIN jsc_orders o2 ON o2.id = i.order_id WHERE o2.supplier_id = s.id AND i.archived_at IS NULL)) x
      FROM jsc_suppliers s LEFT JOIN facts bf ON bf.supplier_id = s.id
      WHERE s.archived_at IS NULL AND (_company_id IS NULL OR s.company_id=_company_id)
      GROUP BY s.id, s.name) q),
    'operations', jsonb_build_object(
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
        AND (_company_id IS NULL OR d.company_id=_company_id)))
  ) INTO res;
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.jsc_bi_analytics(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_bi_analytics(uuid, date, date) TO authenticated, service_role;
