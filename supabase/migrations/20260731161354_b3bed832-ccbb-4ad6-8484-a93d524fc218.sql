-- Calcul des taxes actives
CREATE OR REPLACE FUNCTION public.jsc_compute_taxes(_company_id uuid, _subtotal numeric, _taxable boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_base numeric := COALESCE(_subtotal, 0);
  v_running numeric := COALESCE(_subtotal, 0);
  v_total numeric := 0;
  v_amount numeric;
  v_lines jsonb := '[]'::jsonb;
  v_ids uuid[] := '{}';
BEGIN
  IF NOT COALESCE(_taxable, true) THEN
    RETURN jsonb_build_object('tax_total', 0, 'lines', v_lines, 'tax_ids', to_jsonb(v_ids));
  END IF;

  FOR r IN
    SELECT id, name, code, rate_percent, compound
      FROM public.jsc_taxes
     WHERE is_active AND archived_at IS NULL
       AND (company_id = _company_id OR _company_id IS NULL)
     ORDER BY apply_order, code
  LOOP
    v_amount := round((CASE WHEN r.compound THEN v_running ELSE v_base END) * r.rate_percent / 100.0, 2);
    v_total := v_total + v_amount;
    v_running := v_running + v_amount;
    v_ids := v_ids || r.id;
    v_lines := v_lines || jsonb_build_object(
      'tax_id', r.id, 'code', r.code, 'name', r.name,
      'rate_percent', r.rate_percent, 'amount', v_amount
    );
  END LOOP;

  RETURN jsonb_build_object('tax_total', round(v_total, 2), 'lines', v_lines, 'tax_ids', to_jsonb(v_ids));
END;
$$;

-- Sélection d'une estimation
CREATE OR REPLACE FUNCTION public.jsc_select_estimate(_estimate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_request uuid;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT request_id INTO v_request FROM public.jsc_estimates WHERE id = _estimate_id;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Estimation introuvable'; END IF;

  UPDATE public.jsc_estimates SET is_selected = false
   WHERE request_id = v_request AND id <> _estimate_id AND is_selected;
  UPDATE public.jsc_estimates SET is_selected = true WHERE id = _estimate_id;
  RETURN _estimate_id;
END;
$$;

-- Estimation -> Soumission
CREATE OR REPLACE FUNCTION public.jsc_convert_estimate_to_quote(_estimate_id uuid, _valid_days integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
  req record;
  v_existing uuid;
  v_quote uuid;
  v_taxes jsonb;
  v_subtotal numeric;
  v_days integer;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO e FROM public.jsc_estimates WHERE id = _estimate_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Estimation introuvable'; END IF;
  SELECT * INTO req FROM public.jsc_requests WHERE id = e.request_id;

  SELECT id INTO v_existing FROM public.jsc_quotes
   WHERE estimate_id = _estimate_id AND archived_at IS NULL LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  PERFORM public.jsc_select_estimate(_estimate_id);

  v_subtotal := COALESCE(e.subtotal, COALESCE(e.material_cost,0) + COALESCE(e.transport_cost,0) + COALESCE(e.surcharges,0) + COALESCE(e.margin,0));
  v_taxes := public.jsc_compute_taxes(e.company_id, v_subtotal, true);

  SELECT COALESCE(NULLIF(value,'')::int, 30) INTO v_days FROM public.jsc_settings
   WHERE key = 'quote_validity_days' AND (company_id = e.company_id OR company_id IS NULL)
   ORDER BY company_id NULLS LAST LIMIT 1;
  v_days := COALESCE(_valid_days, v_days, 30);

  INSERT INTO public.jsc_quotes (
    company_id, request_id, estimate_id, client_id, status, valid_until,
    subtotal, tax_total, total, currency, public_payload, created_by
  ) VALUES (
    e.company_id, e.request_id, e.id, req.client_id, 'brouillon',
    (current_date + v_days),
    round(v_subtotal, 2),
    (v_taxes ->> 'tax_total')::numeric,
    round(v_subtotal + (v_taxes ->> 'tax_total')::numeric, 2),
    e.currency,
    jsonb_build_object(
      'estimate_number', e.estimate_number,
      'request_number', req.request_number,
      'material_id', e.material_id,
      'quantity', req.quantity,
      'quantity_unit', req.quantity_unit,
      'trips', e.trips,
      'delivery_address', req.delivery_address,
      'city', req.city,
      'taxes', v_taxes -> 'lines'
    ),
    auth.uid()
  ) RETURNING id INTO v_quote;

  UPDATE public.jsc_requests SET status = 'soumission_envoyee'
   WHERE id = e.request_id AND status IN ('nouvelle', 'en_analyse');

  PERFORM public.jsc_log_event('convert_estimate_to_quote', 'jsc_quotes', v_quote,
    e.estimate_number, jsonb_build_object('estimate_id', e.id, 'request_id', e.request_id));

  RETURN v_quote;
END;
$$;

-- Soumission -> Commande
CREATE OR REPLACE FUNCTION public.jsc_convert_quote_to_order(_quote_id uuid, _scheduled_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q record;
  e record;
  req record;
  v_existing uuid;
  v_order uuid;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO q FROM public.jsc_quotes WHERE id = _quote_id;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Soumission introuvable'; END IF;

  SELECT id INTO v_existing FROM public.jsc_orders WHERE quote_id = _quote_id AND archived_at IS NULL LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO e FROM public.jsc_estimates WHERE id = q.estimate_id;
  SELECT * INTO req FROM public.jsc_requests WHERE id = q.request_id;

  IF q.status <> 'acceptee' THEN
    UPDATE public.jsc_quotes SET status = 'acceptee', accepted_at = COALESCE(accepted_at, now())
     WHERE id = _quote_id;
  END IF;

  INSERT INTO public.jsc_orders (
    company_id, quote_id, request_id, client_id, project_id,
    carrier_id, truck_id, supplier_id, pickup_location_id, material_id,
    status, scheduled_date, trips_planned,
    delivered_quantity, delivered_unit,
    subtotal, tax_total, total, currency, created_by
  ) VALUES (
    q.company_id, q.id, q.request_id, q.client_id, req.project_id,
    e.carrier_id, e.truck_id, e.supplier_id, e.pickup_location_id, COALESCE(e.material_id, req.material_id),
    'planifiee', COALESCE(_scheduled_date, req.desired_date, current_date), COALESCE(e.trips, 1),
    req.quantity, req.quantity_unit,
    q.subtotal, q.tax_total, q.total, q.currency, auth.uid()
  ) RETURNING id INTO v_order;

  UPDATE public.jsc_requests SET status = 'acceptee' WHERE id = q.request_id;

  PERFORM public.jsc_log_event('convert_quote_to_order', 'jsc_orders', v_order,
    q.quote_number, jsonb_build_object('quote_id', q.id));

  RETURN v_order;
END;
$$;

-- Commande -> Livraisons
CREATE OR REPLACE FUNCTION public.jsc_generate_deliveries(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  req record;
  v_count integer;
  v_trips integer;
  v_qty numeric;
  i integer;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO o FROM public.jsc_orders WHERE id = _order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;

  SELECT count(*) INTO v_count FROM public.jsc_deliveries
   WHERE order_id = _order_id AND archived_at IS NULL;
  IF v_count > 0 THEN RETURN v_count; END IF;

  SELECT * INTO req FROM public.jsc_requests WHERE id = o.request_id;

  v_trips := GREATEST(COALESCE(o.trips_planned, 1), 1);
  v_qty := round(COALESCE(o.delivered_quantity, req.quantity, 0) / v_trips, 3);

  FOR i IN 1..v_trips LOOP
    INSERT INTO public.jsc_deliveries (
      company_id, order_id, project_id, client_id, material_id, supplier_id,
      pickup_location_id, carrier_id, truck_id, driver_id,
      quantity, quantity_unit, trip_index,
      delivery_address, city, postal_code, latitude, longitude,
      scheduled_date, status, created_by
    ) VALUES (
      o.company_id, o.id, o.project_id, o.client_id, o.material_id, o.supplier_id,
      o.pickup_location_id, o.carrier_id, o.truck_id, o.driver_id,
      v_qty, COALESCE(o.delivered_unit, req.quantity_unit, 'tonne'), i,
      req.delivery_address, req.city, req.postal_code, req.latitude, req.longitude,
      o.scheduled_date, 'a_planifier', auth.uid()
    );
  END LOOP;

  PERFORM public.jsc_log_event('generate_deliveries', 'jsc_orders', o.id,
    o.order_number, jsonb_build_object('trips', v_trips));

  RETURN v_trips;
END;
$$;

-- Commande -> Facture
CREATE OR REPLACE FUNCTION public.jsc_convert_order_to_invoice(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  e record;
  c record;
  m record;
  v_existing uuid;
  v_invoice uuid;
  v_taxes jsonb;
  v_tax_ids uuid[];
  v_subtotal numeric := 0;
  v_material numeric := 0;
  v_transport numeric := 0;
  v_surcharges numeric := 0;
  v_margin numeric := 0;
  v_terms integer;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO o FROM public.jsc_orders WHERE id = _order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;

  SELECT id INTO v_existing FROM public.jsc_invoices WHERE order_id = _order_id AND archived_at IS NULL LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO c FROM public.jsc_clients WHERE id = o.client_id;
  SELECT * INTO m FROM public.jsc_materials WHERE id = o.material_id;
  SELECT e2.* INTO e FROM public.jsc_estimates e2
    JOIN public.jsc_quotes q ON q.estimate_id = e2.id
   WHERE q.id = o.quote_id;

  v_material := COALESCE(e.material_cost, 0);
  v_transport := COALESCE(e.transport_cost, 0);
  v_surcharges := COALESCE(e.surcharges, 0);
  v_margin := COALESCE(e.margin, 0);
  v_subtotal := COALESCE(o.subtotal, v_material + v_transport + v_surcharges + v_margin);

  v_taxes := public.jsc_compute_taxes(o.company_id, v_subtotal, NOT COALESCE(c.tax_exempt, false));
  SELECT COALESCE(array_agg((x ->> 'tax_id')::uuid), '{}') INTO v_tax_ids
    FROM jsonb_array_elements(v_taxes -> 'lines') x;

  v_terms := COALESCE(NULLIF(regexp_replace(COALESCE(c.payment_terms, ''), '\D', '', 'g'), '')::int, 30);

  INSERT INTO public.jsc_invoices (
    company_id, order_id, client_id, status, issued_at, due_at, payment_terms,
    subtotal, tax_total, total, amount_paid, currency, created_by
  ) VALUES (
    o.company_id, o.id, o.client_id, 'brouillon', current_date, current_date + v_terms,
    c.payment_terms,
    round(v_subtotal, 2), (v_taxes ->> 'tax_total')::numeric,
    round(v_subtotal + (v_taxes ->> 'tax_total')::numeric, 2), 0, o.currency, auth.uid()
  ) RETURNING id INTO v_invoice;

  IF v_material > 0 THEN
    INSERT INTO public.jsc_invoice_lines (company_id, invoice_id, line_type, description, quantity, unit, unit_price, line_total, tax_ids, sort_order)
    VALUES (o.company_id, v_invoice, 'materiau',
      COALESCE(m.name, 'Matériau'), COALESCE(o.delivered_quantity, 1),
      COALESCE(o.delivered_unit, 'tonne'),
      round(v_material / NULLIF(COALESCE(o.delivered_quantity, 1), 0), 4), round(v_material, 2), v_tax_ids, 1);
  END IF;

  IF v_transport + v_margin > 0 THEN
    INSERT INTO public.jsc_invoice_lines (company_id, invoice_id, line_type, description, quantity, unit, unit_price, line_total, tax_ids, sort_order)
    VALUES (o.company_id, v_invoice, 'transport',
      'Transport (' || COALESCE(o.trips_planned, 1) || ' voyage(s))',
      COALESCE(o.trips_planned, 1), 'voyage',
      round((v_transport + v_margin) / NULLIF(COALESCE(o.trips_planned, 1), 0), 4),
      round(v_transport + v_margin, 2), v_tax_ids, 2);
  END IF;

  IF v_surcharges > 0 THEN
    INSERT INTO public.jsc_invoice_lines (company_id, invoice_id, line_type, description, quantity, unit, unit_price, line_total, tax_ids, sort_order)
    VALUES (o.company_id, v_invoice, 'surcharge', 'Surcharges', 1, 'forfait',
      round(v_surcharges, 2), round(v_surcharges, 2), v_tax_ids, 3);
  END IF;

  IF v_material = 0 AND v_transport + v_margin = 0 AND v_surcharges = 0 AND v_subtotal > 0 THEN
    INSERT INTO public.jsc_invoice_lines (company_id, invoice_id, line_type, description, quantity, unit, unit_price, line_total, tax_ids, sort_order)
    VALUES (o.company_id, v_invoice, 'transport', 'Prestation de transport de vrac', 1, 'forfait',
      round(v_subtotal, 2), round(v_subtotal, 2), v_tax_ids, 1);
  END IF;

  UPDATE public.jsc_orders SET status = 'facturee' WHERE id = o.id AND status <> 'annulee';

  PERFORM public.jsc_log_event('convert_order_to_invoice', 'jsc_invoices', v_invoice,
    o.order_number, jsonb_build_object('order_id', o.id, 'taxes', v_taxes -> 'lines'));

  RETURN v_invoice;
END;
$$;

-- Avancement automatique du dossier
CREATE OR REPLACE FUNCTION public.jsc_advance_flow(_entity_type text, _entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_n integer;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  CASE _entity_type
    WHEN 'estimate' THEN
      v_id := public.jsc_convert_estimate_to_quote(_entity_id);
      RETURN jsonb_build_object('next', 'quote', 'id', v_id);
    WHEN 'quote' THEN
      v_id := public.jsc_convert_quote_to_order(_entity_id);
      v_n := public.jsc_generate_deliveries(v_id);
      RETURN jsonb_build_object('next', 'order', 'id', v_id, 'deliveries', v_n);
    WHEN 'order' THEN
      v_id := public.jsc_convert_order_to_invoice(_entity_id);
      RETURN jsonb_build_object('next', 'invoice', 'id', v_id);
    ELSE
      RAISE EXCEPTION 'Type inconnu: %', _entity_type;
  END CASE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.jsc_compute_taxes(uuid, numeric, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.jsc_select_estimate(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.jsc_convert_estimate_to_quote(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.jsc_convert_quote_to_order(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.jsc_generate_deliveries(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.jsc_convert_order_to_invoice(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.jsc_advance_flow(text, uuid) FROM anon;