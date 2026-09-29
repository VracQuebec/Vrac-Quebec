-- FIN-03 : règlements déclarés, affectations, soldes, justificatifs + corrections FIN-02 (additif)
CREATE OR REPLACE FUNCTION public.fin_can_correct(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','comptabilite'), false) $$;

ALTER TABLE public.fin_settings ADD COLUMN settlement_since date NOT NULL DEFAULT current_date;
COMMENT ON COLUMN public.fin_settings.settlement_since IS 'Activation du suivi des règlements : échéances antérieures = « Règlement à confirmer » tant que non validées.';
ALTER TABLE public.fin_occurrences ADD COLUMN cancel_source text, ADD COLUMN settle_confirmed_at timestamptz, ADD COLUMN settle_confirmed_by uuid;
ALTER TABLE public.fin_pauses ADD COLUMN lifted_from date, ADD COLUMN lifted_at timestamptz, ADD COLUMN lifted_by uuid, ADD COLUMN lift_reason text;

UPDATE public.fin_occurrences oc SET cancel_source = 'pause:'||p.id FROM public.fin_pauses p
 WHERE oc.status='cancelled' AND oc.cancel_source IS NULL AND oc.obligation_id=p.obligation_id AND oc.cancel_reason LIKE 'Suspendue du '||p.start_date||' au '||p.end_date||'%';
UPDATE public.fin_occurrences SET cancel_source = CASE WHEN cancel_reason LIKE 'Remplacée par la règle%' THEN 'rule' WHEN cancel_reason='Série archivée' THEN 'archive'
  WHEN cancel_reason='Hors de la série modifiée' THEN 'series_edit' WHEN cancel_reason LIKE 'Suspendue du%' THEN 'pause' ELSE 'manual' END
 WHERE status='cancelled' AND cancel_source IS NULL;

CREATE OR REPLACE FUNCTION public.fin_payee_key(_o public.fin_obligations) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _o.payee_client_id IS NOT NULL THEN 'c:'||_o.payee_client_id WHEN nullif(btrim(_o.payee_label),'') IS NOT NULL THEN 'l:'||lower(btrim(_o.payee_label)) ELSE 'o:'||_o.id END $$;
CREATE OR REPLACE FUNCTION public.fin_settle_since(_company uuid) RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT settlement_since FROM public.fin_settings WHERE company_id=_company), greatest(date '2026-09-29', (SELECT created_at::date FROM public.jsc_companies WHERE id=_company))) $$;

CREATE TABLE public.fin_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  payee_key text NOT NULL, payee_name text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  bank_date date,
  method text NOT NULL CHECK (method IN ('interac','virement','cheque','especes','carte','prelevement','autre')),
  source_label text CHECK (source_label IS NULL OR (length(source_label) <= 60 AND source_label !~ '[0-9]{7,}')),
  reference text CHECK (reference IS NULL OR length(reference) <= 120),
  note text,
  status text NOT NULL DEFAULT 'validated' CHECK (status IN ('draft','validated','voided','returned')),
  draft_alloc jsonb,
  void_reason text, voided_at timestamptz, voided_by uuid,
  idem_key text NOT NULL,
  created_by uuid, is_support boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idem_key));
COMMENT ON TABLE public.fin_payments IS 'Règlement déclaré (saisie manuelle) — non rapproché : ne prouve pas une opération bancaire.';
COMMENT ON COLUMN public.fin_payments.bank_date IS 'Réservé au futur rapprochement bancaire ; jamais rempli par FIN-03.';
CREATE INDEX fin_payments_company ON public.fin_payments (company_id, paid_on);
CREATE INDEX fin_payments_payee ON public.fin_payments (company_id, payee_key);
GRANT SELECT ON public.fin_payments TO authenticated;
GRANT ALL ON public.fin_payments TO service_role;
ALTER TABLE public.fin_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_pay_r" ON public.fin_payments FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  payment_id uuid NOT NULL REFERENCES public.fin_payments(id),
  occurrence_id uuid NOT NULL REFERENCES public.fin_occurrences(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  allocated_on date NOT NULL DEFAULT current_date,
  idem_key text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz, reversed_by uuid, reversed_reason text,
  UNIQUE (company_id, idem_key));
CREATE INDEX fin_alloc_occ ON public.fin_allocations (occurrence_id) WHERE reversed_at IS NULL;
CREATE INDEX fin_alloc_pay ON public.fin_allocations (payment_id);
GRANT SELECT ON public.fin_allocations TO authenticated;
GRANT ALL ON public.fin_allocations TO service_role;
ALTER TABLE public.fin_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_alloc_r" ON public.fin_allocations FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  payment_id uuid NOT NULL REFERENCES public.fin_payments(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  refunded_on date NOT NULL, reason text NOT NULL,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, voided_by uuid, void_reason text);
COMMENT ON TABLE public.fin_refunds IS 'Retour d''argent déclaré par le bénéficiaire, lié au versement d''origine (pas une note de crédit fiscale).';
GRANT SELECT ON public.fin_refunds TO authenticated;
GRANT ALL ON public.fin_refunds TO service_role;
ALTER TABLE public.fin_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_ref_r" ON public.fin_refunds FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_payment_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  payment_id uuid NOT NULL REFERENCES public.fin_payments(id),
  file_id uuid NOT NULL REFERENCES public.ent_crm_files(id),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, file_id));
GRANT SELECT ON public.fin_payment_files TO authenticated;
GRANT ALL ON public.fin_payment_files TO service_role;
ALTER TABLE public.fin_payment_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_pf_r" ON public.fin_payment_files FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

ALTER TABLE public.fin_events ADD COLUMN payment_id uuid REFERENCES public.fin_payments(id);
CREATE INDEX fin_events_pay ON public.fin_events (payment_id, created_at);
CREATE INDEX fin_events_occ ON public.fin_events (occurrence_id, created_at);

