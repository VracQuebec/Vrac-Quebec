CREATE OR REPLACE FUNCTION public.fin_period_totals(_company uuid, _from date, _to date, _base text DEFAULT 'due'::text, _f jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; d jsonb; u jsonb; k jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_ensure_occurrences(_company, _from - 400, _to + 400);
  SELECT jsonb_build_object(
    'confirmed', coalesce(sum(amount) FILTER (WHERE status='active' AND amount_quality='confirmed'),0),
    'estimated', coalesce(sum(amount) FILTER (WHERE status='active' AND amount_quality='estimated'),0),
    'known', coalesce(sum(amount) FILTER (WHERE status='active' AND amount_quality<>'unknown'),0),
    'unknown_count', count(*) FILTER (WHERE status='active' AND amount_quality='unknown'),
    'count', count(*), 'from', _from, 'to', _to, 'base', _base,
    'remaining', coalesce(sum(balance) FILTER (WHERE status='active' AND settle IN ('non_reglee','partielle','a_confirmer')),0),
    'remaining_estimated', coalesce(sum(balance) FILTER (WHERE status='active' AND amount_quality='estimated' AND settle IN ('non_reglee','partielle','a_confirmer')),0),
    'to_confirm_amount', coalesce(sum(balance) FILTER (WHERE status='active' AND settle='a_confirmer'),0),
    'paid_on_these', coalesce(sum(paid) FILTER (WHERE status='active'),0),
    'late_count', count(*) FILTER (WHERE late), 'late_amount', coalesce(sum(balance) FILTER (WHERE late),0),
    'by_settle', jsonb_build_object('non_reglee', count(*) FILTER (WHERE settle='non_reglee'), 'partielle', count(*) FILTER (WHERE settle='partielle'),
       'reglee', count(*) FILTER (WHERE settle='reglee'), 'a_confirmer', count(*) FILTER (WHERE settle='a_confirmer'),
       'a_completer', count(*) FILTER (WHERE settle='a_completer'), 'aucun', count(*) FILTER (WHERE settle='aucun')))
  INTO r FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb));
  SELECT jsonb_build_object('declared', coalesce(sum(amount),0), 'declared_count', count(*),
     'declared_by_method', coalesce((SELECT jsonb_object_agg(method, s) FROM (SELECT method, sum(amount) s FROM public.fin_payments
         WHERE company_id=_company AND status='validated' AND paid_on BETWEEN _from AND _to AND (_f->>'method' IS NULL OR method=_f->>'method') GROUP BY method) z),'{}'::jsonb),
     'refunds', coalesce((SELECT sum(rf.amount) FROM public.fin_refunds rf JOIN public.fin_payments p ON p.id=rf.payment_id WHERE rf.company_id=_company AND rf.voided_at IS NULL AND rf.refunded_on BETWEEN _from AND _to AND p.status='validated'),0),
     'credit_refunds', coalesce((SELECT sum(cr.amount) FROM public.fin_supplier_credit_refunds cr WHERE cr.company_id=_company AND cr.voided_at IS NULL AND cr.refunded_on BETWEEN _from AND _to),0),
     'returned', coalesce((SELECT sum(amount) FROM public.fin_payments WHERE company_id=_company AND status='returned' AND paid_on BETWEEN _from AND _to),0),
     'drafts', (SELECT count(*) FROM public.fin_payments WHERE company_id=_company AND status='draft'))
    INTO d FROM public.fin_payments WHERE company_id=_company AND status='validated' AND paid_on BETWEEN _from AND _to AND (_f->>'method' IS NULL OR method=_f->>'method');
  SELECT jsonb_build_object('unallocated', coalesce(sum(av),0), 'unallocated_count', count(*)) INTO u
    FROM (SELECT public.fin_payment_avail(id) av FROM public.fin_payments WHERE company_id=_company AND status='validated') z WHERE av > 0;
  SELECT jsonb_build_object('due_unknown_remaining', coalesce(sum(balance) FILTER (WHERE status='active' AND settle IN ('non_reglee','partielle','a_confirmer')),0), 'due_unknown_count', count(*) FILTER (WHERE status='active' AND settle IN ('non_reglee','partielle','a_confirmer'))) INTO k FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb) || '{"due_unknown":"only"}'::jsonb); RETURN r || d || u || k;
END $function$;