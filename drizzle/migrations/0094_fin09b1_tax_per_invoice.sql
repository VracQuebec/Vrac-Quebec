-- FIN-09B1 correctif : taxes calculées sur chaque facture par le moteur commun (fin_tax_compute), sans ajustement
-- pour retomber sur la taxe arrondie de la soumission. Plafond = HT cumulé (contrat HT) ou TTC cumulé (contrat taxes incluses).
ALTER TABLE public.fin_progress_situations DROP CONSTRAINT IF EXISTS fin_progress_situations_mode_check;
ALTER TABLE public.fin_progress_situations ADD CONSTRAINT fin_progress_situations_mode_check CHECK (mode IN ('pct','amount','amount_ttc'));

CREATE OR REPLACE FUNCTION public.fin_progress_compute(_plan uuid, _kind text, _mode text, _value text, _on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb; pit boolean; v numeric; cc numeric; x numeric; t numeric; z numeric; e numeric;
  ct numeric; cz numeric; ce numeric; diff numeric; pt numeric; pz numeric; pe numeric; prev numeric;
  lines jsonb := '[]'::jsonb; r jsonb; pv jsonb; nw jsonb; cum jsonb;
BEGIN
  SELECT contract INTO c FROM fin_progress_plans WHERE id = _plan;
  IF c IS NULL THEN RAISE EXCEPTION 'Dossier introuvable'; END IF;
  pit := coalesce((c->>'prices_include_tax')::boolean, false);
  IF pit THEN t := (c->>'bt')::numeric + (c->>'gst')::numeric + (c->>'qst')::numeric; ELSE t := (c->>'bt')::numeric; END IF;
  z := (c->>'bz')::numeric; e := (c->>'be')::numeric; cc := t + z + e;
  IF _kind IS NULL OR _kind NOT IN ('acompte','situation','solde') THEN RAISE EXCEPTION 'Type inconnu' USING ERRCODE = '22023'; END IF;
  IF _kind = 'solde' THEN x := cc;
  ELSE
    IF _mode IS NULL OR _mode NOT IN ('pct','amount','amount_ttc') THEN RAISE EXCEPTION 'Mode inconnu' USING ERRCODE = '22023'; END IF;
    IF pit AND _mode = 'amount' THEN RAISE EXCEPTION 'Contrat à prix taxes incluses : saisissez un cumul en %% ou en montant TTC (aucune conversion HT)' USING ERRCODE = '22023'; END IF;
    IF NOT pit AND _mode = 'amount_ttc' THEN RAISE EXCEPTION 'Contrat à prix hors taxes : saisissez un cumul en %% ou en montant HT' USING ERRCODE = '22023'; END IF;
    IF coalesce(_value,'') !~ '^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Cumul invalide : nombre positif, au plus 2 décimales' USING ERRCODE = '22023'; END IF;
    v := _value::numeric;
    IF v <= 0 THEN RAISE EXCEPTION 'Cumul invalide : doit être supérieur à zéro' USING ERRCODE = '22023'; END IF;
    IF _mode = 'pct' AND v > 100 THEN RAISE EXCEPTION 'Cumul supérieur à 100 %% du contrat' USING ERRCODE = '22023'; END IF;
    x := CASE WHEN _mode = 'pct' THEN round(cc * v / 100, 2) ELSE v END;
    IF x > cc THEN RAISE EXCEPTION 'Cumul supérieur au contrat approuvé (%)', cc USING ERRCODE = '22023'; END IF;
    IF x = cc THEN RAISE EXCEPTION 'Ce cumul atteint le contrat : choisissez « solde final »' USING ERRCODE = '22023'; END IF;
  END IF;
  SELECT coalesce(sum((computed->'cap_new'->>'t')::numeric),0), coalesce(sum((computed->'cap_new'->>'z')::numeric),0), coalesce(sum((computed->'cap_new'->>'e')::numeric),0),
    jsonb_build_object('bt', coalesce(sum((computed->'new'->>'bt')::numeric),0), 'bz', coalesce(sum((computed->'new'->>'bz')::numeric),0), 'be', coalesce(sum((computed->'new'->>'be')::numeric),0),
      'gst', coalesce(sum((computed->'new'->>'gst')::numeric),0), 'qst', coalesce(sum((computed->'new'->>'qst')::numeric),0),
      'ht', coalesce(sum((computed->'new'->>'ht')::numeric),0), 'total', coalesce(sum((computed->'new'->>'total')::numeric),0))
    INTO pt, pz, pe, pv FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise';
  prev := pt + pz + pe;
  IF x <= prev THEN RAISE EXCEPTION 'Le cumul (%) doit dépasser le cumul déjà facturé (%)', x, prev USING ERRCODE = '22023'; END IF;
  IF x = cc THEN ct := t; cz := z; ce := e;
  ELSE
    ct := round(t * x / cc, 2); cz := round(z * x / cc, 2); ce := round(e * x / cc, 2);
    diff := x - ct - cz - ce;
    IF diff <> 0 THEN IF t >= z AND t >= e THEN ct := ct + diff; ELSIF z >= e THEN cz := cz + diff; ELSE ce := ce + diff; END IF; END IF;
  END IF;
  IF ct < pt OR cz < pz OR ce < pe OR ct > t OR cz > z OR ce > e THEN RAISE EXCEPTION 'Arrondi : ce cumul produirait une part négative; augmentez légèrement le cumul' USING ERRCODE = '22023'; END IF;
  IF ct - pt <> 0 THEN lines := lines || jsonb_build_object('qty', 1, 'price', ct - pt, 'tax', 'taxable'); END IF;
  IF cz - pz <> 0 THEN lines := lines || jsonb_build_object('qty', 1, 'price', cz - pz, 'tax', 'detaxe'); END IF;
  IF ce - pe <> 0 THEN lines := lines || jsonb_build_object('qty', 1, 'price', ce - pe, 'tax', 'exonere'); END IF;
  -- Taxes de CETTE facture : moteur commun, taux en vigueur à la date de facture, statuts du contrat figé.
  r := public.fin_tax_compute(lines, pit, c->>'gst_status', c->>'qst_status', coalesce(_on, (now() AT TIME ZONE 'America/Toronto')::date));
  IF NOT coalesce((r->>'resolved')::boolean, false) THEN RAISE EXCEPTION 'Taxes non résolues à cette date : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; '); END IF;
  nw := jsonb_build_object('bt', (r->>'taxable_base')::numeric, 'bz', (r->>'zero_rated_base')::numeric, 'be', (r->>'exempt_base')::numeric,
    'gst', (r->>'gst')::numeric, 'qst', (r->>'qst')::numeric, 'ht', (r->>'pre_tax')::numeric, 'total', (r->>'total')::numeric);
  cum := jsonb_build_object('bt', (pv->>'bt')::numeric + (nw->>'bt')::numeric, 'bz', (pv->>'bz')::numeric + (nw->>'bz')::numeric, 'be', (pv->>'be')::numeric + (nw->>'be')::numeric,
    'gst', (pv->>'gst')::numeric + (nw->>'gst')::numeric, 'qst', (pv->>'qst')::numeric + (nw->>'qst')::numeric,
    'ht', (pv->>'ht')::numeric + (nw->>'ht')::numeric, 'total', (pv->>'total')::numeric + (nw->>'total')::numeric, 'pct', round(x * 100 / cc, 2), 'cap', x);
  RETURN jsonb_build_object('basis', CASE WHEN pit THEN 'ttc' ELSE 'ht' END,
    'contract', jsonb_build_object('bt', c->'bt', 'bz', c->'bz', 'be', c->'be', 'gst', c->'gst', 'qst', c->'qst', 'ht', c->'ht', 'total', c->'total', 'cap', cc),
    'prev', pv || jsonb_build_object('cap', prev), 'cum', cum, 'new', nw || jsonb_build_object('cap', x - prev),
    'cap_new', jsonb_build_object('t', ct - pt, 'z', cz - pz, 'e', ce - pe),
    'remaining', jsonb_build_object('cap', cc - x, 'ht', (c->>'ht')::numeric - (cum->>'ht')::numeric, 'total', (c->>'total')::numeric - (cum->>'total')::numeric),
    'gap_vs_quote', CASE WHEN x = cc THEN jsonb_build_object('ht', (cum->>'ht')::numeric - (c->>'ht')::numeric, 'gst', (cum->>'gst')::numeric - (c->>'gst')::numeric,
      'qst', (cum->>'qst')::numeric - (c->>'qst')::numeric, 'total', (cum->>'total')::numeric - (c->>'total')::numeric) END,
    'lines', lines, 'tax', r);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_compute(uuid, text, text, text, date) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.fin_progress_compute(uuid, text, text, text) IS 'DEPRECATED: remplacée par fin_progress_compute(..., _on date) (taxes par facture)';