CREATE OR REPLACE FUNCTION public.fin_log_pay(_company uuid, _pay uuid, _obl uuid, _occ uuid, _action text, _reason text, _after jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fin_events(company_id, payment_id, obligation_id, occurrence_id, action, reason, after, actor_id, is_support)
  VALUES (_company, _pay, _obl, _occ, _action, _reason, _after, auth.uid(), public.has_role(auth.uid(),'admin')) $$;

CREATE OR REPLACE FUNCTION public.fin_occ_paid(_occ uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(al.amount),0) FROM public.fin_allocations al JOIN public.fin_payments p ON p.id=al.payment_id AND p.status='validated'
  WHERE al.occurrence_id=_occ AND al.reversed_at IS NULL $$;
CREATE OR REPLACE FUNCTION public.fin_payment_avail(_pay uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.amount - coalesce((SELECT sum(amount) FROM public.fin_allocations WHERE payment_id=p.id AND reversed_at IS NULL),0)
                  - coalesce((SELECT sum(amount) FROM public.fin_refunds WHERE payment_id=p.id AND voided_at IS NULL),0)
  FROM public.fin_payments p WHERE p.id=_pay $$;

-- Protection des échéances réglées + origine des annulations
CREATE OR REPLACE FUNCTION public.fin_occ_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE paid numeric;
BEGIN
  IF OLD.status='active' AND NEW.status='cancelled' THEN
    paid := public.fin_occ_paid(OLD.id);
    IF paid > 0 THEN
      IF NEW.cancel_reason LIKE 'Suspendue du%' OR NEW.cancel_reason='Série archivée' THEN
        NEW.status := 'active'; NEW.cancel_reason := OLD.cancel_reason;
        PERFORM public.fin_log(OLD.company_id, OLD.obligation_id, OLD.id, 'protected', 'Échéance conservée : règlements déclarés ('||paid||' $)', NULL, jsonb_build_object('blocked', NEW.cancel_reason));
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'L''échéance du % comporte des règlements déclarés (% $) : annulez ou retirez d''abord ces affectations, ou choisissez une date d''effet postérieure.', OLD.due_date, paid USING ERRCODE='P0409';
    END IF;
    NEW.cancel_source := coalesce(nullif(current_setting('fin.cancel_source', true),''),
      CASE WHEN NEW.cancel_reason LIKE 'Remplacée par la règle%' THEN 'rule' WHEN NEW.cancel_reason='Série archivée' THEN 'archive'
           WHEN NEW.cancel_reason='Hors de la série modifiée' THEN 'series_edit' WHEN NEW.cancel_reason LIKE 'Suspendue du%' THEN 'pause' ELSE 'manual' END);
  END IF;
  IF (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.amount_quality IS DISTINCT FROM OLD.amount_quality) THEN
    paid := public.fin_occ_paid(OLD.id);
    IF paid > 0 AND (NEW.amount_quality='unknown' OR NEW.amount < paid) THEN
      RAISE EXCEPTION 'Échéance du % : le montant ne peut pas descendre sous le déjà réglé (% $). Retirez d''abord l''affectation excédentaire (elle deviendra un reliquat du versement).', OLD.due_date, paid USING ERRCODE='P0409';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_occ_guard BEFORE UPDATE ON public.fin_occurrences FOR EACH ROW EXECUTE FUNCTION public.fin_occ_guard();

-- Collision : mois réellement concernés ; saison « recommencer »
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
    IF least(d1,d2) >= 29 AND coalesce(_r->>'collision_policy','') NOT IN ('keep_both','skip_second') THEN
      RAISE EXCEPTION 'Les deux jours tombent le même jour %  : choisir deux échéances distinctes ou une seule',
        CASE WHEN least(d1,d2) >= 30 THEN 'en février et dans les mois de 30 jours (avril, juin, septembre, novembre)' ELSE 'en février' END;
    END IF;
  END IF;
  IF f='yearly' AND to_char((_r->>'anchor_date')::date,'MM-DD')='02-29' AND coalesce(_r->>'feb29_policy','') NOT IN ('feb28','mar1','skip') THEN RAISE EXCEPTION '29 février : choisir 28 février, 1er mars ou seulement les années bissextiles'; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(coalesce(_r->'seasons','[]'::jsonb)) LOOP
    IF coalesce(s->>'from','') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' OR coalesce(s->>'to','') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN RAISE EXCEPTION 'Saison invalide (format MM-JJ)'; END IF;
    IF coalesce((s->>'restart')::boolean,false) AND f NOT IN ('daily','weekly','monthly') THEN RAISE EXCEPTION '« Recommencer au début de chaque saison » : disponible pour les fréquences quotidienne, hebdomadaire ou mensuelle'; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fin_gen_dates(_r jsonb, _from date, _to date)
RETURNS TABLE(occ_key text, due date, planned date, l_amount numeric, l_quality text, from_line boolean, slot int)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE f text := coalesce(_r->>'frequency','once'); a date; n int := greatest(coalesce(nullif(_r->>'interval_n','')::int,1),1);
  mx int := nullif(_r->>'max_count','')::int; lim date := _to; lo date := nullif(_r->>'rule_from','')::date;
  pol text := coalesce(_r->>'short_month_policy','last_day'); sh text := coalesce(_r->>'planned_shift','none');
  sfx text := CASE WHEN coalesce(nullif(_r->>'rule_gen','')::int,1) > 1 THEN '@g'||(_r->>'rule_gen') ELSE '' END;
  k int := 0; cnt int := 0; it int := 0; md int; md2 int; ms date; ps date; c date; c2 date; y int; wd int[]; l jsonb; i int;
  cands date[]; keys text[]; slots int[]; sv jsonb; ss date; se date; j int;
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
  -- Mode « recommencer au début de chaque saison » (le nombre maximal porte sur toute la série)
  IF f IN ('daily','weekly','monthly') AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_r->'seasons','[]'::jsonb)) x WHERE coalesce((x->>'restart')::boolean,false)) THEN
    FOR y IN (extract(year FROM a)::int - 1) .. extract(year FROM lim)::int LOOP
      FOR sv IN SELECT x FROM jsonb_array_elements(_r->'seasons') x ORDER BY x->>'from' LOOP
        ss := public.fin_month_date(make_date(y, split_part(sv->>'from','-',1)::int, 1), split_part(sv->>'from','-',2)::int, 0);
        se := public.fin_month_date(make_date(y + CASE WHEN sv->>'to' < sv->>'from' THEN 1 ELSE 0 END, split_part(sv->>'to','-',1)::int, 1), split_part(sv->>'to','-',2)::int, 0);
        CONTINUE WHEN se < a;
        EXIT WHEN ss > lim;
        j := 0;
        LOOP
          it := it + 1;
          IF it > 60000 THEN RAISE EXCEPTION 'Période non calculable dans la limite retenue (60 000 dates) : réduisez la période'; END IF;
          c := CASE f WHEN 'daily' THEN ss + j*n WHEN 'weekly' THEN ss + 7*j*n ELSE public.fin_month_date(ss, extract(day FROM ss)::int, j*n) END;
          EXIT WHEN c > se OR c > lim;
          j := j + 1;
          CONTINUE WHEN c < a OR public.fin_skip(_r, c);
          cnt := cnt + 1;
          IF mx IS NOT NULL AND cnt > mx THEN RETURN; END IF;
          IF cnt > 5000 THEN RAISE EXCEPTION 'Série trop dense : plus de 5 000 échéances, réduisez la période ou l''intervalle'; END IF;
          IF c >= _from AND (lo IS NULL OR c >= lo) THEN occ_key := 'D:'||c::text||sfx; due := c; planned := public.fin_shift(c, sh); slot := 1; RETURN NEXT; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
    RETURN;
  END IF;
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

