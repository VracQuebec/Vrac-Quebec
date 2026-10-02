CREATE OR REPLACE FUNCTION public.fin_list(_company uuid, _from date, _to date, _base text DEFAULT 'due'::text, _f jsonb DEFAULT '{}'::jsonb, _sort text DEFAULT 'date_asc'::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rows jsonb; total int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_ensure_occurrences(_company, _from - 400, _to + 400);
  SELECT count(*) INTO total FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb));
  -- FIN-12D1 : due_unknown exposé à l'affichage (échéance inconnue jamais présentée comme une date)
  SELECT coalesce(jsonb_agg((to_jsonb(s) - 'rn') || jsonb_build_object('due_unknown', coalesce((SELECT oc.due_unknown FROM public.fin_occurrences oc WHERE oc.id = s.id), false)) ORDER BY s.rn), '[]') INTO rows FROM (
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