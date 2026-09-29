CREATE OR REPLACE FUNCTION public.fin_save_obligation(_company uuid, _id uuid, _p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; oid uuid; q text := coalesce(_p->>'amount_quality','unknown'); amt numeric := nullif(_p->>'amount','')::numeric; bef jsonb;
  f text := coalesce(_p->>'frequency','once'); anc date; sch jsonb;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_p->>'label'),'') = '' THEN RAISE EXCEPTION 'Libellé requis'; END IF;
  IF f='schedule' THEN q := 'confirmed'; amt := 0; END IF;
  IF q NOT IN ('confirmed','estimated','unknown') THEN RAISE EXCEPTION 'Qualité de montant invalide'; END IF;
  IF q='unknown' THEN amt := NULL; ELSIF amt IS NULL THEN RAISE EXCEPTION 'Montant requis (ou choisir « à compléter »)'; END IF;
  IF amt < 0 THEN RAISE EXCEPTION 'Montant négatif refusé'; END IF;
  PERFORM public.fin_check_links(_company, _p);
  IF f='schedule' THEN
    SELECT jsonb_agg(x || jsonb_build_object('id', coalesce(nullif(x->>'id',''), gen_random_uuid()::text))) INTO sch FROM jsonb_array_elements(coalesce(_p->'schedule','[]'::jsonb)) x;
    _p := _p || jsonb_build_object('schedule', coalesce(sch,'[]'::jsonb));
    SELECT min((x->>'date')::date) INTO anc FROM jsonb_array_elements(_p->'schedule') x;
    _p := _p || jsonb_build_object('anchor_date', anc);
  END IF;
  IF _id IS NULL OR (SELECT status FROM public.fin_obligations WHERE id=_id)='draft' THEN PERFORM public.fin_validate_rule(_p); END IF;
  IF _id IS NULL THEN
    INSERT INTO public.fin_obligations(company_id,label,payee_client_id,payee_label,category_id,nature,frequency,anchor_date,first_planned_date,month_day,end_date,max_count,contract_ref,notes,service_start,service_end,renewal_date,notice_date,owner_user_id,payment_method,autopay_declared,truck_id,project_id,document_id,status,created_by,
      interval_n, weekdays, month_day2, collision_policy, feb29_policy, short_month_policy, seasons, planned_shift, schedule, renewal_frequency)
    VALUES (_company, btrim(_p->>'label'), (_p->>'payee_client_id')::uuid, nullif(btrim(_p->>'payee_label'),''), (_p->>'category_id')::uuid, coalesce(_p->>'nature','charge'),
      f, (_p->>'anchor_date')::date, (_p->>'first_planned_date')::date,
      CASE WHEN f IN ('monthly','twice_monthly') THEN coalesce(nullif(_p->>'month_day','')::int, extract(day FROM (_p->>'anchor_date')::date)::int) END,
      (_p->>'end_date')::date, nullif(_p->>'max_count','')::int, _p->>'contract_ref', _p->>'notes', (_p->>'service_start')::date, (_p->>'service_end')::date,
      (_p->>'renewal_date')::date, (_p->>'notice_date')::date, (_p->>'owner_user_id')::uuid, _p->>'payment_method', coalesce((_p->>'autopay_declared')::boolean,false),
      (_p->>'truck_id')::uuid, (_p->>'project_id')::uuid, (_p->>'document_id')::uuid, coalesce(_p->>'status','active'), auth.uid(),
      coalesce(nullif(_p->>'interval_n','')::int,1), (SELECT array_agg(x::int) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_p->'weekdays')='array' THEN _p->'weekdays' ELSE '[]' END) x),
      CASE WHEN f='twice_monthly' THEN nullif(_p->>'month_day2','')::int END, CASE WHEN f='twice_monthly' THEN _p->>'collision_policy' END,
      CASE WHEN f='yearly' THEN _p->>'feb29_policy' END, coalesce(_p->>'short_month_policy','last_day'), coalesce(_p->'seasons','[]'::jsonb),
      coalesce(_p->>'planned_shift','none'), CASE WHEN f='schedule' THEN _p->'schedule' END, nullif(_p->>'renewal_frequency',''))
    RETURNING id INTO oid;
    INSERT INTO public.fin_obligation_versions(company_id, obligation_id, effective_from, amount, amount_quality, created_by)
    VALUES (_company, oid, (_p->>'anchor_date')::date, amt, q, auth.uid());
    PERFORM public.fin_log(_company, oid, NULL, 'create', NULL, NULL, _p);
    RETURN oid;
  END IF;
  SELECT * INTO o FROM public.fin_obligations WHERE id=_id AND company_id=_company FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Obligation introuvable' USING ERRCODE='42501'; END IF;
  IF nullif(_p->>'rev','') IS NOT NULL AND (_p->>'rev')::int <> o.rev THEN
    RAISE EXCEPTION 'Conflit : cette obligation a été modifiée par une autre personne. Rechargez pour voir l''état actuel avant de réenregistrer.' USING ERRCODE='P0409';
  END IF;
  bef := to_jsonb(o);
  UPDATE public.fin_obligations SET label=btrim(_p->>'label'), payee_client_id=(_p->>'payee_client_id')::uuid, payee_label=nullif(btrim(_p->>'payee_label'),''),
    category_id=(_p->>'category_id')::uuid, nature=coalesce(_p->>'nature',nature),
    end_date = CASE WHEN o.frequency='schedule' THEN end_date ELSE (_p->>'end_date')::date END, max_count=nullif(_p->>'max_count','')::int,
    contract_ref=_p->>'contract_ref', notes=_p->>'notes', service_start=(_p->>'service_start')::date, service_end=(_p->>'service_end')::date,
    renewal_date=(_p->>'renewal_date')::date, notice_date=(_p->>'notice_date')::date, owner_user_id=(_p->>'owner_user_id')::uuid,
    payment_method=_p->>'payment_method', autopay_declared=coalesce((_p->>'autopay_declared')::boolean,false),
    truck_id=(_p->>'truck_id')::uuid, project_id=(_p->>'project_id')::uuid, document_id=(_p->>'document_id')::uuid, renewal_frequency=nullif(_p->>'renewal_frequency',''),
    anchor_date = CASE WHEN o.status='draft' THEN coalesce((_p->>'anchor_date')::date, anchor_date) ELSE anchor_date END,
    month_day = CASE WHEN o.status='draft' AND o.frequency IN ('monthly','twice_monthly') THEN coalesce(nullif(_p->>'month_day','')::int, extract(day FROM coalesce((_p->>'anchor_date')::date, anchor_date))::int) ELSE month_day END,
    first_planned_date = CASE WHEN o.status='draft' THEN (_p->>'first_planned_date')::date ELSE first_planned_date END,
    status = CASE WHEN o.status='draft' AND _p->>'status'='active' THEN 'active' ELSE status END,
    rev = rev + 1, updated_at=now() WHERE id=_id;
  IF o.status='draft' THEN
    UPDATE public.fin_obligation_versions SET effective_from=coalesce((_p->>'anchor_date')::date, effective_from), amount=amt, amount_quality=q WHERE obligation_id=_id;
  END IF;
  UPDATE public.fin_occurrences oc SET status='cancelled', cancel_reason='Hors de la série modifiée', updated_at=now()
   FROM public.fin_obligations ob WHERE ob.id=_id AND oc.obligation_id=_id AND oc.status='active' AND oc.due_date >= current_date
     AND ob.end_date IS NOT NULL AND oc.due_date > ob.end_date;
  PERFORM public.fin_log(_company, _id, NULL, 'update', NULL, bef, _p);
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.fin_change_rule(_id uuid, _rev int, _p jsonb, _effective date, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; nr jsonb; kept int; canc jsonb; exc int; newd jsonb; q text := coalesce(_p->>'amount_quality','keep'); amt numeric := nullif(_p->>'amount','')::numeric; sch jsonb; nc int;
BEGIN
  SELECT * INTO o FROM public.fin_obligations WHERE id=_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF o.status <> 'active' THEN RAISE EXCEPTION 'Seule une série active peut changer de règle'; END IF;
  IF _rev IS NOT NULL AND _rev <> o.rev THEN RAISE EXCEPTION 'Conflit : cette obligation a été modifiée par une autre personne. Rechargez pour voir l''état actuel.' USING ERRCODE='P0409'; END IF;
  IF _effective IS NULL OR _effective < current_date THEN RAISE EXCEPTION 'Date d''effet requise, aujourd''hui ou plus tard : les échéances passées ne changent pas'; END IF;
  IF (_p->>'frequency')='schedule' THEN
    SELECT jsonb_agg(x || jsonb_build_object('id', coalesce(nullif(x->>'id',''), gen_random_uuid()::text))) INTO sch FROM jsonb_array_elements(coalesce(_p->'schedule','[]'::jsonb)) x;
    _p := _p || jsonb_build_object('schedule', coalesce(sch,'[]'::jsonb), 'anchor_date', (SELECT min((x->>'date')::date) FROM jsonb_array_elements(sch) x));
  END IF;
  nr := public.fin_rule_json(o) || public.fin_rule_fields(_p) || jsonb_build_object('anchor_date', coalesce(nullif(_p->>'anchor_date',''), o.anchor_date::text),
        'end_date', nullif(_p->>'end_date',''), 'max_count', nullif(_p->>'max_count',''), 'rule_from', _effective, 'rule_gen', o.rule_gen + 1, 'first_planned_date', NULL);
  PERFORM public.fin_validate_rule(nr);
  IF q NOT IN ('keep','confirmed','estimated','unknown') THEN RAISE EXCEPTION 'Qualité invalide'; END IF;
  IF q IN ('confirmed','estimated') AND (amt IS NULL OR amt < 0) THEN RAISE EXCEPTION 'Montant invalide (négatif refusé)'; END IF;
  SELECT count(*) INTO kept FROM public.fin_occurrences WHERE obligation_id=_id AND due_date < _effective;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'due',due_date,'amount',amount,'exception',amount_override OR planned_override) ORDER BY due_date),'[]'), count(*) FILTER (WHERE amount_override OR planned_override)
    INTO canc, exc FROM public.fin_occurrences WHERE obligation_id=_id AND due_date >= _effective AND status='active';
  SELECT coalesce(jsonb_agg(jsonb_build_object('due',due,'planned',planned,'key',occ_key) ORDER BY due, slot),'[]') INTO newd
    FROM (SELECT * FROM public.fin_gen_dates(nr, _effective, _effective + 366) ORDER BY due, slot LIMIT 60) s;
  IF _dry THEN RETURN jsonb_build_object('kept', kept, 'cancelled', canc, 'exceptions', exc, 'new', newd, 'effective', _effective); END IF;
  INSERT INTO public.fin_obligation_rules(company_id, obligation_id, rule_gen, valid_until, snapshot, created_by)
  VALUES (o.company_id, _id, o.rule_gen, _effective, to_jsonb(o), auth.uid());
  UPDATE public.fin_obligations SET frequency=nr->>'frequency', interval_n=(nr->>'interval_n')::int,
    weekdays=(SELECT array_agg(x::int) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(nr->'weekdays')='array' THEN nr->'weekdays' ELSE '[]' END) x),
    month_day=CASE WHEN nr->>'frequency' IN ('monthly','twice_monthly') THEN coalesce(nullif(nr->>'month_day','')::int, extract(day FROM (nr->>'anchor_date')::date)::int) END,
    month_day2=nullif(nr->>'month_day2','')::int, collision_policy=nr->>'collision_policy', feb29_policy=nr->>'feb29_policy', short_month_policy=nr->>'short_month_policy',
    seasons=nr->'seasons', planned_shift=nr->>'planned_shift', schedule=CASE WHEN nr->>'frequency'='schedule' THEN nr->'schedule' END,
    anchor_date=(nr->>'anchor_date')::date, end_date=nullif(nr->>'end_date','')::date, max_count=nullif(nr->>'max_count','')::int, first_planned_date=NULL,
    rule_from=_effective, rule_gen=o.rule_gen+1, rev=o.rev+1, updated_at=now() WHERE id=_id;
  IF q <> 'keep' THEN
    INSERT INTO public.fin_obligation_versions(company_id, obligation_id, effective_from, amount, amount_quality, created_by)
    VALUES (o.company_id, _id, _effective, CASE WHEN q='unknown' THEN NULL ELSE amt END, q, auth.uid());
  END IF;
  UPDATE public.fin_occurrences SET status='cancelled', cancel_reason='Remplacée par la règle du '||to_char(_effective,'YYYY-MM-DD'), updated_at=now()
   WHERE obligation_id=_id AND due_date >= _effective AND status='active';
  GET DIAGNOSTICS nc = ROW_COUNT;
  PERFORM public.fin_log(o.company_id, _id, NULL, 'rule_change', NULL, to_jsonb(o), nr || jsonb_build_object('cancelled', nc, 'kept', kept));
  RETURN jsonb_build_object('kept', kept, 'cancelled', nc, 'new', newd);
END $$;