-- Premières dates de deux saisons consécutives (aperçu)
CREATE OR REPLACE FUNCTION public.fin_season_sample(_company uuid, _p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a date := nullif(_p->>'anchor_date','')::date; y int; sv jsonb; ss date; se date; out jsonb := '[]'::jsonb; ds jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF a IS NULL OR jsonb_array_length(coalesce(_p->'seasons','[]'::jsonb))=0 THEN RETURN out; END IF;
  PERFORM public.fin_validate_rule(_p);
  FOR y IN (extract(year FROM a)::int - 1) .. (extract(year FROM a)::int + 3) LOOP
    FOR sv IN SELECT x FROM jsonb_array_elements(_p->'seasons') x ORDER BY x->>'from' LOOP
      ss := public.fin_month_date(make_date(y, split_part(sv->>'from','-',1)::int, 1), split_part(sv->>'from','-',2)::int, 0);
      se := public.fin_month_date(make_date(y + CASE WHEN sv->>'to' < sv->>'from' THEN 1 ELSE 0 END, split_part(sv->>'to','-',1)::int, 1), split_part(sv->>'to','-',2)::int, 0);
      CONTINUE WHEN se < a;
      SELECT coalesce(jsonb_agg(d ORDER BY d),'[]') INTO ds FROM (SELECT due d FROM public.fin_gen_dates(_p, greatest(ss,a), se) ORDER BY due LIMIT 3) z;
      out := out || jsonb_build_object('start', greatest(ss,a), 'end', se, 'dates', ds);
      IF jsonb_array_length(out) >= 2 THEN RETURN out; END IF;
    END LOOP;
  END LOOP;
  RETURN out;
END $$;

-- Pauses : prise en compte des levées
CREATE OR REPLACE FUNCTION public.fin_rule_json(_o public.fin_obligations) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT to_jsonb(_o) || jsonb_build_object('pauses', coalesce((SELECT jsonb_agg(jsonb_build_object('start_date',p.start_date,
     'end_date', CASE WHEN p.lifted_from IS NOT NULL THEN least(p.end_date, p.lifted_from - 1) ELSE p.end_date END))
     FROM public.fin_pauses p WHERE p.obligation_id=_o.id),'[]'::jsonb)) $$;

CREATE OR REPLACE FUNCTION public.fin_add_pause(_id uuid, _start date, _end date, _reason text, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; aff jsonb; prot jsonb; nc int; pid uuid;
BEGIN
  SELECT * INTO o FROM public.fin_obligations WHERE id=_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _start IS NULL OR _end IS NULL THEN RAISE EXCEPTION 'Début et fin de suspension requis'; END IF;
  IF _end < _start THEN RAISE EXCEPTION 'La date de fin précède la date de début'; END IF;
  IF _start < current_date THEN RAISE EXCEPTION 'Une suspension commence aujourd''hui ou plus tard : les échéances passées restent dues'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  PERFORM public.fin_ensure_occurrences(o.company_id, _start, _end);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'due',due_date,'amount',amount) ORDER BY due_date) FILTER (WHERE public.fin_occ_paid(id)=0),'[]'),
         coalesce(jsonb_agg(jsonb_build_object('id',id,'due',due_date,'amount',amount,'paid',public.fin_occ_paid(id)) ORDER BY due_date) FILTER (WHERE public.fin_occ_paid(id)>0),'[]')
    INTO aff, prot FROM public.fin_occurrences WHERE obligation_id=_id AND status='active' AND due_date BETWEEN _start AND _end;
  IF _dry THEN RETURN jsonb_build_object('affected', aff, 'protected', prot); END IF;
  INSERT INTO public.fin_pauses(company_id, obligation_id, start_date, end_date, reason, created_by) VALUES (o.company_id, _id, _start, _end, btrim(_reason), auth.uid()) RETURNING id INTO pid;
  PERFORM set_config('fin.cancel_source', 'pause:'||pid, true);
  UPDATE public.fin_occurrences SET status='cancelled', cancel_reason='Suspendue du '||_start||' au '||_end||' : '||btrim(_reason), updated_at=now()
   WHERE obligation_id=_id AND status='active' AND due_date BETWEEN _start AND _end AND public.fin_occ_paid(id)=0;
  GET DIAGNOSTICS nc = ROW_COUNT;
  PERFORM set_config('fin.cancel_source', '', true);
  UPDATE public.fin_obligations SET rev=rev+1, updated_at=now() WHERE id=_id;
  PERFORM public.fin_log(o.company_id, _id, NULL, 'pause', btrim(_reason), NULL, jsonb_build_object('start',_start,'end',_end,'cancelled',nc,'pause_id',pid,'protected',prot));
  RETURN jsonb_build_object('affected', aff, 'cancelled', nc, 'protected', prot);
END $$;

