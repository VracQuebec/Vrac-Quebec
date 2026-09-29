CREATE OR REPLACE FUNCTION public.fin_ensure_occurrences(_company uuid, _from date, _to date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; k int; kmax int; d date; v record; n int := 0; c int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _to < _from THEN RAISE EXCEPTION 'Période invalide'; END IF;
  IF _to - _from > 366*8 THEN RAISE EXCEPTION 'Période limitée'; END IF;
  FOR o IN SELECT * FROM public.fin_obligations WHERE company_id=_company AND status IN ('active','archived') LOOP
    IF o.frequency = 'once' THEN
      IF o.anchor_date BETWEEN _from AND _to AND (o.archived_effective IS NULL OR o.anchor_date < o.archived_effective) THEN
        SELECT * INTO v FROM public.fin_obligation_versions WHERE obligation_id=o.id ORDER BY effective_from DESC, created_at DESC LIMIT 1;
        INSERT INTO public.fin_occurrences(company_id, obligation_id, occ_key, due_date, planned_date, amount, amount_quality, version_id)
        VALUES (_company, o.id, 'once', o.anchor_date, coalesce(o.first_planned_date, o.anchor_date), v.amount, v.amount_quality, v.id)
        ON CONFLICT (company_id, obligation_id, occ_key) DO NOTHING;
        GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
      END IF;
    ELSE
      k := greatest(0, ((extract(year FROM _from)-extract(year FROM o.anchor_date))*12 + extract(month FROM _from)-extract(month FROM o.anchor_date))::int - 1);
      kmax := ((extract(year FROM _to)-extract(year FROM o.anchor_date))*12 + extract(month FROM _to)-extract(month FROM o.anchor_date))::int + 1;
      IF o.max_count IS NOT NULL THEN kmax := least(kmax, o.max_count - 1); END IF;
      WHILE k <= kmax LOOP
        d := public.fin_month_date(o.anchor_date, coalesce(o.month_day, extract(day FROM o.anchor_date)::int), k);
        EXIT WHEN o.end_date IS NOT NULL AND d > o.end_date;
        EXIT WHEN o.archived_effective IS NOT NULL AND d >= o.archived_effective;
        IF d BETWEEN _from AND _to AND d >= o.anchor_date THEN
          SELECT * INTO v FROM public.fin_obligation_versions WHERE obligation_id=o.id AND effective_from<=d ORDER BY effective_from DESC, created_at DESC LIMIT 1;
          INSERT INTO public.fin_occurrences(company_id, obligation_id, occ_key, due_date, planned_date, amount, amount_quality, version_id)
          VALUES (_company, o.id, to_char(d,'YYYY-MM'), d, d, v.amount, v.amount_quality, v.id)
          ON CONFLICT (company_id, obligation_id, occ_key) DO NOTHING;
          GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
        END IF;
        k := k + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN n;
END $$;