CREATE OR REPLACE FUNCTION public.fin_tax_period_compute(_company uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb := '{}'; _r text; acc uuid; amt numeric; n int; drafts int; missing text[] := '{}';
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN RAISE EXCEPTION 'Période invalide' USING ERRCODE='22023'; END IF;
  FOREACH _r IN ARRAY ARRAY['gst_payable','qst_payable','gst_recoverable','qst_recoverable'] LOOP
    acc := NULL;
    SELECT m.gl_account_id INTO acc FROM public.fin_gl_mappings m WHERE m.company_id=_company AND m.role=_r;
    IF acc IS NULL THEN missing := missing || _r; r := r || jsonb_build_object(_r, NULL); CONTINUE; END IF;
    SELECT coalesce(sum(CASE WHEN _r LIKE '%payable' THEN l.credit-l.debit ELSE l.debit-l.credit END),0), count(DISTINCT e.id) INTO amt, n
      FROM public.fin_gl_lines l JOIN public.fin_gl_entries e ON e.id=l.entry_id
      WHERE l.company_id=_company AND l.gl_account_id=acc AND e.status='validated' AND e.entry_date BETWEEN _from AND _to;
    r := r || jsonb_build_object(_r, jsonb_build_object('account_id', acc, 'amount', amt, 'entries', n));
  END LOOP;
  SELECT count(*) INTO drafts FROM public.fin_gl_entries WHERE company_id=_company AND status='draft' AND entry_date BETWEEN _from AND _to;
  RETURN jsonb_build_object('from', _from, 'to', _to, 'currency', 'CAD', 'lines', r, 'missing', to_jsonb(missing), 'drafts_in_period', drafts,
    'gst_net', CASE WHEN r->'gst_payable' = 'null' OR r->'gst_recoverable' = 'null' THEN NULL ELSE (r->'gst_payable'->>'amount')::numeric - (r->'gst_recoverable'->>'amount')::numeric END,
    'qst_net', CASE WHEN r->'qst_payable' = 'null' OR r->'qst_recoverable' = 'null' THEN NULL ELSE (r->'qst_payable'->>'amount')::numeric - (r->'qst_recoverable'->>'amount')::numeric END);
END $$;