-- Lever une suspension : seules les échéances supprimées par CETTE suspension, encore prévues par la règle applicable
CREATE OR REPLACE FUNCTION public.fin_lift_pause(_pause uuid, _effective date, _reason text, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.fin_pauses; o public.fin_obligations; eff date; rest jsonb; na jsonb; kept int; ids uuid[];
BEGIN
  SELECT * INTO p FROM public.fin_pauses WHERE id=_pause FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO o FROM public.fin_obligations WHERE id=p.obligation_id FOR UPDATE;
  IF NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF p.lifted_from IS NOT NULL THEN RAISE EXCEPTION 'Suspension déjà levée le %', p.lifted_from; END IF;
  IF _effective IS NULL OR _effective < current_date THEN RAISE EXCEPTION 'Date de reprise : aujourd''hui ou plus tard (aucun rattrapage des dates passées)'; END IF;
  IF _effective > p.end_date THEN RAISE EXCEPTION 'La reprise tombe après la fin de la suspension (%) : rien à lever', p.end_date; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  eff := greatest(_effective, p.start_date);
  WITH c AS (
    SELECT oc.*, coalesce(substring(oc.occ_key from '@g([0-9]+)$')::int, 1) g FROM public.fin_occurrences oc
     WHERE oc.obligation_id=o.id AND oc.status='cancelled' AND oc.cancel_source='pause:'||p.id AND oc.due_date >= eff),
  e AS (SELECT c.*, (
      ((c.g = o.rule_gen AND (o.rule_from IS NULL OR c.due_date >= o.rule_from))
        OR (c.g < o.rule_gen AND c.due_date < coalesce((SELECT r.valid_until FROM public.fin_obligation_rules r WHERE r.obligation_id=o.id AND r.rule_gen=c.g), '-infinity'::date)))
      AND (o.archived_effective IS NULL OR c.due_date < o.archived_effective) AND (o.end_date IS NULL OR c.due_date <= o.end_date) AND o.status <> 'draft'
      AND NOT EXISTS (SELECT 1 FROM public.fin_pauses q WHERE q.obligation_id=o.id AND q.id<>p.id
           AND c.due_date BETWEEN q.start_date AND CASE WHEN q.lifted_from IS NOT NULL THEN least(q.end_date, q.lifted_from-1) ELSE q.end_date END)) ok FROM c)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'due',due_date,'amount',amount) ORDER BY due_date) FILTER (WHERE ok),'[]'),
         coalesce(jsonb_agg(jsonb_build_object('id',id,'due',due_date) ORDER BY due_date) FILTER (WHERE NOT ok),'[]'),
         array_agg(id) FILTER (WHERE ok)
    INTO rest, na, ids FROM e;
  SELECT count(*) INTO kept FROM public.fin_occurrences WHERE obligation_id=o.id AND status='cancelled' AND due_date BETWEEN eff AND p.end_date AND coalesce(cancel_source,'') <> 'pause:'||p.id;
  IF _dry THEN RETURN jsonb_build_object('restore', rest, 'not_applicable', na, 'kept_other', kept, 'effective', eff); END IF;
  UPDATE public.fin_pauses SET lifted_from=eff, lifted_at=now(), lifted_by=auth.uid(), lift_reason=btrim(_reason) WHERE id=p.id;
  UPDATE public.fin_occurrences SET status='active', cancel_reason=NULL, cancel_source=NULL, updated_at=now() WHERE id = ANY(coalesce(ids, ARRAY[]::uuid[]));
  UPDATE public.fin_obligations SET rev=rev+1, updated_at=now() WHERE id=o.id;
  PERFORM public.fin_log(o.company_id, o.id, NULL, 'pause_lift', btrim(_reason), jsonb_build_object('pause_id',p.id,'start',p.start_date,'end',p.end_date), jsonb_build_object('effective',eff,'restored',rest,'kept_other',kept));
  PERFORM public.fin_ensure_occurrences(o.company_id, eff, p.end_date);
  RETURN jsonb_build_object('restore', rest, 'not_applicable', na, 'kept_other', kept, 'effective', eff);
END $$;

-- Sélection enrichie : soldes, état de règlement, retard, fréquence de la version d'origine
DROP FUNCTION public.fin_select(uuid,date,date,text,jsonb);
CREATE FUNCTION public.fin_select(_company uuid, _from date, _to date, _base text, _f jsonb)
RETURNS TABLE(id uuid, obligation_id uuid, due_date date, planned_date date, ref_date date, amount numeric, amount_quality text, status text, cancel_reason text, amount_override boolean, planned_override boolean, label text, payee text, category_id uuid, category text, frequency text, truck_id uuid, project_id uuid, nature text, interval_n int, seasonal boolean, planned_reason text, occ_key text,
  payee_key text, paid numeric, balance numeric, settle text, late boolean, rule_frequency text, rule_interval int, rule_known boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    AND (_f->>'quality' IS NULL OR oc.amount_quality=_f->>'quality')
    AND (_f->>'frequency' IS NULL OR ob.frequency=_f->>'frequency')
    AND (_f->>'seasonal' IS NULL OR (jsonb_array_length(ob.seasons) > 0) = ((_f->>'seasonal')='1'))
    AND (_f->>'category_id' IS NULL OR ob.category_id=(_f->>'category_id')::uuid)
    AND (_f->>'truck_id' IS NULL OR ob.truck_id=(_f->>'truck_id')::uuid)
    AND (_f->>'project_id' IS NULL OR ob.project_id=(_f->>'project_id')::uuid)
    AND (_f->>'payee' IS NULL OR coalesce(cl.name, ob.payee_label) ILIKE '%'||(_f->>'payee')||'%')
    AND (_f->>'payee_key' IS NULL OR public.fin_payee_key(ob)=_f->>'payee_key')
    AND (_f->>'q' IS NULL OR ob.label ILIKE '%'||(_f->>'q')||'%' OR coalesce(cl.name, ob.payee_label,'') ILIKE '%'||(_f->>'q')||'%' OR coalesce(ob.contract_ref,'') ILIKE '%'||(_f->>'q')||'%')
    AND (_f->>'method' IS NULL AND _f->>'paid_from' IS NULL AND _f->>'paid_to' IS NULL OR EXISTS (
         SELECT 1 FROM public.fin_allocations al JOIN public.fin_payments p ON p.id=al.payment_id AND p.status='validated'
          WHERE al.occurrence_id=oc.id AND al.reversed_at IS NULL AND (_f->>'method' IS NULL OR p.method=_f->>'method')
            AND (_f->>'paid_from' IS NULL OR p.paid_on >= (_f->>'paid_from')::date) AND (_f->>'paid_to' IS NULL OR p.paid_on <= (_f->>'paid_to')::date)))
  ) x(id, obligation_id, due_date, planned_date, ref_date, amount, amount_quality, status, cancel_reason, amount_override, planned_override, label, payee, category_id, category, frequency, truck_id, project_id, nature, interval_n, seasonal, planned_reason, occ_key, payee_key, paid, balance, settle, late, rule_frequency, rule_interval, rule_known)
  WHERE (_f->>'settle' IS NULL OR x.settle=_f->>'settle' OR (_f->>'settle'='late' AND x.late))
$$;
REVOKE EXECUTE ON FUNCTION public.fin_select(uuid,date,date,text,jsonb) FROM PUBLIC, anon, authenticated;

