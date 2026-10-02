CREATE OR REPLACE FUNCTION public.fin_exp_receipt_uses(_line public.fin_exp_lines) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(u), '[]') FROM (
    SELECT jsonb_build_object('kind', 'note', 'report_id', r.id, 'status', r.status, 'employee', r.employee_name, 'amount', x.accepted_amount) u
      FROM public.fin_exp_lines x JOIN public.fin_exp_reports r ON r.id = x.report_id
     WHERE x.company_id = _line.company_id AND x.report_id <> _line.report_id AND r.status = 'approuvee' AND coalesce(x.accepted_amount,0) > 0
       AND ((_line.receipt_sha IS NOT NULL AND x.receipt_sha = _line.receipt_sha) OR (_line.file_id IS NOT NULL AND x.file_id = _line.file_id) OR (_line.crm_file_id IS NOT NULL AND x.crm_file_id = _line.crm_file_id))
    UNION ALL
    SELECT jsonb_build_object('kind', 'achat', 'bill_id', b.id, 'status', b.status, 'reference', b.reference, 'amount', b.total)
      FROM public.fin_supplier_bills b
     WHERE b.company_id = _line.company_id AND b.status IN ('draft','confirmed') AND b.id IS DISTINCT FROM _line.supplier_bill_id
       AND ((_line.receipt_sha IS NOT NULL AND b.file_sha256 = _line.receipt_sha) OR (_line.crm_file_id IS NOT NULL AND b.file_id = _line.crm_file_id))
  ) s $$;
REVOKE ALL ON FUNCTION public.fin_exp_receipt_uses(public.fin_exp_lines) FROM PUBLIC, anon, authenticated;