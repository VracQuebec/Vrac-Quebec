-- FIN-02 : récurrences avancées (additif, compatible FIN-01 : clés 'once' et 'AAAA-MM' conservées)
ALTER TABLE public.fin_obligations DROP CONSTRAINT fin_obligations_frequency_check;
ALTER TABLE public.fin_obligations ADD CONSTRAINT fin_obligations_frequency_check CHECK (frequency IN ('once','monthly','daily','weekly','weekdays','twice_monthly','yearly','schedule'));
ALTER TABLE public.fin_obligations DROP CONSTRAINT fin_obligations_short_month_policy_check;
ALTER TABLE public.fin_obligations ADD CONSTRAINT fin_obligations_short_month_policy_check CHECK (short_month_policy IN ('last_day','skip'));
ALTER TABLE public.fin_obligations
  ADD COLUMN interval_n int NOT NULL DEFAULT 1 CHECK (interval_n BETWEEN 1 AND 999),
  ADD COLUMN weekdays int[],
  ADD COLUMN month_day2 int CHECK (month_day2 BETWEEN 1 AND 31),
  ADD COLUMN collision_policy text CHECK (collision_policy IN ('keep_both','skip_second')),
  ADD COLUMN feb29_policy text CHECK (feb29_policy IN ('feb28','mar1','skip')),
  ADD COLUMN seasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN planned_shift text NOT NULL DEFAULT 'none' CHECK (planned_shift IN ('none','prev_weekday','next_weekday')),
  ADD COLUMN schedule jsonb,
  ADD COLUMN renewal_frequency text CHECK (renewal_frequency IN ('monthly','quarterly','half','yearly','multi_year','other')),
  ADD COLUMN rule_gen int NOT NULL DEFAULT 1,
  ADD COLUMN rule_from date,
  ADD COLUMN rev int NOT NULL DEFAULT 1;
COMMENT ON COLUMN public.fin_obligations.renewal_frequency IS 'Information seulement : ne génère aucune dette (séparée de la fréquence de paiement).';
ALTER TABLE public.fin_occurrences ADD COLUMN planned_reason text;
COMMENT ON COLUMN public.fin_occurrences.status IS 'FIN-03+ : une occurrence réglée/finalisée devra être protégée (aucun faux paiement simulé ici).';

CREATE TABLE public.fin_obligation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  obligation_id uuid NOT NULL REFERENCES public.fin_obligations(id),
  rule_gen int NOT NULL, valid_until date NOT NULL, snapshot jsonb NOT NULL,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, rule_gen));
GRANT SELECT ON public.fin_obligation_rules TO authenticated;
GRANT ALL ON public.fin_obligation_rules TO service_role;
ALTER TABLE public.fin_obligation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_rules_r" ON public.fin_obligation_rules FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  obligation_id uuid NOT NULL REFERENCES public.fin_obligations(id),
  start_date date NOT NULL, end_date date NOT NULL, reason text NOT NULL,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date));
GRANT SELECT ON public.fin_pauses TO authenticated;
GRANT ALL ON public.fin_pauses TO service_role;
ALTER TABLE public.fin_pauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_pauses_r" ON public.fin_pauses FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

-- Report lundi–vendredi, sans gestion des jours fériés
CREATE OR REPLACE FUNCTION public.fin_shift(_d date, _p text) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _p='next_weekday' AND extract(isodow FROM _d)=6 THEN _d+2
              WHEN _p='next_weekday' AND extract(isodow FROM _d)=7 THEN _d+1
              WHEN _p='prev_weekday' AND extract(isodow FROM _d)=6 THEN _d-1
              WHEN _p='prev_weekday' AND extract(isodow FROM _d)=7 THEN _d-2 ELSE _d END $$;

CREATE OR REPLACE FUNCTION public.fin_skip(_r jsonb, _d date) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (jsonb_array_length(coalesce(_r->'seasons','[]'::jsonb)) > 0 AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(_r->'seasons') s
            WHERE CASE WHEN s->>'from' <= s->>'to' THEN to_char(_d,'MM-DD') BETWEEN s->>'from' AND s->>'to'
                       ELSE to_char(_d,'MM-DD') >= s->>'from' OR to_char(_d,'MM-DD') <= s->>'to' END))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_r->'pauses','[]'::jsonb)) p
                 WHERE _d BETWEEN (p->>'start_date')::date AND (p->>'end_date')::date) $$;

