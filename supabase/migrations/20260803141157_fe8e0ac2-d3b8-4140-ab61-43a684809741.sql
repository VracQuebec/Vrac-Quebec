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
      'carriers', (SELECT count(*) FROM jsc_marketplace_profiles WHERE archived_at IS NULL AND partner_type = 'transporteur'),
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