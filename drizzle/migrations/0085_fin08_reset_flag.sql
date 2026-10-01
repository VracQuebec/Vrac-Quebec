CREATE OR REPLACE FUNCTION public.fin_invoice_issue(_id uuid, _replace_inflow uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; s ent_crm_settings; st fin_invoice_settings; co jsc_companies; r jsonb; n integer; num text; inf uuid; today date := (now() AT TIME ZONE 'America/Toronto')::date; d date;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _id FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF i.status = 'emise' THEN RETURN jsonb_build_object('id', i.id, 'number', i.number, 'already', true); END IF;
  IF coalesce(i.client_name,'') = '' THEN RAISE EXCEPTION 'Client requis : nom du client à compléter'; END IF;
  IF jsonb_array_length(i.lines) = 0 THEN RAISE EXCEPTION 'Ajoutez au moins une ligne'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(i.lines) l WHERE coalesce(l->>'qty','') = '' OR coalesce(l->>'price','') = '') THEN RAISE EXCEPTION 'Ligne sans quantité ou prix'; END IF;
  d := coalesce(i.issue_date, today);
  SELECT * INTO s FROM ent_crm_settings WHERE company_id = i.company_id;
  r := public.fin_tax_compute(i.lines, i.prices_include_tax, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), d);
  IF NOT (r->>'resolved')::boolean THEN
    RAISE EXCEPTION 'Taxes à déterminer : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; ');
  END IF;
  INSERT INTO fin_invoice_settings(company_id) VALUES (i.company_id) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM fin_invoice_settings WHERE company_id = i.company_id FOR UPDATE;
  n := st.next_number; num := st.prefix || lpad(n::text, 5, '0');
  WHILE EXISTS (SELECT 1 FROM fin_invoices WHERE company_id = i.company_id AND number = num) LOOP n := n + 1; num := st.prefix || lpad(n::text, 5, '0'); END LOOP;
  UPDATE fin_invoice_settings SET next_number = n + 1 WHERE company_id = i.company_id;
  SELECT * INTO co FROM jsc_companies WHERE id = i.company_id;
  PERFORM set_config('fin.invoice_issue', 'on', true);
  IF _replace_inflow IS NOT NULL THEN
    UPDATE fin_expected_inflows SET invoice_id = i.id, amount = (r->>'total')::numeric, certainty = 'certain', kind = 'revenue',
      expected_on = coalesce(i.due_date, d), counterparty = i.client_name, updated_at = now()
    WHERE id = _replace_inflow AND company_id = i.company_id AND invoice_id IS NULL AND archived_at IS NULL RETURNING id INTO inf;
    IF inf IS NULL THEN RAISE EXCEPTION 'Prévision à remplacer introuvable ou déjà liée'; END IF;
  ELSE
    INSERT INTO fin_expected_inflows (company_id, amount, received, expected_on, counterparty, certainty, kind, note, invoice_id)
    VALUES (i.company_id, (r->>'total')::numeric, 0, coalesce(i.due_date, d), i.client_name, 'certain', 'revenue', 'Facture ' || num, i.id) RETURNING id INTO inf;
  END IF;
  UPDATE fin_invoices SET status = 'emise', number = num, seq = n, issue_date = d, issued_at = now(), issued_by = auth.uid(),
    tax_snapshot = r || jsonb_build_object('final', true),
    subtotal = (r->>'pre_tax')::numeric, total = (r->>'total')::numeric, expected_inflow_id = inf,
    seller_snapshot = jsonb_build_object('name', co.name, 'legal_name', co.legal_name, 'address', co.address, 'phone', co.phone, 'email', co.email,
      'gst_number', CASE WHEN s.gst_status='inscrit' THEN s.gst_number END, 'qst_number', CASE WHEN s.qst_status='inscrit' THEN s.qst_number END),
    client_snapshot = jsonb_build_object('name', i.client_name, 'address', i.client_address, 'email', i.client_email, 'phone', i.client_phone),
    template_snapshot = jsonb_build_object('key', st.template_key, 'version', st.template_version, 'logo_path', st.logo_path, 'color', st.brand_color, 'footer', st.footer, 'custom_ref', st.custom_template_ref),
    updated_at = now()
  WHERE id = i.id;
  PERFORM set_config('fin.invoice_issue', '', true);
  RETURN jsonb_build_object('id', i.id, 'number', num, 'already', false);
END $$;