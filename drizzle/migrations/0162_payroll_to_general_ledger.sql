-- Paie → grand livre : une paie finalisée devient une pièce « payroll », comptabilisée une seule fois par fin_gl_sync (index unique source).
CREATE OR REPLACE FUNCTION public.fin_gl_role_category(_role text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role WHEN 'ar' THEN 'actif' WHEN 'ap' THEN 'passif' WHEN 'revenue' THEN 'revenus'
    WHEN 'gst_payable' THEN 'passif' WHEN 'qst_payable' THEN 'passif' WHEN 'gst_recoverable' THEN 'actif' WHEN 'qst_recoverable' THEN 'actif'
    WHEN 'expense' THEN 'depenses' WHEN 'obligation_expense' THEN 'depenses' WHEN 'employee_payable' THEN 'passif'
    WHEN 'employee_advance' THEN 'actif' WHEN 'supplier_advance' THEN 'actif'
    WHEN 'wages_expense' THEN 'depenses' WHEN 'payroll_tax_expense' THEN 'depenses' WHEN 'source_deductions' THEN 'passif' WHEN 'wages_payable' THEN 'passif' ELSE NULL END
$$;

DO $do$
DECLARE def text; tail text := $t$
  UNION ALL
  SELECT 'payroll', pr.id, pr.pay_date, 'Paie ' || pr.period_from || ' au ' || pr.period_to, 'Paie du ' || pr.period_from || ' au ' || pr.period_to,
    jsonb_build_array(
      jsonb_build_object('role', 'wages_expense', 'debit', s.wages),
      jsonb_build_object('role', 'payroll_tax_expense', 'debit', s.er),
      jsonb_build_object('role', 'source_deductions', 'credit', s.ded + s.er),
      jsonb_build_object('role', 'wages_payable', 'credit', s.net)),
    false
  FROM pay_runs pr CROSS JOIN LATERAL (
    SELECT coalesce(sum(st.gross + st.vacation), 0) wages, coalesce(sum(st.net), 0) net,
           coalesce(sum(st.qpp + st.ei + st.qpip + st.fed_tax + st.qc_tax), 0) ded,
           coalesce(sum(coalesce((st.employer->>'qpp')::numeric,0) + coalesce((st.employer->>'ei')::numeric,0) + coalesce((st.employer->>'qpip')::numeric,0)
             + coalesce((st.employer->>'fss')::numeric,0) + coalesce((st.employer->>'cnesst')::numeric,0)), 0) er
    FROM pay_stubs st WHERE st.run_id = pr.id) s
  WHERE pr.company_id = _company AND pr.status = 'finalise'
$t$;
BEGIN
  SELECT pg_get_functiondef('public.fin_gl_raw(uuid)'::regprocedure) INTO def;
  IF position('''payroll''' IN def) > 0 THEN RETURN; END IF;
  def := regexp_replace(def, '(WHERE t\.company_id = _company)(\s*)\$function\$', '\1' || replace(tail, '\', '\\') || E'\n$function$');
  IF position('''payroll''' IN def) = 0 THEN RAISE EXCEPTION 'fin_gl_raw: point d''insertion introuvable'; END IF;
  EXECUTE def;
END $do$;
REVOKE ALL ON FUNCTION public.fin_gl_raw(uuid) FROM PUBLIC, anon, authenticated;