-- Totaux : bases séparées (exigible par échéance / soldes à ce jour / versements par date de versement / reliquats)
CREATE OR REPLACE FUNCTION public.fin_period_totals(_company uuid, _from date, _to date, _base text DEFAULT 'due', _f jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; d jsonb; u jsonb;
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
     'returned', coalesce((SELECT sum(amount) FROM public.fin_payments WHERE company_id=_company AND status='returned' AND paid_on BETWEEN _from AND _to),0),
     'drafts', (SELECT count(*) FROM public.fin_payments WHERE company_id=_company AND status='draft'))
    INTO d FROM public.fin_payments WHERE company_id=_company AND status='validated' AND paid_on BETWEEN _from AND _to AND (_f->>'method' IS NULL OR method=_f->>'method');
  SELECT jsonb_build_object('unallocated', coalesce(sum(av),0), 'unallocated_count', count(*)) INTO u
    FROM (SELECT public.fin_payment_avail(id) av FROM public.fin_payments WHERE company_id=_company AND status='validated') z WHERE av > 0;
  RETURN r || d || u;
END $$;

-- Affectations (verrouillage des échéances, contrôle bénéficiaire/entreprise/solde)
CREATE OR REPLACE FUNCTION public.fin__alloc(_company uuid, _payee text, _allocs jsonb, _avail numeric, _dry boolean, _pid uuid DEFAULT NULL, _idem text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; tot numeric := 0; rows jsonb := '[]'::jsonb; paid numeric; bal numeric; nreq int;
BEGIN
  SELECT count(DISTINCT e->>'occurrence_id') INTO nreq FROM jsonb_array_elements(coalesce(_allocs,'[]'::jsonb)) e;
  IF nreq = 0 THEN RAISE EXCEPTION 'Choisir au moins une échéance à couvrir'; END IF;
  FOR r IN SELECT oc.*, ob.label AS olabel, public.fin_payee_key(ob) AS pk, x.amt AS req
    FROM (SELECT (e->>'occurrence_id')::uuid AS oid, round(sum(nullif(e->>'amount','')::numeric),2) AS amt FROM jsonb_array_elements(_allocs) e GROUP BY 1) x
    JOIN public.fin_occurrences oc ON oc.id=x.oid JOIN public.fin_obligations ob ON ob.id=oc.obligation_id
    ORDER BY oc.id FOR UPDATE OF oc
  LOOP
    IF r.company_id <> _company THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
    IF r.pk <> _payee THEN RAISE EXCEPTION 'L''échéance « % » du % relève d''un autre bénéficiaire : préparez un règlement distinct', r.olabel, r.due_date; END IF;
    IF r.status <> 'active' THEN RAISE EXCEPTION 'Échéance du % annulée : aucun règlement possible', r.due_date; END IF;
    IF r.amount_quality='unknown' THEN RAISE EXCEPTION 'Montant à compléter pour l''échéance du % : renseignez-le avant d''enregistrer un règlement', r.due_date; END IF;
    IF r.amount = 0 THEN RAISE EXCEPTION 'Échéance du % : aucun montant à régler', r.due_date; END IF;
    IF r.req IS NULL OR r.req <= 0 THEN RAISE EXCEPTION 'Affectation : montant supérieur à 0 requis (échéance du %)', r.due_date; END IF;
    paid := public.fin_occ_paid(r.id); bal := r.amount - paid;
    IF bal <= 0 THEN RAISE EXCEPTION 'Échéance du % déjà réglée (solde 0 $). Rechargez pour voir l''état actuel.', r.due_date USING ERRCODE='P0409'; END IF;
    IF r.req > bal THEN RAISE EXCEPTION 'Solde actualisé pour l''échéance du % : il reste % $, affectation de % $ refusée. Rechargez ou ajustez le montant.', r.due_date, bal, r.req USING ERRCODE='P0409'; END IF;
    tot := tot + r.req;
    rows := rows || jsonb_build_object('occurrence_id', r.id, 'label', r.olabel, 'due', r.due_date, 'amount', r.amount, 'quality', r.amount_quality, 'paid_before', paid, 'alloc', r.req, 'balance_after', bal - r.req);
    IF NOT _dry THEN
      INSERT INTO public.fin_allocations(company_id, payment_id, occurrence_id, amount, created_by, idem_key)
      VALUES (_company, _pid, r.id, r.req, auth.uid(), CASE WHEN _idem IS NOT NULL THEN _idem||':'||r.id END);
      PERFORM public.fin_log_pay(_company, _pid, r.obligation_id, r.id, 'allocate', NULL, jsonb_build_object('amount', r.req, 'balance_after', bal - r.req));
    END IF;
  END LOOP;
  IF jsonb_array_length(rows) <> nreq THEN RAISE EXCEPTION 'Échéance introuvable' USING ERRCODE='42501'; END IF;
  IF tot > _avail THEN RAISE EXCEPTION 'Total affecté (% $) supérieur au montant disponible du versement (% $)', tot, _avail USING ERRCODE='P0409'; END IF;
  RETURN jsonb_build_object('rows', rows, 'total', tot);
END $$;

CREATE OR REPLACE FUNCTION public.fin_payment_save(_company uuid, _p jsonb, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE amt numeric := round(nullif(_p->>'amount','')::numeric,2); d date := nullif(_p->>'paid_on','')::date; m text := _p->>'method';
  dr boolean := coalesce((_p->>'draft')::boolean,false); idem text := nullif(_p->>'idem_key',''); ex public.fin_payments; pid uuid;
  allocs jsonb := coalesce(_p->'allocations','[]'::jsonb); payee text; pname text; res jsonb; dups jsonb; src text := nullif(btrim(_p->>'source_label'),'');
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF idem IS NULL THEN RAISE EXCEPTION 'Clé technique de saisie manquante'; END IF;
  SELECT * INTO ex FROM public.fin_payments WHERE company_id=_company AND idem_key=idem;
  IF ex.id IS NOT NULL THEN RETURN jsonb_build_object('payment_id', ex.id, 'replayed', true, 'status', ex.status); END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Montant du versement : supérieur à 0 $'; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'Date du versement requise'; END IF;
  IF m IS NULL OR m NOT IN ('interac','virement','cheque','especes','carte','prelevement','autre') THEN RAISE EXCEPTION 'Moyen de paiement à choisir'; END IF;
  IF d > current_date AND NOT dr THEN RAISE EXCEPTION 'Date future : un versement à venir s''enregistre comme brouillon (planification), pas comme versement effectué'; END IF;
  IF coalesce(src,'') ~ '[0-9]{7,}' OR regexp_replace(coalesce(_p->>'reference',''),'[^0-9]','','g') ~ '^[0-9]{13,19}$' THEN
    RAISE EXCEPTION 'Ne saisissez jamais un numéro complet de carte ou de compte : 4 derniers chiffres au plus'; END IF;
  SELECT public.fin_payee_key(ob), coalesce(cl.name, ob.payee_label, ob.label) INTO payee, pname
    FROM public.fin_occurrences oc JOIN public.fin_obligations ob ON ob.id=oc.obligation_id
    LEFT JOIN public.ent_crm_clients cl ON cl.id=ob.payee_client_id AND cl.company_id=ob.company_id
   WHERE oc.id = nullif(allocs->0->>'occurrence_id','')::uuid AND oc.company_id=_company;
  IF payee IS NULL THEN RAISE EXCEPTION 'Échéance introuvable' USING ERRCODE='42501'; END IF;
  res := public.fin__alloc(_company, payee, allocs, amt, true);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'paid_on',paid_on,'amount',amount,'method',method,'reference',reference)),'[]') INTO dups
    FROM public.fin_payments WHERE company_id=_company AND payee_key=payee AND amount=amt AND paid_on=d AND status='validated';
  IF _dry THEN RETURN res || jsonb_build_object('payee', pname, 'amount', amt, 'remainder', amt - (res->>'total')::numeric, 'duplicates', dups, 'draft', dr); END IF;
  INSERT INTO public.fin_payments(company_id, payee_key, payee_name, amount, paid_on, method, source_label, reference, note, status, draft_alloc, validated_at, idem_key, created_by, is_support)
  VALUES (_company, payee, pname, amt, d, m, src, nullif(btrim(_p->>'reference'),''), nullif(btrim(_p->>'note'),''),
          CASE WHEN dr THEN 'draft' ELSE 'validated' END, CASE WHEN dr THEN allocs END, CASE WHEN dr THEN NULL ELSE now() END, idem, auth.uid(), public.has_role(auth.uid(),'admin'))
  ON CONFLICT (company_id, idem_key) DO NOTHING RETURNING id INTO pid;
  IF pid IS NULL THEN SELECT id INTO pid FROM public.fin_payments WHERE company_id=_company AND idem_key=idem; RETURN jsonb_build_object('payment_id', pid, 'replayed', true); END IF;
  PERFORM public.fin_log_pay(_company, pid, NULL, NULL, CASE WHEN dr THEN 'payment_draft' ELSE 'payment' END, NULL, jsonb_build_object('amount',amt,'paid_on',d,'method',m));
  IF NOT dr THEN res := public.fin__alloc(_company, payee, allocs, amt, false, pid); END IF;
  RETURN res || jsonb_build_object('payment_id', pid, 'payee', pname, 'amount', amt, 'remainder', amt - (res->>'total')::numeric, 'duplicates', dups, 'draft', dr);
