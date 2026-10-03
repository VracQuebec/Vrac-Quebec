CREATE OR REPLACE FUNCTION public.fin_gl_cash_flow(_company uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cash uuid[]; op numeric; cl numeric; rows jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN RAISE EXCEPTION 'Période invalide' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT gl_account_id), '{}') INTO cash FROM public.fin_gl_account_links WHERE company_id=_company AND gl_account_id IS NOT NULL;
  SELECT coalesce(sum(l.debit-l.credit) FILTER (WHERE e.entry_date < _from),0), coalesce(sum(l.debit-l.credit),0) INTO op, cl
    FROM public.fin_gl_lines l JOIN public.fin_gl_entries e ON e.id=l.entry_id
    WHERE l.company_id=_company AND e.status='validated' AND e.entry_date <= _to AND l.gl_account_id = ANY(cash);
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'category', x->>'number'), '[]') INTO rows FROM (
    SELECT jsonb_build_object('account_id', a.id, 'number', a.number, 'name', a.name, 'category', a.category,
      'inflow', sum(GREATEST(l.credit-l.debit,0)), 'outflow', sum(GREATEST(l.debit-l.credit,0)), 'net', sum(l.credit-l.debit), 'entries', count(DISTINCT e.id)) x
    FROM public.fin_gl_lines l JOIN public.fin_gl_entries e ON e.id=l.entry_id JOIN public.fin_gl_accounts a ON a.id=l.gl_account_id
    WHERE l.company_id=_company AND e.status='validated' AND e.entry_date BETWEEN _from AND _to
      AND NOT (l.gl_account_id = ANY(cash))
      AND EXISTS (SELECT 1 FROM public.fin_gl_lines c WHERE c.entry_id=e.id AND c.gl_account_id = ANY(cash))
    GROUP BY a.id, a.number, a.name, a.category) s;
  RETURN jsonb_build_object('from', _from, 'to', _to, 'currency', 'CAD', 'cash_accounts', coalesce(array_length(cash,1),0),
    'opening', op, 'closing', cl, 'net_change', cl-op, 'rows', rows);
END $$;
REVOKE ALL ON FUNCTION public.fin_gl_cash_flow(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_gl_cash_flow(uuid, date, date) TO authenticated, service_role;