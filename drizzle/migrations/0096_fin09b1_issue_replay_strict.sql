CREATE OR REPLACE FUNCTION public.fin_progress_issue(_situation uuid, _issue_key text, _expect_rev integer, _expect_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; p fin_progress_plans; s fin_progress_situations; comp jsonb; cs ent_crm_settings; rn jsonb; c ent_crm_clients;
  st fin_invoice_settings; co jsc_companies; n integer; num text; inv uuid; inf uuid; k integer; nw jsonb; lines jsonb := '[]'::jsonb; lbl text; prevs jsonb; ct jsonb; tax jsonb; l jsonb; pit boolean;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_situations WHERE id = _situation;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_issue_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO s FROM fin_progress_situations WHERE id = _situation FOR UPDATE;
  IF s.status = 'emise' THEN
    IF s.issue_key = _issue_key AND s.rev IS NOT DISTINCT FROM _expect_rev AND s.hash IS NOT DISTINCT FROM _expect_hash THEN RETURN jsonb_build_object('invoice_id', s.invoice_id, 'number', (SELECT number FROM fin_invoices WHERE id = s.invoice_id), 'already', true); END IF;
    RAISE EXCEPTION 'Situation déjà émise : clé, révision ou empreinte différente' USING ERRCODE = 'P0409';
  END IF;
  IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon abandonné : émission impossible' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE company_id = cid AND issue_key = _issue_key) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF s.rev IS DISTINCT FROM _expect_rev OR s.hash IS DISTINCT FROM _expect_hash THEN RAISE EXCEPTION 'Brouillon modifié depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  PERFORM public.fin_progress_check_dates(pid, s.issue_date, s.due_date);
  ct := p.contract; pit := coalesce((ct->>'prices_include_tax')::boolean, false);
  SELECT * INTO cs FROM ent_crm_settings WHERE company_id = cid;
  rn := public.fin_tax_compute(p.source->'lines', pit, coalesce(cs.gst_status,'a_completer'), coalesce(cs.qst_status,'a_completer'), s.issue_date);
  IF NOT coalesce((rn->>'resolved')::boolean, false) OR rn->>'gst_status' IS DISTINCT FROM ct->>'gst_status' OR rn->>'qst_status' IS DISTINCT FROM ct->>'qst_status'
     OR (rn->>'gst_rate')::numeric IS DISTINCT FROM (ct->>'gst_rate')::numeric OR (rn->>'qst_rate')::numeric IS DISTINCT FROM (ct->>'qst_rate')::numeric
     OR (rn->>'total')::numeric IS DISTINCT FROM (ct->>'total')::numeric THEN
    RAISE EXCEPTION 'Profil fiscal ou taux à cette date différent du contrat figé : situation refusée (dossier et factures intacts). Le traitement des changements fiscaux est à venir.';
  END IF;
  comp := public.fin_progress_compute(pid, s.kind, s.mode, s.value, s.issue_date);
  IF comp IS DISTINCT FROM s.computed THEN RAISE EXCEPTION 'Montants changés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  SELECT * INTO c FROM ent_crm_clients WHERE id = p.client_id AND company_id = cid;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  k := (SELECT count(*) FROM fin_progress_situations WHERE plan_id = pid AND status = 'emise') + 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq', x.seq, 'number', i.number, 'kind', x.kind, 'ht', x.computed->'new'->'ht', 'total', x.computed->'new'->'total') ORDER BY x.seq), '[]'::jsonb)
    INTO prevs FROM fin_progress_situations x JOIN fin_invoices i ON i.id = x.invoice_id WHERE x.plan_id = pid AND x.status = 'emise';
  nw := comp->'new';
  lbl := CASE s.kind WHEN 'acompte' THEN 'Acompte' WHEN 'situation' THEN 'Situation' ELSE 'Solde final' END
    || ' n° ' || k || ' — soumission ' || coalesce(p.source->>'number','') || ' v' || coalesce(p.source->>'version','1')
    || ' — cumul ' || (comp->'cum'->>'pct') || ' % du contrat';
  FOR l IN SELECT * FROM jsonb_array_elements(comp->'lines') LOOP
    lines := lines || (l || jsonb_build_object('unit', 'forfait', 'desc', lbl || CASE l->>'tax' WHEN 'taxable' THEN ' (part taxable)' WHEN 'detaxe' THEN ' (part détaxée)' ELSE ' (part exonérée)' END));
  END LOOP;
  tax := (comp->'tax') || jsonb_build_object('final', true,
    'progress', jsonb_build_object('kind', s.kind, 'seq', k, 'mode', s.mode, 'value', s.value, 'basis', comp->'basis', 'quote_number', p.source->>'number', 'quote_version', p.source->'version',
      'contract', comp->'contract', 'prev', comp->'prev', 'cum', comp->'cum', 'new', nw, 'remaining', comp->'remaining', 'gap_vs_quote', comp->'gap_vs_quote', 'previous', prevs));
  INSERT INTO fin_invoice_settings(company_id) VALUES (cid) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM fin_invoice_settings WHERE company_id = cid FOR UPDATE;
  n := st.next_number; num := st.prefix || lpad(n::text, 5, '0');
  WHILE EXISTS (SELECT 1 FROM fin_invoices WHERE company_id = cid AND number = num) LOOP n := n + 1; num := st.prefix || lpad(n::text, 5, '0'); END LOOP;
  UPDATE fin_invoice_settings SET next_number = n + 1 WHERE company_id = cid;
  SELECT * INTO co FROM jsc_companies WHERE id = cid;
  PERFORM set_config('fin.progress', 'on', true); PERFORM set_config('fin.invoice_issue', 'on', true);
  INSERT INTO fin_invoices (company_id, status, number, seq, client_id, client_name, client_email, client_phone, issue_date, due_date, terms, lines, prices_include_tax,
    tax_snapshot, subtotal, total, seller_snapshot, client_snapshot, template_snapshot, issued_at, issued_by, progress_situation_id, created_by)
  VALUES (cid, 'emise', num, n, c.id, c.name, c.email, c.phone, s.issue_date, s.due_date, p.source->>'conditions', lines, pit,
    tax, (nw->>'ht')::numeric, (nw->>'total')::numeric,
    jsonb_build_object('name', co.name, 'legal_name', co.legal_name, 'address', co.address, 'phone', co.phone, 'email', co.email,
      'gst_number', CASE WHEN cs.gst_status='inscrit' THEN cs.gst_number END, 'qst_number', CASE WHEN cs.qst_status='inscrit' THEN cs.qst_number END),
    jsonb_build_object('name', c.name, 'address', NULL, 'email', c.email, 'phone', c.phone),
    jsonb_build_object('key', st.template_key, 'version', st.template_version, 'logo_path', st.logo_path, 'color', st.brand_color, 'footer', st.footer, 'custom_ref', st.custom_template_ref),
    now(), auth.uid(), s.id, auth.uid())
  RETURNING id INTO inv;
  INSERT INTO fin_expected_inflows (company_id, amount, received, expected_on, counterparty, certainty, kind, note, invoice_id)
  VALUES (cid, (nw->>'total')::numeric, 0, coalesce(s.due_date, s.issue_date), c.name, 'certain', 'revenue', 'Facture ' || num, inv) RETURNING id INTO inf;
  UPDATE fin_invoices SET expected_inflow_id = inf WHERE id = inv;
  PERFORM set_config('fin.invoice_issue', '', true); PERFORM set_config('fin.progress', '', true);
  UPDATE fin_progress_situations SET status = 'emise', seq = k, invoice_id = inv, issue_key = _issue_key, issued_at = now(), issued_by = auth.uid() WHERE id = s.id;
  RETURN jsonb_build_object('invoice_id', inv, 'number', num, 'already', false);
END $$;