-- Validation commune (messages précis)
CREATE OR REPLACE FUNCTION public.fin_validate_rule(_r jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE f text := coalesce(_r->>'frequency','once'); n int := coalesce(nullif(_r->>'interval_n','')::int,1); s jsonb; l jsonb; d1 int; d2 int;
BEGIN
  IF f NOT IN ('once','monthly','daily','weekly','weekdays','twice_monthly','yearly','schedule') THEN RAISE EXCEPTION 'Fréquence inconnue : %', f; END IF;
  IF n < 1 THEN RAISE EXCEPTION 'Intervalle nul ou négatif refusé'; END IF;
  IF (f='daily' AND n>366) OR (f='weekly' AND n>104) OR (f='monthly' AND n>120) OR (f='yearly' AND n>50) THEN RAISE EXCEPTION 'Intervalle trop grand pour cette fréquence'; END IF;
  IF f='schedule' THEN
    IF jsonb_array_length(coalesce(_r->'schedule','[]'::jsonb))=0 THEN RAISE EXCEPTION 'Échéancier : au moins un versement requis'; END IF;
    IF jsonb_array_length(_r->'schedule') > 600 THEN RAISE EXCEPTION 'Échéancier limité à 600 versements'; END IF;
    FOR l IN SELECT * FROM jsonb_array_elements(_r->'schedule') LOOP
      IF nullif(l->>'date','') IS NULL THEN RAISE EXCEPTION 'Échéancier : date manquante'; END IF;
      IF coalesce(l->>'quality','') NOT IN ('confirmed','estimated','unknown') THEN RAISE EXCEPTION 'Échéancier : qualité de montant invalide'; END IF;
      IF l->>'quality'<>'unknown' AND nullif(l->>'amount','') IS NULL THEN RAISE EXCEPTION 'Échéancier : montant requis le % (ou « à compléter »)', l->>'date'; END IF;
      IF nullif(l->>'amount','')::numeric < 0 THEN RAISE EXCEPTION 'Montant négatif refusé'; END IF;
    END LOOP;
    RETURN;
  END IF;
  IF nullif(_r->>'anchor_date','') IS NULL THEN RAISE EXCEPTION 'Date d''échéance requise'; END IF;
  IF nullif(_r->>'end_date','') IS NOT NULL AND (_r->>'end_date')::date < (_r->>'anchor_date')::date THEN RAISE EXCEPTION 'La date de fin précède la date de début'; END IF;
  IF nullif(_r->>'max_count','')::int < 1 OR nullif(_r->>'max_count','')::int > 600 THEN RAISE EXCEPTION 'Nombre maximal d''échéances : entre 1 et 600'; END IF;
  IF f='weekdays' AND coalesce(jsonb_array_length(_r->'weekdays'),0)=0 THEN RAISE EXCEPTION 'Choisir au moins un jour de la semaine'; END IF;
  IF f='twice_monthly' THEN
    d1 := nullif(_r->>'month_day','')::int; d2 := nullif(_r->>'month_day2','')::int;
    IF d1 IS NULL OR d2 IS NULL OR d1 NOT BETWEEN 1 AND 31 OR d2 NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Deux fois par mois : choisir deux jours (1 à 31)'; END IF;
    IF d1 = d2 THEN RAISE EXCEPTION 'Deux fois par mois : les deux jours doivent être différents'; END IF;
    IF least(d1,d2) >= 29 AND coalesce(_r->>'collision_policy','') NOT IN ('keep_both','skip_second') THEN RAISE EXCEPTION 'Collision possible en février : choisir une politique (deux versements le même jour ou un seul)'; END IF;
  END IF;
  IF f='yearly' AND to_char((_r->>'anchor_date')::date,'MM-DD')='02-29' AND coalesce(_r->>'feb29_policy','') NOT IN ('feb28','mar1','skip') THEN RAISE EXCEPTION '29 février : choisir 28 février, 1er mars ou seulement les années bissextiles'; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(coalesce(_r->'seasons','[]'::jsonb)) LOOP
    IF coalesce(s->>'from','') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' OR coalesce(s->>'to','') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN RAISE EXCEPTION 'Saison invalide (format MM-JJ)'; END IF;
  END LOOP;
END $$;

-- Moteur unique : aperçu, génération, calendrier, agenda, tableau et totaux
CREATE OR REPLACE FUNCTION public.fin_gen_dates(_r jsonb, _from date, _to date)
RETURNS TABLE(occ_key text, due date, planned date, l_amount numeric, l_quality text, from_line boolean, slot int)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE f text := coalesce(_r->>'frequency','once'); a date; n int := greatest(coalesce(nullif(_r->>'interval_n','')::int,1),1);
  mx int := nullif(_r->>'max_count','')::int; lim date := _to; lo date := nullif(_r->>'rule_from','')::date;
  pol text := coalesce(_r->>'short_month_policy','last_day'); sh text := coalesce(_r->>'planned_shift','none');
  sfx text := CASE WHEN coalesce(nullif(_r->>'rule_gen','')::int,1) > 1 THEN '@g'||(_r->>'rule_gen') ELSE '' END;
  k int := 0; cnt int := 0; it int := 0; md int; md2 int; ms date; ps date; c date; c2 date; y int; wd int[]; l jsonb; i int;
  cands date[]; keys text[]; slots int[];
BEGIN
  IF nullif(_r->>'end_date','') IS NOT NULL THEN lim := least(lim, (_r->>'end_date')::date); END IF;
  IF nullif(_r->>'archived_effective','') IS NOT NULL THEN lim := least(lim, (_r->>'archived_effective')::date - 1); END IF;
  IF nullif(_r->>'valid_until','') IS NOT NULL THEN lim := least(lim, (_r->>'valid_until')::date - 1); END IF;
  IF f='schedule' THEN
    FOR l IN SELECT x FROM jsonb_array_elements(coalesce(_r->'schedule','[]'::jsonb)) x ORDER BY (x->>'date')::date, x->>'id' LOOP
      c := (l->>'date')::date;
      IF c <= lim AND (lo IS NULL OR c >= lo) AND NOT public.fin_skip(_r, c) AND c >= _from THEN
        occ_key := 'S:'||coalesce(l->>'id', c::text)||sfx; due := c; planned := public.fin_shift(c, sh);
        l_quality := l->>'quality'; l_amount := CASE WHEN l_quality='unknown' THEN NULL ELSE nullif(l->>'amount','')::numeric END; from_line := true; slot := 1;
        RETURN NEXT;
      END IF;
    END LOOP;
    RETURN;
  END IF;
  a := (_r->>'anchor_date')::date;
  from_line := false; l_amount := NULL; l_quality := NULL;
  IF f='once' THEN
    IF a <= lim AND a >= _from AND NOT public.fin_skip(_r, a) THEN
      occ_key := 'once'||sfx; due := a; planned := coalesce(nullif(_r->>'first_planned_date','')::date, public.fin_shift(a, sh)); slot := 1; RETURN NEXT;
    END IF;
    RETURN;
  END IF;
  md := coalesce(nullif(_r->>'month_day','')::int, extract(day FROM a)::int);
  md2 := nullif(_r->>'month_day2','')::int;
  IF f='weekdays' THEN SELECT array_agg(x::int) INTO wd FROM jsonb_array_elements_text(_r->'weekdays') x; END IF;
  LOOP
    it := it + 1;
    IF it > 60000 THEN RAISE EXCEPTION 'Période non calculable dans la limite retenue (60 000 dates) : réduisez la période'; END IF;
    cands := ARRAY[]::date[]; keys := ARRAY[]::text[]; slots := ARRAY[]::int[];
    IF f IN ('daily','weekly','weekdays') THEN
      c := a + k * (CASE f WHEN 'daily' THEN n WHEN 'weekly' THEN 7*n ELSE 1 END);
      ps := c;
      IF f<>'weekdays' OR extract(isodow FROM c)::int = ANY(wd) THEN cands := ARRAY[c]; keys := ARRAY['D:'||c::text]; slots := ARRAY[1]; END IF;
    ELSIF f IN ('monthly','twice_monthly') THEN
      ms := (date_trunc('month', a) + make_interval(months => k * CASE WHEN f='monthly' THEN n ELSE 1 END))::date; ps := ms;
      IF f='monthly' THEN
        IF NOT (pol='skip' AND md > extract(day FROM (ms + interval '1 month' - interval '1 day'))) THEN
          cands := ARRAY[public.fin_month_date(ms, md, 0)]; keys := ARRAY[to_char(ms,'YYYY-MM')]; slots := ARRAY[1]; END IF;
      ELSE
        c := public.fin_month_date(ms, least(md, md2), 0); c2 := public.fin_month_date(ms, greatest(md, md2), 0);
        cands := ARRAY[c]; keys := ARRAY[to_char(ms,'YYYY-MM')||'#1']; slots := ARRAY[1];
        IF c2 <> c OR coalesce(_r->>'collision_policy','keep_both')='keep_both' THEN
          cands := cands || c2; keys := keys || (to_char(ms,'YYYY-MM')||'#2'); slots := slots || 2; END IF;
      END IF;
    ELSIF f='yearly' THEN
      y := extract(year FROM a)::int + k*n; ps := make_date(y,1,1);
      IF extract(day FROM a)::int <= extract(day FROM (make_date(y, extract(month FROM a)::int, 1) + interval '1 month' - interval '1 day'))::int THEN
        cands := ARRAY[make_date(y, extract(month FROM a)::int, extract(day FROM a)::int)];
      ELSIF coalesce(_r->>'feb29_policy','feb28')='feb28' THEN cands := ARRAY[make_date(y,2,28)];
      ELSIF _r->>'feb29_policy'='mar1' THEN cands := ARRAY[make_date(y,3,1)]; END IF;
      IF array_length(cands,1) IS NOT NULL THEN keys := ARRAY['Y:'||y]; slots := ARRAY[1]; END IF;
    END IF;
    EXIT WHEN ps > lim;
    FOR i IN 1..coalesce(array_length(cands,1),0) LOOP
      c := cands[i];
      CONTINUE WHEN c < a OR c > lim OR public.fin_skip(_r, c);
      cnt := cnt + 1;
      IF mx IS NOT NULL AND cnt > mx THEN RETURN; END IF;
      IF cnt > 5000 THEN RAISE EXCEPTION 'Série trop dense : plus de 5 000 échéances, réduisez la période ou l''intervalle'; END IF;
      IF c >= _from AND (lo IS NULL OR c >= lo) THEN
        occ_key := keys[i]||sfx; due := c; planned := public.fin_shift(c, sh); slot := slots[i]; RETURN NEXT;
      END IF;
    END LOOP;
    k := k + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fin_rule_json(_o public.fin_obligations) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT to_jsonb(_o) || jsonb_build_object('pauses', coalesce((SELECT jsonb_agg(jsonb_build_object('start_date',p.start_date,'end_date',p.end_date)) FROM public.fin_pauses p WHERE p.obligation_id=_o.id),'[]'::jsonb)) $$;

CREATE OR REPLACE FUNCTION public.fin_ensure_occurrences(_company uuid, _from date, _to date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; r jsonb; g record; v record; n int := 0; c int; rules jsonb[]; rr jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _to < _from THEN RAISE EXCEPTION 'Période invalide'; END IF;
  IF _to - _from > 366*8 THEN RAISE EXCEPTION 'Période limitée à 8 ans'; END IF;
  FOR o IN SELECT * FROM public.fin_obligations WHERE company_id=_company AND status IN ('active','archived') LOOP
    r := public.fin_rule_json(o);
    rules := ARRAY[r];
    SELECT coalesce(array_agg(x.snapshot || jsonb_build_object('valid_until', x.valid_until, 'pauses', r->'pauses', 'archived_effective', r->'archived_effective') ORDER BY x.rule_gen), ARRAY[]::jsonb[]) || rules
      INTO rules FROM public.fin_obligation_rules x WHERE x.obligation_id=o.id;
    FOREACH rr IN ARRAY rules LOOP
      FOR g IN SELECT * FROM public.fin_gen_dates(rr, _from, _to) LOOP
        IF NOT g.from_line THEN
          SELECT * INTO v FROM public.fin_obligation_versions WHERE obligation_id=o.id AND effective_from<=g.due ORDER BY effective_from DESC, created_at DESC LIMIT 1;
          IF v.id IS NULL THEN SELECT * INTO v FROM public.fin_obligation_versions WHERE obligation_id=o.id ORDER BY effective_from, created_at DESC LIMIT 1; END IF;
        END IF;
        INSERT INTO public.fin_occurrences(company_id, obligation_id, occ_key, due_date, planned_date, amount, amount_quality, version_id, planned_reason)
        VALUES (_company, o.id, g.occ_key, g.due, g.planned,
          CASE WHEN g.from_line THEN g.l_amount ELSE v.amount END, CASE WHEN g.from_line THEN g.l_quality ELSE v.amount_quality END,
          CASE WHEN g.from_line THEN NULL ELSE v.id END,
          CASE WHEN g.planned <> g.due THEN CASE rr->>'planned_shift' WHEN 'next_weekday' THEN 'Règle : lundi à vendredi suivant (sans jours fériés)' WHEN 'prev_weekday' THEN 'Règle : lundi à vendredi précédent (sans jours fériés)' ELSE 'Date planifiée saisie' END END)
        ON CONFLICT (company_id, obligation_id, occ_key) DO NOTHING;
        GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;

-- Aperçu avant enregistrement (même moteur)
CREATE OR REPLACE FUNCTION public.fin_preview(_company uuid, _p jsonb, _from date, _to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := _p; q text := coalesce(_p->>'amount_quality','unknown'); amt numeric := CASE WHEN coalesce(_p->>'amount_quality','unknown')='unknown' THEN NULL ELSE nullif(_p->>'amount','')::numeric END;
  a date; per jsonb; nxt jsonb; col jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _to < _from THEN RAISE EXCEPTION 'La date de fin précède la date de début'; END IF;
  IF _to - _from > 366*8 THEN RAISE EXCEPTION 'Période d''aperçu limitée à 8 ans'; END IF;
  PERFORM public.fin_validate_rule(r);
  IF amt < 0 THEN RAISE EXCEPTION 'Montant négatif refusé'; END IF;
  IF r->>'frequency'='schedule' THEN SELECT min((x->>'date')::date) INTO a FROM jsonb_array_elements(r->'schedule') x; ELSE a := (r->>'anchor_date')::date; END IF;
  WITH d AS (SELECT g.*, CASE WHEN g.from_line THEN g.l_amount ELSE amt END am, CASE WHEN g.from_line THEN g.l_quality ELSE q END ql FROM public.fin_gen_dates(r, _from, _to) g)
  SELECT jsonb_build_object('count', count(*), 'confirmed', coalesce(sum(am) FILTER (WHERE ql='confirmed'),0), 'estimated', coalesce(sum(am) FILTER (WHERE ql='estimated'),0),
     'unknown_count', count(*) FILTER (WHERE ql='unknown'),
     'dates', coalesce(jsonb_agg(jsonb_build_object('key',occ_key,'due',due,'planned',planned,'amount',am,'quality',ql) ORDER BY due, slot), '[]'::jsonb))
    INTO per FROM d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('due',due,'planned',planned,'amount',CASE WHEN from_line THEN l_amount ELSE amt END,'quality',CASE WHEN from_line THEN l_quality ELSE q END) ORDER BY due, slot),'[]')
    INTO nxt FROM (SELECT * FROM public.fin_gen_dates(r, greatest(a, _from), greatest(a,_from) + 366*5) ORDER BY due, slot LIMIT 8) s;
  IF r->>'frequency'='twice_monthly' THEN
    SELECT coalesce(jsonb_agg(DISTINCT m),'[]') INTO col FROM (
      SELECT to_char(due,'YYYY-MM') m FROM public.fin_gen_dates(r || '{"collision_policy":"keep_both"}'::jsonb, _from, _to) GROUP BY due HAVING count(*) > 1) z;
  ELSE col := '[]'::jsonb; END IF;
  RETURN per || jsonb_build_object('next', nxt, 'collisions', col, 'from', _from, 'to', _to);
END $$;

CREATE OR REPLACE FUNCTION public.fin_rule_fields(_p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('frequency', coalesce(_p->>'frequency','once'), 'interval_n', coalesce(nullif(_p->>'interval_n','')::int,1),
    'weekdays', _p->'weekdays', 'month_day', nullif(_p->>'month_day',''), 'month_day2', nullif(_p->>'month_day2',''),
    'collision_policy', _p->>'collision_policy', 'feb29_policy', _p->>'feb29_policy', 'short_month_policy', coalesce(_p->>'short_month_policy','last_day'),
    'seasons', coalesce(_p->'seasons','[]'::jsonb), 'planned_shift', coalesce(_p->>'planned_shift','none'), 'schedule', _p->'schedule') $$;

-- Enregistrement : nouvelles règles + contrôle de conflit (rev)
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
    RAISE EXCEPTION 'Conflit : cette obligation a été modifiée par une autre personne. Rechargez pour voir l''état actuel avant de réenregistrer.' USING ERRCODE='40001';
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

-- Changement de cadence à partir d'une date : anciennes occurrences conservées/annulées de façon traçable, nouvelles identités
CREATE OR REPLACE FUNCTION public.fin_change_rule(_id uuid, _rev int, _p jsonb, _effective date, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; nr jsonb; kept int; canc jsonb; exc int; newd jsonb; q text := coalesce(_p->>'amount_quality','keep'); amt numeric := nullif(_p->>'amount','')::numeric; sch jsonb; nc int;
BEGIN
  SELECT * INTO o FROM public.fin_obligations WHERE id=_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF o.status <> 'active' THEN RAISE EXCEPTION 'Seule une série active peut changer de règle'; END IF;
  IF _rev IS NOT NULL AND _rev <> o.rev THEN RAISE EXCEPTION 'Conflit : cette obligation a été modifiée par une autre personne. Rechargez pour voir l''état actuel.' USING ERRCODE='40001'; END IF;
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

-- Suspension future : aucune dette passée effacée, aucun rattrapage, ancrage d'origine conservé
CREATE OR REPLACE FUNCTION public.fin_add_pause(_id uuid, _start date, _end date, _reason text, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; aff jsonb; nc int; pid uuid;
BEGIN
  SELECT * INTO o FROM public.fin_obligations WHERE id=_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _start IS NULL OR _end IS NULL THEN RAISE EXCEPTION 'Début et fin de suspension requis'; END IF;
  IF _end < _start THEN RAISE EXCEPTION 'La date de fin précède la date de début'; END IF;
  IF _start < current_date THEN RAISE EXCEPTION 'Une suspension commence aujourd''hui ou plus tard : les échéances passées restent dues'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  PERFORM public.fin_ensure_occurrences(o.company_id, _start, _end);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'due',due_date,'amount',amount) ORDER BY due_date),'[]') INTO aff
    FROM public.fin_occurrences WHERE obligation_id=_id AND status='active' AND due_date BETWEEN _start AND _end;
  IF _dry THEN RETURN jsonb_build_object('affected', aff); END IF;
  INSERT INTO public.fin_pauses(company_id, obligation_id, start_date, end_date, reason, created_by) VALUES (o.company_id, _id, _start, _end, btrim(_reason), auth.uid()) RETURNING id INTO pid;
  UPDATE public.fin_occurrences SET status='cancelled', cancel_reason='Suspendue du '||_start||' au '||_end||' : '||btrim(_reason), updated_at=now()
   WHERE obligation_id=_id AND status='active' AND due_date BETWEEN _start AND _end;
  GET DIAGNOSTICS nc = ROW_COUNT;
  UPDATE public.fin_obligations SET rev=rev+1, updated_at=now() WHERE id=_id;
  PERFORM public.fin_log(o.company_id, _id, NULL, 'pause', btrim(_reason), NULL, jsonb_build_object('start',_start,'end',_end,'cancelled',nc,'pause_id',pid));
  RETURN jsonb_build_object('affected', aff, 'cancelled', nc);
END $$;

CREATE OR REPLACE FUNCTION public.fin_reschedule(_occ uuid, _planned date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oc public.fin_occurrences;
BEGIN
  SELECT * INTO oc FROM public.fin_occurrences WHERE id=_occ;
  IF oc.id IS NULL OR NOT public.fin_can_write(oc.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _planned IS NULL THEN RAISE EXCEPTION 'Date planifiée requise'; END IF;
  IF oc.status <> 'active' THEN RAISE EXCEPTION 'Échéance annulée : report impossible'; END IF;
  UPDATE public.fin_occurrences SET planned_date=_planned, planned_override=(_planned<>due_date), planned_reason=CASE WHEN _planned<>due_date THEN 'Report manuel' END, updated_at=now() WHERE id=_occ;
  PERFORM public.fin_log(oc.company_id, oc.obligation_id, _occ, 'reschedule', NULL, jsonb_build_object('planned',oc.planned_date), jsonb_build_object('planned',_planned));
END $$;

DROP FUNCTION public.fin_select(uuid,date,date,text,jsonb);
CREATE FUNCTION public.fin_select(_company uuid, _from date, _to date, _base text, _f jsonb)
RETURNS TABLE(id uuid, obligation_id uuid, due_date date, planned_date date, ref_date date, amount numeric, amount_quality text, status text, cancel_reason text, amount_override boolean, planned_override boolean, label text, payee text, category_id uuid, category text, frequency text, truck_id uuid, project_id uuid, nature text, interval_n int, seasonal boolean, planned_reason text, occ_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oc.id, oc.obligation_id, oc.due_date, oc.planned_date,
    CASE WHEN _base='planned' THEN oc.planned_date ELSE oc.due_date END,
    oc.amount, oc.amount_quality, oc.status, oc.cancel_reason, oc.amount_override, oc.planned_override,
    ob.label, coalesce(cl.name, ob.payee_label), ob.category_id, cat.name, ob.frequency, ob.truck_id, ob.project_id, ob.nature,
    ob.interval_n, jsonb_array_length(ob.seasons) > 0, oc.planned_reason, oc.occ_key
  FROM public.fin_occurrences oc
  JOIN public.fin_obligations ob ON ob.id=oc.obligation_id AND ob.company_id=oc.company_id
  LEFT JOIN public.ent_crm_clients cl ON cl.id=ob.payee_client_id AND cl.company_id=ob.company_id
  LEFT JOIN public.fin_categories cat ON cat.id=ob.category_id AND cat.company_id=ob.company_id
  WHERE oc.company_id=_company AND public.fin_can_read(_company)
    AND (CASE WHEN _base='planned' THEN oc.planned_date ELSE oc.due_date END) BETWEEN _from AND _to
    AND (coalesce(_f->>'status','active')='all' OR oc.status=coalesce(_f->>'status','active'))
    AND (_f->>'quality' IS NULL OR oc.amount_quality=_f->>'quality')
    AND (_f->>'frequency' IS NULL OR ob.frequency=_f->>'frequency')
    AND (_f->>'seasonal' IS NULL OR (jsonb_array_length(ob.seasons) > 0) = ((_f->>'seasonal')='1'))
    AND (_f->>'category_id' IS NULL OR ob.category_id=(_f->>'category_id')::uuid)
    AND (_f->>'truck_id' IS NULL OR ob.truck_id=(_f->>'truck_id')::uuid)
    AND (_f->>'project_id' IS NULL OR ob.project_id=(_f->>'project_id')::uuid)
    AND (_f->>'payee' IS NULL OR coalesce(cl.name, ob.payee_label) ILIKE '%'||(_f->>'payee')||'%')
    AND (_f->>'q' IS NULL OR ob.label ILIKE '%'||(_f->>'q')||'%' OR coalesce(cl.name, ob.payee_label,'') ILIKE '%'||(_f->>'q')||'%' OR coalesce(ob.contract_ref,'') ILIKE '%'||(_f->>'q')||'%')
$$;
REVOKE EXECUTE ON FUNCTION public.fin_select(uuid,date,date,text,jsonb) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fin_gen_dates(jsonb,date,date), public.fin_rule_json(public.fin_obligations), public.fin_validate_rule(jsonb), public.fin_skip(jsonb,date), public.fin_shift(date,text), public.fin_rule_fields(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_preview(uuid,jsonb,date,date), public.fin_change_rule(uuid,int,jsonb,date,boolean), public.fin_add_pause(uuid,date,date,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_preview(uuid,jsonb,date,date), public.fin_change_rule(uuid,int,jsonb,date,boolean), public.fin_add_pause(uuid,date,date,text,boolean) TO authenticated;
