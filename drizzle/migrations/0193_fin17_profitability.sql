CREATE OR REPLACE FUNCTION public.fin_project_profitability(_company uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN RAISE EXCEPTION 'Période invalide' USING ERRCODE = '22023'; END IF;
  WITH inv AS (
    SELECT i.project_id, sum(coalesce(i.subtotal,0)) billed_ht, sum(coalesce(i.total,0)) billed_ttc,
           sum((public.fin_invoice_balance(i.id)->>'received')::numeric) collected,
           sum((public.fin_invoice_balance(i.id)->>'credits')::numeric) credits
      FROM fin_invoices i WHERE i.company_id = _company AND i.status = 'emise' AND i.issue_date BETWEEN _from AND _to GROUP BY 1),
  bil AS (
    SELECT b.project_id, sum(CASE WHEN b.status = 'confirmed' THEN coalesce(b.subtotal,0) ELSE 0 END) costs_known,
           sum(CASE WHEN b.status = 'draft' THEN coalesce(b.estimate_amount, b.subtotal, 0) ELSE 0 END) costs_estimated,
           count(*) FILTER (WHERE b.status = 'confirmed' AND b.subtotal IS NULL) costs_missing
      FROM fin_supplier_bills b WHERE b.company_id = _company AND b.doc_date BETWEEN _from AND _to GROUP BY 1),
  exl AS (
    SELECT l.project_id, sum(coalesce(l.accepted_amount,0) - coalesce(l.gst,0) - coalesce(l.qst,0)) FILTER (WHERE r.status = 'approuvee' AND l.supplier_bill_id IS NULL) exp_known,
           sum(coalesce(l.business_amount,0)) FILTER (WHERE r.status <> 'approuvee' AND l.supplier_bill_id IS NULL) exp_pending
      FROM fin_exp_lines l JOIN fin_exp_reports r ON r.id = l.report_id WHERE l.company_id = _company AND l.spent_on BETWEEN _from AND _to GROUP BY 1),
  keys AS (SELECT project_id FROM inv UNION SELECT project_id FROM bil UNION SELECT project_id FROM exl)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'project_id', k.project_id, 'name', coalesce(p.name, CASE WHEN k.project_id IS NULL THEN 'Sans chantier' ELSE 'Chantier' END),
      'billed_ht', coalesce(inv.billed_ht,0), 'credits', coalesce(inv.credits,0), 'collected', coalesce(inv.collected,0),
      'costs_known', coalesce(bil.costs_known,0) + coalesce(exl.exp_known,0),
      'costs_estimated', coalesce(bil.costs_estimated,0) + coalesce(exl.exp_pending,0),
      'costs_missing', coalesce(bil.costs_missing,0),
      'margin_known', coalesce(inv.billed_ht,0) - coalesce(bil.costs_known,0) - coalesce(exl.exp_known,0)
    ) ORDER BY k.project_id IS NULL, p.name), '[]') INTO rows
  FROM keys k LEFT JOIN inv ON inv.project_id IS NOT DISTINCT FROM k.project_id LEFT JOIN bil ON bil.project_id IS NOT DISTINCT FROM k.project_id
   LEFT JOIN exl ON exl.project_id IS NOT DISTINCT FROM k.project_id LEFT JOIN ent_crm_projects p ON p.id = k.project_id AND p.company_id = _company;
  RETURN jsonb_build_object('from', _from, 'to', _to, 'currency', 'CAD', 'rows', rows);
END $$;
REVOKE ALL ON FUNCTION public.fin_project_profitability(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_project_profitability(uuid, date, date) TO authenticated;