CREATE OR REPLACE FUNCTION public.fin_bills_overview(_company uuid, _f jsonb, _limit integer, _offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE res jsonb; tot jsonb; n int; cr jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  WITH base AS (
    SELECT b.id, b.supplier_id, c.name AS supplier, b.reference, b.doc_date, b.due_date, b.status, b.total, p.paid, p.credited,
      CASE WHEN b.status = 'confirmed' THEN greatest(b.total - p.paid - p.credited, 0) END AS rest,
      CASE WHEN b.status = 'confirmed' THEN greatest(p.paid + p.credited - b.total, 0) END AS overpaid,
      coalesce(oc.due_unknown, b.due_date IS NULL) AS due_unknown, CASE WHEN oc.due_unknown THEN NULL ELSE oc.due_date END AS occ_due,
      b.tax_status, b.replaced_estimate AS replaced, b.estimate_amount AS estimate, b.occurrence_id, b.file_id, b.created_at, b.updated_at
    FROM public.fin_supplier_bills b JOIN public.ent_crm_clients c ON c.id = b.supplier_id
    LEFT JOIN public.fin_occurrences oc ON oc.id = b.occurrence_id
    CROSS JOIN LATERAL (SELECT CASE WHEN b.occurrence_id IS NOT NULL THEN public.fin_occ_paid(b.occurrence_id) ELSE 0 END AS paid,
                               CASE WHEN b.status = 'confirmed' THEN public.fin_bill_credited(b.id) ELSE 0 END AS credited) p
    WHERE b.company_id = _company
      AND (nullif(_f->>'supplier_id','') IS NULL OR b.supplier_id = (_f->>'supplier_id')::uuid)
      AND (CASE coalesce(_f->>'status','active') WHEN 'all' THEN true WHEN 'active' THEN b.status <> 'void' ELSE b.status = _f->>'status' END)
      AND (nullif(_f->>'q','') IS NULL OR c.name ILIKE '%'||(_f->>'q')||'%' OR b.reference ILIKE '%'||(_f->>'q')||'%')
  ), agg AS (
    SELECT count(*)::int AS n, jsonb_build_object('count', count(*),
      'confirmed_total', coalesce(sum(total) FILTER (WHERE status='confirmed'),0),
      'paid', coalesce(sum(paid) FILTER (WHERE status='confirmed'),0),
      'credited', coalesce(sum(credited) FILTER (WHERE status='confirmed'),0),
      'rest', coalesce(sum(rest) FILTER (WHERE status='confirmed'),0),
      'rest_due_known', coalesce(sum(rest) FILTER (WHERE status='confirmed' AND NOT due_unknown),0),
      'rest_due_unknown', coalesce(sum(rest) FILTER (WHERE status='confirmed' AND due_unknown),0),
      'overpaid', coalesce(sum(overpaid) FILTER (WHERE status='confirmed'),0),
      'drafts', count(*) FILTER (WHERE status='draft'),
      'tax_incomplete', count(*) FILTER (WHERE status<>'void' AND tax_status='a_completer')) AS t FROM base
  ), pg AS (SELECT * FROM base ORDER BY created_at DESC, id LIMIT greatest(least(coalesce(_limit,25),200),1) OFFSET greatest(coalesce(_offset,0),0))
  SELECT agg.n, agg.t, (SELECT coalesce(jsonb_agg(to_jsonb(pg) ORDER BY pg.created_at DESC, pg.id), '[]') FROM pg) INTO n, tot, res FROM agg;
  SELECT jsonb_build_object('credit_confirmed', coalesce(sum(s.total),0), 'credit_available', coalesce(sum(public.fin_scr_avail(s.id)),0), 'credit_count', count(*))
    INTO cr FROM public.fin_supplier_credits s
   WHERE s.company_id = _company AND s.status = 'confirmed' AND (nullif(_f->>'supplier_id','') IS NULL OR s.supplier_id = (_f->>'supplier_id')::uuid);
  RETURN jsonb_build_object('rows', res, 'totals', tot || cr, 'total', n);
END $function$;