END $$;

CREATE OR REPLACE FUNCTION public.fin_payment_validate(_payment uuid, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.fin_payments; res jsonb;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Seul un brouillon peut être validé' USING ERRCODE='P0409'; END IF;
  IF p.paid_on > current_date THEN RAISE EXCEPTION 'Date du versement future (%) : il reste un brouillon tant que le versement n''est pas effectué', p.paid_on; END IF;
  res := public.fin__alloc(p.company_id, p.payee_key, p.draft_alloc, p.amount, _dry, p.id);
  IF _dry THEN RETURN res; END IF;
  UPDATE public.fin_payments SET status='validated', validated_at=now() WHERE id=p.id;
  PERFORM public.fin_log_pay(p.company_id, p.id, NULL, NULL, 'payment_validate', NULL, res);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.fin_payment_allocate(_payment uuid, _allocs jsonb, _idem text, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.fin_payments; av numeric; res jsonb;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF p.status <> 'validated' THEN RAISE EXCEPTION 'Versement non validé ou annulé : affectation impossible'; END IF;
  IF _idem IS NOT NULL AND EXISTS (SELECT 1 FROM public.fin_allocations WHERE company_id=p.company_id AND idem_key LIKE _idem||':%') THEN
    RETURN jsonb_build_object('replayed', true, 'available', public.fin_payment_avail(p.id)); END IF;
  av := public.fin_payment_avail(p.id);
  IF av <= 0 THEN RAISE EXCEPTION 'Aucun reliquat disponible sur ce versement (0 $). Rechargez pour voir l''état actuel.' USING ERRCODE='P0409'; END IF;
  res := public.fin__alloc(p.company_id, p.payee_key, _allocs, av, _dry, p.id, _idem);
  RETURN res || jsonb_build_object('available', av, 'remainder', av - (res->>'total')::numeric);
END $$;

CREATE OR REPLACE FUNCTION public.fin_payment_void(_payment uuid, _kind text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.fin_payments; a record; n int := 0;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_correct(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _kind NOT IN ('entry_error','returned') THEN RAISE EXCEPTION 'Type d''annulation invalide'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF p.status NOT IN ('validated','draft') THEN RAISE EXCEPTION 'Versement déjà annulé ou retourné' USING ERRCODE='P0409'; END IF;
  IF _kind='returned' AND p.status='draft' THEN RAISE EXCEPTION 'Un brouillon ne peut pas être « retourné » : annulez-le comme saisie'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_refunds WHERE payment_id=p.id AND voided_at IS NULL) THEN RAISE EXCEPTION 'Un remboursement est enregistré sur ce versement : annulez-le d''abord'; END IF;
  FOR a IN SELECT al.*, oc.obligation_id FROM public.fin_allocations al JOIN public.fin_occurrences oc ON oc.id=al.occurrence_id WHERE al.payment_id=p.id AND al.reversed_at IS NULL LOOP
    UPDATE public.fin_allocations SET reversed_at=now(), reversed_by=auth.uid(), reversed_reason=CASE _kind WHEN 'entry_error' THEN 'Saisie annulée : ' ELSE 'Paiement retourné/refusé : ' END||btrim(_reason) WHERE id=a.id;
    PERFORM public.fin_log_pay(p.company_id, p.id, a.obligation_id, a.occurrence_id, 'allocation_reversed', btrim(_reason), jsonb_build_object('amount', a.amount, 'kind', _kind));
    n := n + 1;
  END LOOP;
  UPDATE public.fin_payments SET status=CASE _kind WHEN 'entry_error' THEN 'voided' ELSE 'returned' END, void_reason=btrim(_reason), voided_at=now(), voided_by=auth.uid() WHERE id=p.id;
  PERFORM public.fin_log_pay(p.company_id, p.id, NULL, NULL, CASE _kind WHEN 'entry_error' THEN 'payment_void' ELSE 'payment_returned' END, btrim(_reason), jsonb_build_object('allocations', n, 'amount', p.amount));
  RETURN jsonb_build_object('reversed', n, 'status', CASE _kind WHEN 'entry_error' THEN 'voided' ELSE 'returned' END);
END $$;

CREATE OR REPLACE FUNCTION public.fin_allocation_reverse(_alloc uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.fin_allocations; p public.fin_payments; ob uuid;
BEGIN
  SELECT * INTO a FROM public.fin_allocations WHERE id=_alloc;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.fin_payments WHERE id=a.payment_id FOR UPDATE;
  IF NOT public.fin_can_correct(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF a.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Affectation déjà retirée' USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_allocations SET reversed_at=now(), reversed_by=auth.uid(), reversed_reason='Affectation retirée : '||btrim(_reason) WHERE id=a.id;
  SELECT obligation_id INTO ob FROM public.fin_occurrences WHERE id=a.occurrence_id;
  PERFORM public.fin_log_pay(p.company_id, p.id, ob, a.occurrence_id, 'allocation_reversed', btrim(_reason), jsonb_build_object('amount', a.amount, 'kind', 'reallocate'));
END $$;

CREATE OR REPLACE FUNCTION public.fin_refund_add(_payment uuid, _amount numeric, _date date, _reason text, _dry boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.fin_payments; av numeric; amt numeric := round(_amount,2); rid uuid;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF p.status <> 'validated' THEN RAISE EXCEPTION 'Versement non validé ou annulé : aucun remboursement possible'; END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Montant remboursé : supérieur à 0 $'; END IF;
  IF _date IS NULL OR _date > current_date THEN RAISE EXCEPTION 'Date du remboursement reçu : aujourd''hui ou avant'; END IF;
  IF _date < p.paid_on THEN RAISE EXCEPTION 'Le remboursement ne peut pas précéder le versement (%)', p.paid_on; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  av := public.fin_payment_avail(p.id);
  IF amt > av THEN RAISE EXCEPTION 'Seul le reliquat non affecté peut être remboursé : % $ disponible', av USING ERRCODE='P0409'; END IF;
  IF _dry THEN RETURN jsonb_build_object('available', av, 'after', av - amt); END IF;
  INSERT INTO public.fin_refunds(company_id, payment_id, amount, refunded_on, reason, created_by) VALUES (p.company_id, p.id, amt, _date, btrim(_reason), auth.uid()) RETURNING id INTO rid;
  PERFORM public.fin_log_pay(p.company_id, p.id, NULL, NULL, 'refund', btrim(_reason), jsonb_build_object('amount', amt, 'date', _date, 'refund_id', rid));
  RETURN jsonb_build_object('refund_id', rid, 'available', av - amt);
END $$;

CREATE OR REPLACE FUNCTION public.fin_refund_void(_refund uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fin_refunds;
BEGIN
  SELECT * INTO r FROM public.fin_refunds WHERE id=_refund FOR UPDATE;
  IF r.id IS NULL OR NOT public.fin_can_correct(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF r.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Remboursement déjà annulé' USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_refunds SET voided_at=now(), voided_by=auth.uid(), void_reason=btrim(_reason) WHERE id=r.id;
  PERFORM public.fin_log_pay(r.company_id, r.payment_id, NULL, NULL, 'refund_void', btrim(_reason), jsonb_build_object('amount', r.amount));
END $$;

CREATE OR REPLACE FUNCTION public.fin_attach_file(_payment uuid, _path text, _name text, _mime text, _size bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.fin_payments; fid uuid;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _path NOT LIKE 'company/'||p.company_id||'/fin/%' THEN RAISE EXCEPTION 'Chemin de pièce invalide' USING ERRCODE='42501'; END IF;
  IF _mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic') THEN RAISE EXCEPTION 'Format non accepté (PDF, JPG, PNG, WEBP, HEIC)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='entcrm-files' AND name=_path) THEN RAISE EXCEPTION 'Fichier non reçu : relancez l''envoi'; END IF;
  INSERT INTO public.ent_crm_files(company_id, storage_path, file_name, mime_type, size_bytes, title, category, created_by)
  VALUES (p.company_id, _path, left(_name,200), _mime, _size, 'Justificatif de règlement', 'autre', auth.uid()) RETURNING id INTO fid;
  INSERT INTO public.fin_payment_files(company_id, payment_id, file_id, created_by) VALUES (p.company_id, p.id, fid, auth.uid());
  PERFORM public.fin_log_pay(p.company_id, p.id, NULL, NULL, 'file', NULL, jsonb_build_object('file', left(_name,200)));
  RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.fin_confirm_unsettled(_occ uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oc public.fin_occurrences;
BEGIN
  SELECT * INTO oc FROM public.fin_occurrences WHERE id=_occ;
  IF oc.id IS NULL OR NOT public.fin_can_write(oc.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF oc.settle_confirmed_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.fin_occurrences SET settle_confirmed_at=now(), settle_confirmed_by=auth.uid() WHERE id=_occ;
  PERFORM public.fin_log(oc.company_id, oc.obligation_id, _occ, 'confirm_unsettled', 'Situation antérieure validée : non réglée à ce jour', NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.fin_occurrence_detail(_occ uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oc public.fin_occurrences; row jsonb; al jsonb; ev jsonb;
BEGIN
  SELECT * INTO oc FROM public.fin_occurrences WHERE id=_occ;
  IF oc.id IS NULL OR NOT public.fin_can_read(oc.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(s) INTO row FROM public.fin_select(oc.company_id, oc.due_date, oc.due_date, 'due', '{"status":"all"}'::jsonb) s WHERE s.id=_occ;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'payment_id',p.id,'amount',a.amount,'allocated_on',a.allocated_on,'reversed_at',a.reversed_at,'reversed_reason',a.reversed_reason,
      'paid_on',p.paid_on,'method',p.method,'reference',p.reference,'pay_status',p.status,'pay_amount',p.amount,
      'files',(SELECT count(*) FROM public.fin_payment_files f WHERE f.payment_id=p.id)) ORDER BY a.created_at),'[]')
    INTO al FROM public.fin_allocations a JOIN public.fin_payments p ON p.id=a.payment_id WHERE a.occurrence_id=_occ;
  SELECT coalesce(jsonb_agg(jsonb_build_object('action',action,'reason',reason,'after',after,'created_at',created_at,'is_support',is_support) ORDER BY created_at DESC),'[]')
    INTO ev FROM public.fin_events WHERE occurrence_id=_occ;
  RETURN jsonb_build_object('occ', row, 'allocations', al, 'events', ev, 'confirmed_at', oc.settle_confirmed_at);
END $$;

CREATE OR REPLACE FUNCTION public.fin_payment_detail(_payment uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.fin_payments; al jsonb; rf jsonb; fl jsonb; ev jsonb; dups jsonb;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment;
  IF p.id IS NULL OR NOT public.fin_can_read(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'occurrence_id',a.occurrence_id,'amount',a.amount,'allocated_on',a.allocated_on,'reversed_at',a.reversed_at,'reversed_reason',a.reversed_reason,
      'due',oc.due_date,'label',ob.label,'occ_amount',oc.amount) ORDER BY oc.due_date),'[]')
    INTO al FROM public.fin_allocations a JOIN public.fin_occurrences oc ON oc.id=a.occurrence_id JOIN public.fin_obligations ob ON ob.id=oc.obligation_id WHERE a.payment_id=p.id;
  SELECT coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'voided_by' ORDER BY r.created_at),'[]') INTO rf FROM public.fin_refunds r WHERE r.payment_id=p.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'file_name',f.file_name,'mime_type',f.mime_type,'storage_path',f.storage_path,'created_at',pf.created_at) ORDER BY pf.created_at),'[]')
    INTO fl FROM public.fin_payment_files pf JOIN public.ent_crm_files f ON f.id=pf.file_id WHERE pf.payment_id=p.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('action',action,'reason',reason,'after',after,'created_at',created_at,'is_support',is_support) ORDER BY created_at DESC),'[]') INTO ev FROM public.fin_events WHERE payment_id=p.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'paid_on',paid_on,'amount',amount)),'[]') INTO dups FROM public.fin_payments
   WHERE company_id=p.company_id AND id<>p.id AND payee_key=p.payee_key AND amount=p.amount AND paid_on=p.paid_on AND status='validated';
  RETURN (to_jsonb(p) - 'created_by' - 'voided_by' - 'idem_key') || jsonb_build_object('available', public.fin_payment_avail(p.id), 'allocations', al, 'refunds', rf, 'files', fl, 'events', ev, 'duplicates', dups);
