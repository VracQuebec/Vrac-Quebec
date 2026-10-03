CREATE OR REPLACE FUNCTION public.fin_gl_subledger_check(_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ar uuid; ap uuid; ar_gl numeric; ap_gl numeric; ar_op numeric := 0; ap_op numeric; ap_av numeric; i record; drafts int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  SELECT gl_account_id INTO ar FROM fin_gl_mappings WHERE company_id = _company AND role = 'ar';
  SELECT gl_account_id INTO ap FROM fin_gl_mappings WHERE company_id = _company AND role = 'ap';
  SELECT coalesce(sum(l.debit - l.credit), 0) INTO ar_gl FROM fin_gl_lines l JOIN fin_gl_entries e ON e.id = l.entry_id WHERE e.company_id = _company AND e.status = 'validated' AND l.gl_account_id = ar;
  SELECT coalesce(sum(l.credit - l.debit), 0) INTO ap_gl FROM fin_gl_lines l JOIN fin_gl_entries e ON e.id = l.entry_id WHERE e.company_id = _company AND e.status = 'validated' AND l.gl_account_id = ap;
  FOR i IN SELECT id FROM fin_invoices WHERE company_id = _company AND status = 'emise' LOOP
    ar_op := ar_op + coalesce((public.fin_invoice_balance(i.id)->>'rest')::numeric, 0);
  END LOOP;
  SELECT coalesce((t->'totals'->>'rest')::numeric, 0), coalesce((t->'totals'->>'available')::numeric, 0) INTO ap_op, ap_av FROM (SELECT public.fin_ap_aging(_company, current_date) t) z;
  SELECT count(*) INTO drafts FROM fin_gl_entries WHERE company_id = _company AND status = 'draft';
  RETURN jsonb_build_object('on', current_date, 'drafts', drafts,
    'ar', jsonb_build_object('mapped', ar IS NOT NULL, 'gl', CASE WHEN ar IS NULL THEN NULL ELSE ar_gl END, 'operational', ar_op, 'gap', CASE WHEN ar IS NULL THEN NULL ELSE ar_gl - ar_op END),
    'ap', jsonb_build_object('mapped', ap IS NOT NULL, 'gl', CASE WHEN ap IS NULL THEN NULL ELSE ap_gl END, 'operational', ap_op - ap_av, 'rest', ap_op, 'available', ap_av, 'gap', CASE WHEN ap IS NULL THEN NULL ELSE ap_gl - (ap_op - ap_av) END));
END $$;
REVOKE ALL ON FUNCTION public.fin_gl_subledger_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_gl_subledger_check(uuid) TO authenticated;