CREATE OR REPLACE FUNCTION public.fin_progress_draft_save(_plan uuid, _draft_key text, _kind text, _mode text, _value text, _issue_date date, _due_date date, _base_rev integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; s fin_progress_situations; ih text; comp jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_draft_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  IF _kind = 'solde' THEN _mode := 'pct'; _value := '100'; END IF;
  ih := md5(concat_ws('|', _kind, _mode, _value, _issue_date, _due_date));
  SELECT * INTO s FROM fin_progress_situations WHERE company_id = p.company_id AND draft_key = _draft_key FOR UPDATE;
  IF s.id IS NOT NULL THEN
    IF s.plan_id <> _plan THEN RAISE EXCEPTION 'Clé déjà utilisée sur un autre dossier' USING ERRCODE = 'P0409'; END IF;
    IF s.input_hash = ih THEN RETURN to_jsonb(s); END IF;
    IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon déjà émis ou abandonné : clé réutilisée avec un autre contenu' USING ERRCODE = 'P0409'; END IF;
    IF _base_rev IS DISTINCT FROM s.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
    PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
    comp := public.fin_progress_compute(_plan, _kind, _mode, _value, _issue_date);
    UPDATE fin_progress_situations SET kind = _kind, mode = _mode, value = _value, issue_date = _issue_date, due_date = _due_date,
      computed = comp, input_hash = ih, hash = md5(ih || comp::text), rev = rev + 1 WHERE id = s.id RETURNING * INTO s;
    RETURN to_jsonb(s);
  END IF;
  IF _base_rev IS NOT NULL THEN RAISE EXCEPTION 'Brouillon introuvable pour cette révision' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE plan_id = _plan AND status = 'brouillon') THEN
    RAISE EXCEPTION 'Un brouillon de situation existe déjà : reprenez-le ou abandonnez-le';
  END IF;
  PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
  comp := public.fin_progress_compute(_plan, _kind, _mode, _value, _issue_date);
  INSERT INTO fin_progress_situations (plan_id, company_id, kind, mode, value, issue_date, due_date, computed, input_hash, hash, draft_key)
  VALUES (_plan, p.company_id, _kind, _mode, _value, _issue_date, _due_date, comp, ih, md5(ih || comp::text), _draft_key) RETURNING * INTO s;
  RETURN to_jsonb(s);
END $$;

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
    IF s.issue_key = _issue_key THEN RETURN jsonb_build_object('invoice_id', s.invoice_id, 'number', (SELECT number FROM fin_invoices WHERE id = s.invoice_id), 'already', true); END IF;
    RAISE EXCEPTION 'Situation déjà émise avec une autre clé' USING ERRCODE = 'P0409';
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