END $$;

CREATE OR REPLACE FUNCTION public.fin_payments_list(_company uuid, _from date, _to date, _f jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(z ORDER BY z.paid_on DESC, z.created_at DESC),'[]') INTO rows FROM (
    SELECT p.id, p.payee_name, p.payee_key, p.amount, p.paid_on, p.method, p.reference, p.status, p.created_at, p.entered_at,
      CASE WHEN p.status='validated' THEN public.fin_payment_avail(p.id) ELSE 0 END AS available,
      (SELECT count(*) FROM public.fin_payment_files f WHERE f.payment_id=p.id) AS files
    FROM public.fin_payments p WHERE p.company_id=_company
      AND ((_f->>'unallocated')='1' OR p.paid_on BETWEEN _from AND _to)
      AND (_f->>'method' IS NULL OR p.method=_f->>'method') AND (_f->>'pstatus' IS NULL OR p.status=_f->>'pstatus')
      AND (_f->>'payee' IS NULL OR p.payee_name ILIKE '%'||(_f->>'payee')||'%')
    LIMIT 300) z
  WHERE (_f->>'unallocated') IS NULL OR z.available > 0;
  RETURN rows;
END $$;

CREATE OR REPLACE FUNCTION public.fin_open_for_payee(_company uuid, _payee text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(z ORDER BY z.due_date, z.id),'[]') INTO rows FROM (
    SELECT oc.id, oc.due_date, ob.label, oc.amount, oc.amount_quality, oc.amount - public.fin_occ_paid(oc.id) AS balance
    FROM public.fin_occurrences oc JOIN public.fin_obligations ob ON ob.id=oc.obligation_id
    WHERE oc.company_id=_company AND public.fin_payee_key(ob)=_payee AND oc.status='active' AND oc.amount_quality<>'unknown' AND oc.amount > 0
      AND oc.amount - public.fin_occ_paid(oc.id) > 0 AND oc.due_date <= current_date + 400
    ORDER BY oc.due_date LIMIT 100) z;
  RETURN rows;
