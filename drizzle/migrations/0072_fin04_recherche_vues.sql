CREATE OR REPLACE FUNCTION public.fin_fold(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public' AS $$
  SELECT lower(translate(coalesce(t,''), 'ÀÂÄÁÃÉÈÊËÎÏÍÌÔÖÓÒÕÙÛÜÚÇàâäáãéèêëîïíìôöóòõùûüúçÿŸœŒ', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuucyYoO'))
$$;

CREATE OR REPLACE FUNCTION public.fin_select(_company uuid, _from date, _to date, _base text, _f jsonb)
 RETURNS TABLE(id uuid, obligation_id uuid, due_date date, planned_date date, ref_date date, amount numeric, amount_quality text, status text, cancel_reason text, amount_override boolean, planned_override boolean, label text, payee text, category_id uuid, category text, frequency text, truck_id uuid, project_id uuid, nature text, interval_n integer, seasonal boolean, planned_reason text, occ_key text, payee_key text, paid numeric, balance numeric, settle text, late boolean, rule_frequency text, rule_interval integer, rule_known boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM (
  SELECT oc.id, oc.obligation_id, oc.due_date, oc.planned_date,
    CASE WHEN _base='planned' THEN oc.planned_date ELSE oc.due_date END,
    oc.amount, oc.amount_quality, oc.status, oc.cancel_reason, oc.amount_override, oc.planned_override,
    ob.label, coalesce(cl.name, ob.payee_label), ob.category_id, cat.name, ob.frequency, ob.truck_id, ob.project_id, ob.nature,
    ob.interval_n, jsonb_array_length(ob.seasons) > 0, oc.planned_reason, oc.occ_key,
    public.fin_payee_key(ob), pd.paid,
    CASE WHEN oc.amount_quality='unknown' THEN NULL ELSE greatest(oc.amount - pd.paid, 0) END,
    st.s,
    (st.s IN ('non_reglee','partielle') AND oc.due_date < current_date),
    rf.f, rf.n, rf.f IS NOT NULL
  FROM public.fin_occurrences oc
  JOIN public.fin_obligations ob ON ob.id=oc.obligation_id AND ob.company_id=oc.company_id
  LEFT JOIN public.ent_crm_clients cl ON cl.id=ob.payee_client_id AND cl.company_id=ob.company_id
  LEFT JOIN public.fin_categories cat ON cat.id=ob.category_id AND cat.company_id=ob.company_id
  CROSS JOIN (SELECT public.fin_settle_since(_company) AS since) sn
  CROSS JOIN LATERAL (SELECT coalesce(sum(al.amount),0)::numeric AS paid FROM public.fin_allocations al JOIN public.fin_payments p ON p.id=al.payment_id AND p.status='validated'
                      WHERE al.occurrence_id=oc.id AND al.reversed_at IS NULL) pd
  CROSS JOIN LATERAL (SELECT CASE WHEN oc.status='cancelled' THEN 'annulee' WHEN oc.amount_quality='unknown' THEN 'a_completer' WHEN oc.amount=0 THEN 'aucun'
                      WHEN pd.paid >= oc.amount THEN 'reglee' WHEN pd.paid > 0 THEN 'partielle'
                      WHEN oc.due_date < sn.since AND oc.settle_confirmed_at IS NULL THEN 'a_confirmer' ELSE 'non_reglee' END AS s) st
  CROSS JOIN LATERAL (SELECT coalesce(substring(oc.occ_key from '@g([0-9]+)$')::int, 1) AS g) gg
  LEFT JOIN LATERAL (SELECT CASE WHEN gg.g = ob.rule_gen THEN ob.frequency ELSE r.snapshot->>'frequency' END AS f,
                            CASE WHEN gg.g = ob.rule_gen THEN ob.interval_n ELSE coalesce(nullif(r.snapshot->>'interval_n','')::int,1) END AS n
                     FROM (SELECT 1) one LEFT JOIN public.fin_obligation_rules r ON r.obligation_id=ob.id AND r.rule_gen=gg.g) rf ON true
  WHERE oc.company_id=_company AND public.fin_can_read(_company)
    AND (CASE WHEN _base='planned' THEN oc.planned_date ELSE oc.due_date END) BETWEEN _from AND _to
    AND (coalesce(_f->>'status','active')='all' OR oc.status=coalesce(_f->>'status','active'))
    AND (_f->>'quality' IS NULL OR (_f->>'quality'='zero' AND oc.amount=0 AND oc.amount_quality<>'unknown') OR oc.amount_quality=_f->>'quality')
    AND (_f->>'frequency' IS NULL OR ob.frequency=_f->>'frequency')
    AND (_f->>'seasonal' IS NULL OR (jsonb_array_length(ob.seasons) > 0) = ((_f->>'seasonal')='1'))
    AND (_f->>'category_id' IS NULL OR ob.category_id=(_f->>'category_id')::uuid)
    AND (_f->>'truck_id' IS NULL OR ob.truck_id=(_f->>'truck_id')::uuid)
    AND (_f->>'project_id' IS NULL OR ob.project_id=(_f->>'project_id')::uuid)
    AND (_f->>'payee' IS NULL OR coalesce(cl.name, ob.payee_label) ILIKE '%'||(_f->>'payee')||'%')
    AND (_f->>'payee_key' IS NULL OR public.fin_payee_key(ob)=_f->>'payee_key')
    AND (_f->>'q' IS NULL OR public.fin_fold(concat_ws(' ', ob.label, cl.name, ob.payee_label, ob.contract_ref, ob.notes)) LIKE '%'||public.fin_fold(_f->>'q')||'%'
         OR EXISTS (SELECT 1 FROM public.fin_allocations al JOIN public.fin_payments p ON p.id=al.payment_id
                    LEFT JOIN public.fin_payment_files pf ON pf.payment_id=p.id LEFT JOIN public.ent_crm_files ef ON ef.id=pf.file_id AND ef.company_id=p.company_id
                    WHERE al.occurrence_id=oc.id AND al.reversed_at IS NULL
                      AND public.fin_fold(concat_ws(' ', p.reference, p.note, p.source_label, ef.file_name)) LIKE '%'||public.fin_fold(_f->>'q')||'%'))
    AND (_f->'category_ids' IS NULL OR jsonb_array_length(_f->'category_ids')=0
         OR ob.category_id::text IN (SELECT jsonb_array_elements_text(_f->'category_ids'))
         OR (ob.category_id IS NULL AND (_f->'category_ids') ? 'none'))
    AND (_f->'natures' IS NULL OR jsonb_array_length(_f->'natures')=0 OR ob.nature IN (SELECT jsonb_array_elements_text(_f->'natures')))
    AND (_f->>'recurring' IS NULL OR (ob.frequency<>'once') = ((_f->>'recurring')='1'))
    AND (_f->>'series' IS NULL OR (ob.status='archived') = ((_f->>'series')='archived'))
    AND (_f->>'amount_min' IS NULL OR oc.amount >= (_f->>'amount_min')::numeric)
    AND (_f->>'amount_max' IS NULL OR oc.amount <= (_f->>'amount_max')::numeric)
    AND (_f->>'pay_file' IS NULL OR (CASE WHEN (_f->>'pay_file')='1'
           THEN EXISTS (SELECT 1 FROM public.fin_allocations al JOIN public.fin_payments p ON p.id=al.payment_id AND p.status='validated' JOIN public.fin_payment_files pf ON pf.payment_id=p.id WHERE al.occurrence_id=oc.id AND al.reversed_at IS NULL)
           ELSE EXISTS (SELECT 1 FROM public.fin_allocations al JOIN public.fin_payments p ON p.id=al.payment_id AND p.status='validated' WHERE al.occurrence_id=oc.id AND al.reversed_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.fin_payment_files pf WHERE pf.payment_id=p.id)) END))
    AND (_f->>'method' IS NULL AND _f->>'paid_from' IS NULL AND _f->>'paid_to' IS NULL OR EXISTS (
         SELECT 1 FROM public.fin_allocations al JOIN public.fin_payments p ON p.id=al.payment_id AND p.status='validated'
          WHERE al.occurrence_id=oc.id AND al.reversed_at IS NULL AND (_f->>'method' IS NULL OR p.method=_f->>'method')
            AND (_f->>'paid_from' IS NULL OR p.paid_on >= (_f->>'paid_from')::date) AND (_f->>'paid_to' IS NULL OR p.paid_on <= (_f->>'paid_to')::date)))
  ) x(id, obligation_id, due_date, planned_date, ref_date, amount, amount_quality, status, cancel_reason, amount_override, planned_override, label, payee, category_id, category, frequency, truck_id, project_id, nature, interval_n, seasonal, planned_reason, occ_key, payee_key, paid, balance, settle, late, rule_frequency, rule_interval, rule_known)
  WHERE (_f->>'settle' IS NULL OR x.settle=_f->>'settle' OR (_f->>'settle'='late' AND x.late))
    AND (_f->'settles' IS NULL OR jsonb_array_length(_f->'settles')=0 OR x.settle IN (SELECT jsonb_array_elements_text(_f->'settles')))
    AND (_f->>'late' IS NULL OR x.late = ((_f->>'late')='1'))
    AND (_f->>'balance_min' IS NULL OR x.balance >= (_f->>'balance_min')::numeric)
    AND (_f->>'balance_max' IS NULL OR x.balance <= (_f->>'balance_max')::numeric)
$function$;

CREATE OR REPLACE FUNCTION public.fin_list(_company uuid, _from date, _to date, _base text DEFAULT 'due'::text, _f jsonb DEFAULT '{}'::jsonb, _sort text DEFAULT 'date_asc'::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rows jsonb; total int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_ensure_occurrences(_company, _from - 400, _to + 400);
  SELECT count(*) INTO total FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb));
  SELECT coalesce(jsonb_agg(to_jsonb(s) - 'rn' ORDER BY s.rn), '[]') INTO rows FROM (
    SELECT x.*, row_number() OVER (ORDER BY
             CASE WHEN _sort='date_asc' THEN x.ref_date END ASC, CASE WHEN _sort='date_desc' THEN x.ref_date END DESC,
             CASE WHEN _sort='planned_asc' THEN x.planned_date END ASC, CASE WHEN _sort='planned_desc' THEN x.planned_date END DESC,
             CASE WHEN _sort IN ('amount_desc','amount_asc','balance_desc') THEN (x.amount IS NULL OR x.amount_quality='unknown') END ASC,
             CASE WHEN _sort='amount_desc' THEN x.amount END DESC, CASE WHEN _sort='amount_asc' THEN x.amount END ASC,
             CASE WHEN _sort='balance_desc' THEN x.balance END DESC NULLS LAST,
             CASE WHEN _sort='payee_asc' THEN public.fin_fold(coalesce(x.payee, x.label)) END ASC,
             CASE WHEN _sort='late_first' THEN x.late END DESC,
             x.ref_date, x.label, x.id) AS rn
    FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb)) x
    ORDER BY rn
    LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) s;
  RETURN jsonb_build_object('rows', rows, 'total', total);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_pay_select(_company uuid, _from date, _to date, _f jsonb)
 RETURNS TABLE(id uuid, payee_name text, payee_key text, amount numeric, paid_on date, entered_on date, method text, reference text, source_label text, status text,
               allocated numeric, available numeric, refunded numeric, files bigint, scoped boolean, selected numeric, created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH sc AS (SELECT (coalesce(jsonb_array_length(_f->'category_ids'),0) > 0 OR _f->>'project_id' IS NOT NULL OR _f->>'truck_id' IS NOT NULL) AS on_)
  SELECT * FROM (
    SELECT p.id, p.payee_name, p.payee_key, p.amount, p.paid_on, (p.entered_at AT TIME ZONE 'America/Toronto')::date, p.method, p.reference, p.source_label, p.status,
      coalesce(a.tot,0), CASE WHEN p.status='validated' THEN public.fin_payment_avail(p.id) ELSE 0 END, coalesce(r.tot,0),
      (SELECT count(*) FROM public.fin_payment_files f WHERE f.payment_id=p.id), sc.on_,
      CASE WHEN sc.on_ THEN coalesce(a.sel,0) ELSE p.amount END, p.created_at
    FROM public.fin_payments p CROSS JOIN sc
    LEFT JOIN LATERAL (SELECT sum(al.amount) tot,
         sum(al.amount) FILTER (WHERE (coalesce(jsonb_array_length(_f->'category_ids'),0)=0 OR ob.category_id::text IN (SELECT jsonb_array_elements_text(_f->'category_ids')) OR (ob.category_id IS NULL AND (_f->'category_ids') ? 'none'))
                                  AND (_f->>'project_id' IS NULL OR ob.project_id=(_f->>'project_id')::uuid) AND (_f->>'truck_id' IS NULL OR ob.truck_id=(_f->>'truck_id')::uuid)) sel,
         string_agg(ob.label, ' ') labels
       FROM public.fin_allocations al JOIN public.fin_occurrences oc ON oc.id=al.occurrence_id JOIN public.fin_obligations ob ON ob.id=oc.obligation_id
       WHERE al.payment_id=p.id AND al.reversed_at IS NULL) a ON true
    LEFT JOIN LATERAL (SELECT sum(rf.amount) tot FROM public.fin_refunds rf WHERE rf.payment_id=p.id AND rf.voided_at IS NULL) r ON true
    WHERE p.company_id=_company AND public.fin_can_read(_company)
      AND (CASE WHEN _f->>'date_base'='entered' THEN (p.entered_at AT TIME ZONE 'America/Toronto')::date ELSE p.paid_on END) BETWEEN _from AND _to
      AND (_f->'methods' IS NULL OR jsonb_array_length(_f->'methods')=0 OR p.method IN (SELECT jsonb_array_elements_text(_f->'methods')))
      AND (_f->>'method' IS NULL OR p.method=_f->>'method')
      AND (_f->>'pstatus' IS NULL OR p.status=_f->>'pstatus' OR (_f->>'pstatus'='refunded' AND coalesce(r.tot,0) > 0))
      AND (_f->>'payee' IS NULL OR public.fin_fold(p.payee_name) LIKE '%'||public.fin_fold(_f->>'payee')||'%')
      AND (_f->>'reference' IS NULL OR public.fin_fold(p.reference) LIKE '%'||public.fin_fold(_f->>'reference')||'%')
      AND (_f->>'account' IS NULL OR public.fin_fold(p.source_label) LIKE '%'||public.fin_fold(_f->>'account')||'%')
      AND (_f->>'amount_min' IS NULL OR p.amount >= (_f->>'amount_min')::numeric)
      AND (_f->>'amount_max' IS NULL OR p.amount <= (_f->>'amount_max')::numeric)
      AND (_f->>'q' IS NULL OR public.fin_fold(concat_ws(' ', p.payee_name, p.reference, p.note, p.source_label, a.labels,
             (SELECT string_agg(ef.file_name,' ') FROM public.fin_payment_files pf JOIN public.ent_crm_files ef ON ef.id=pf.file_id AND ef.company_id=p.company_id WHERE pf.payment_id=p.id)))
           LIKE '%'||public.fin_fold(_f->>'q')||'%')
      AND (NOT sc.on_ OR coalesce(a.sel,0) > 0)
  ) z(id, payee_name, payee_key, amount, paid_on, entered_on, method, reference, source_label, status, allocated, available, refunded, files, scoped, selected, created_at)
  WHERE (_f->>'has_file' IS NULL OR (z.files > 0) = ((_f->>'has_file')='1'))
    AND (_f->>'unallocated' IS NULL OR (z.available > 0) = ((_f->>'unallocated')='1'))
$function$;

CREATE OR REPLACE FUNCTION public.fin_payments_search(_company uuid, _from date, _to date, _f jsonb DEFAULT '{}'::jsonb, _sort text DEFAULT 'paid_desc', _limit int DEFAULT 25, _offset int DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rows jsonb; t jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('count', count(*),
      'declared', coalesce(sum(amount) FILTER (WHERE status='validated'),0), 'declared_count', count(*) FILTER (WHERE status='validated'),
      'selected', coalesce(sum(selected) FILTER (WHERE status='validated'),0), 'scoped', coalesce(bool_or(scoped),false),
      'refunds', coalesce(sum(refunded) FILTER (WHERE status='validated'),0),
      'returned', coalesce(sum(amount) FILTER (WHERE status='returned'),0), 'returned_count', count(*) FILTER (WHERE status='returned'),
      'voided_count', count(*) FILTER (WHERE status='voided'), 'drafts', count(*) FILTER (WHERE status='draft'),
      'unallocated', coalesce(sum(available) FILTER (WHERE status='validated'),0), 'unallocated_count', count(*) FILTER (WHERE status='validated' AND available > 0),
      'no_file_count', count(*) FILTER (WHERE status='validated' AND files=0))
    INTO t FROM public.fin_pay_select(_company, _from, _to, coalesce(_f,'{}'::jsonb));
  t := t || jsonb_build_object('net', (t->>'declared')::numeric - (t->>'refunds')::numeric, 'from', _from, 'to', _to, 'date_base', coalesce(_f->>'date_base','paid'));
  SELECT coalesce(jsonb_agg(to_jsonb(s) - 'rn' ORDER BY s.rn),'[]') INTO rows FROM (
    SELECT z.*, row_number() OVER (ORDER BY
        CASE WHEN _sort='paid_asc' THEN z.paid_on END ASC, CASE WHEN _sort='paid_desc' THEN z.paid_on END DESC,
        CASE WHEN _sort='entered_desc' THEN z.entered_on END DESC,
        CASE WHEN _sort='amount_desc' THEN z.amount END DESC, CASE WHEN _sort='amount_asc' THEN z.amount END ASC,
        CASE WHEN _sort='available_desc' THEN z.available END DESC,
        CASE WHEN _sort='payee_asc' THEN public.fin_fold(z.payee_name) END ASC,
        z.paid_on DESC, z.created_at DESC, z.id) rn
    FROM public.fin_pay_select(_company, _from, _to, coalesce(_f,'{}'::jsonb)) z
    ORDER BY rn LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) s;
  RETURN jsonb_build_object('rows', rows, 'total', (t->>'count')::int, 'totals', t);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_allocations_export(_company uuid, _from date, _to date, _f jsonb DEFAULT '{}'::jsonb, _limit int DEFAULT 500, _offset int DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rows jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.paid_on DESC, s.payment_id, s.due_date, s.allocation_id),'[]') INTO rows FROM (
    SELECT al.id allocation_id, z.id payment_id, z.paid_on, z.payee_name, oc.id occurrence_id, ob.id obligation_id, ob.label, cat.name category, oc.due_date, al.amount,
      ((coalesce(jsonb_array_length(_f->'category_ids'),0)=0 OR ob.category_id::text IN (SELECT jsonb_array_elements_text(_f->'category_ids')) OR (ob.category_id IS NULL AND (_f->'category_ids') ? 'none'))
        AND (_f->>'project_id' IS NULL OR ob.project_id=(_f->>'project_id')::uuid) AND (_f->>'truck_id' IS NULL OR ob.truck_id=(_f->>'truck_id')::uuid)) in_selection
    FROM public.fin_pay_select(_company, _from, _to, coalesce(_f,'{}'::jsonb)) z
    JOIN public.fin_allocations al ON al.payment_id=z.id AND al.reversed_at IS NULL
    JOIN public.fin_occurrences oc ON oc.id=al.occurrence_id JOIN public.fin_obligations ob ON ob.id=oc.obligation_id
    LEFT JOIN public.fin_categories cat ON cat.id=ob.category_id
    WHERE z.status='validated'
    ORDER BY z.paid_on DESC, z.id, oc.due_date, al.id
    LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) s;
  RETURN rows;
END $function$;

REVOKE ALL ON FUNCTION public.fin_pay_select(uuid,date,date,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_payments_search(uuid,date,date,jsonb,text,int,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_allocations_export(uuid,date,date,jsonb,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_pay_select(uuid,date,date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_payments_search(uuid,date,date,jsonb,text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_allocations_export(uuid,date,date,jsonb,int,int) TO authenticated;

CREATE TABLE public.fin_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  context text NOT NULL CHECK (context IN ('occ','pay')),
  shared boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_saved_views_company ON public.fin_saved_views(company_id, user_id);
CREATE UNIQUE INDEX fin_saved_views_one_default ON public.fin_saved_views(company_id, user_id, context) WHERE is_default;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_saved_views TO authenticated;
GRANT ALL ON public.fin_saved_views TO service_role;
ALTER TABLE public.fin_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsv_read" ON public.fin_saved_views FOR SELECT TO authenticated
  USING (public.fin_can_read(company_id) AND (user_id = auth.uid() OR shared));
CREATE POLICY "fsv_insert" ON public.fin_saved_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.fin_can_write(company_id) AND (NOT shared OR public.fin_can_correct(company_id)));
CREATE POLICY "fsv_update" ON public.fin_saved_views FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.fin_can_write(company_id))
  WITH CHECK (user_id = auth.uid() AND public.fin_can_write(company_id) AND (NOT shared OR public.fin_can_correct(company_id)));
CREATE POLICY "fsv_delete" ON public.fin_saved_views FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.fin_can_write(company_id));