END $$;

CREATE OR REPLACE FUNCTION public.fin_exploitant_candidates() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'created_at',created_at) ORDER BY name),'[]') FROM public.jsc_companies
    WHERE archived_at IS NULL AND (name ILIKE '%vrac%' OR name ILIKE '%dompe%'));
END $$;

REVOKE EXECUTE ON FUNCTION public.fin__alloc(uuid,text,jsonb,numeric,boolean,uuid,text), public.fin_log_pay(uuid,uuid,uuid,uuid,text,text,jsonb), public.fin_occ_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_season_sample(uuid,jsonb), public.fin_lift_pause(uuid,date,text,boolean), public.fin_payment_save(uuid,jsonb,boolean), public.fin_payment_validate(uuid,boolean),
  public.fin_payment_allocate(uuid,jsonb,text,boolean), public.fin_payment_void(uuid,text,text), public.fin_allocation_reverse(uuid,text), public.fin_refund_add(uuid,numeric,date,text,boolean),
  public.fin_refund_void(uuid,text), public.fin_attach_file(uuid,text,text,text,bigint), public.fin_confirm_unsettled(uuid), public.fin_occurrence_detail(uuid), public.fin_payment_detail(uuid),
  public.fin_payments_list(uuid,date,date,jsonb), public.fin_open_for_payee(uuid,text), public.fin_exploitant_candidates(), public.fin_can_correct(uuid),
  public.fin_occ_paid(uuid), public.fin_payment_avail(uuid), public.fin_settle_since(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_season_sample(uuid,jsonb), public.fin_lift_pause(uuid,date,text,boolean), public.fin_payment_save(uuid,jsonb,boolean), public.fin_payment_validate(uuid,boolean),
  public.fin_payment_allocate(uuid,jsonb,text,boolean), public.fin_payment_void(uuid,text,text), public.fin_allocation_reverse(uuid,text), public.fin_refund_add(uuid,numeric,date,text,boolean),
  public.fin_refund_void(uuid,text), public.fin_attach_file(uuid,text,text,text,bigint), public.fin_confirm_unsettled(uuid), public.fin_occurrence_detail(uuid), public.fin_payment_detail(uuid),
  public.fin_payments_list(uuid,date,date,jsonb), public.fin_open_for_payee(uuid,text), public.fin_exploitant_candidates(), public.fin_can_correct(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_occ_paid(uuid), public.fin_payment_avail(uuid), public.fin_settle_since(uuid) FROM authenticated;