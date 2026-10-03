-- Paie 2026 : paramètres versionnés, moteur unique pay_calc (miroir src/lib/payroll/engine.ts),
-- charges patronales par employeur, primes/corrections traçables, cumuls repris en cours d'année.
ALTER TABLE public.pay_rates ADD COLUMN IF NOT EXISTS effective_from date;
ALTER TABLE public.pay_rates ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.pay_rates SET effective_from = make_date(year,1,1) WHERE effective_from IS NULL;

ALTER TABLE public.pay_stubs ADD COLUMN IF NOT EXISTS bonus numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pay_stubs ADD COLUMN IF NOT EXISTS adjustments numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pay_stubs ADD COLUMN IF NOT EXISTS calc jsonb;

ALTER TABLE public.pay_employees ADD COLUMN IF NOT EXISTS ytd_opening jsonb;
ALTER TABLE public.pay_employees ADD COLUMN IF NOT EXISTS ytd_year int;
ALTER TABLE public.pay_employees ADD COLUMN IF NOT EXISTS ytd_reason text;

CREATE TABLE public.pay_employer_settings (
  company_id uuid PRIMARY KEY,
  sector text NOT NULL DEFAULT 'inconnu' CHECK (sector IN ('ordinaire','primaire_manufacturier','public','inconnu')),
  total_payroll numeric(14,2),
  cnesst_rate_per_100 numeric(8,4),
  ccq_applicable boolean,
  fdrcmo_training numeric(14,2),
  normes_exempt boolean NOT NULL DEFAULT false,
  notes text,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pay_employer_settings TO authenticated;
GRANT ALL ON public.pay_employer_settings TO service_role;
ALTER TABLE public.pay_employer_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY pes_read ON public.pay_employer_settings FOR SELECT TO authenticated USING (public.entcrm_can_finance(company_id));

CREATE TABLE public.pay_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('prime','correction')),
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  source_run_id uuid,
  applied_run_id uuid,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pay_adjustments TO authenticated;
GRANT ALL ON public.pay_adjustments TO service_role;
ALTER TABLE public.pay_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY padj_read ON public.pay_adjustments FOR SELECT TO authenticated USING (public.entcrm_can_finance(company_id) OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.pay_employer_settings_save(_company uuid, s jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.pay_can_manage(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  INSERT INTO pay_employer_settings(company_id, sector, total_payroll, cnesst_rate_per_100, ccq_applicable, fdrcmo_training, normes_exempt, notes, updated_by, updated_at)
  VALUES (_company, coalesce(s->>'sector','inconnu'), (s->>'total_payroll')::numeric, (s->>'cnesst_rate_per_100')::numeric,
          (s->>'ccq_applicable')::boolean, (s->>'fdrcmo_training')::numeric, coalesce((s->>'normes_exempt')::boolean,false), s->>'notes', auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE SET sector=excluded.sector, total_payroll=excluded.total_payroll, cnesst_rate_per_100=excluded.cnesst_rate_per_100,
    ccq_applicable=excluded.ccq_applicable, fdrcmo_training=excluded.fdrcmo_training, normes_exempt=excluded.normes_exempt, notes=excluded.notes,
    updated_by=auth.uid(), updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.pay_adjustment_add(_company uuid, _user uuid, _kind text, _amount numeric, _reason text, _source_run uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.pay_can_manage(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _kind = 'prime' AND _amount <= 0 THEN RAISE EXCEPTION 'Une prime doit être positive'; END IF;
  IF _amount = 0 THEN RAISE EXCEPTION 'Montant nul'; END IF;
  IF _source_run IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pay_runs WHERE id=_source_run AND company_id=_company AND status='finalise') THEN
    RAISE EXCEPTION 'Une correction se rattache à une paie finalisée de cette entreprise'; END IF;
  INSERT INTO pay_adjustments(company_id,user_id,kind,amount,reason,source_run_id,created_by)
  VALUES (_company,_user,_kind,round(_amount,2),trim(_reason),_source_run,auth.uid()) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.pay_employee_ytd_set(_company uuid, _user uuid, _year int, _ytd jsonb, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.pay_can_manage(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF EXISTS (SELECT 1 FROM pay_stubs st JOIN pay_runs r ON r.id=st.run_id WHERE r.company_id=_company AND st.user_id=_user AND r.rate_year=_year AND r.status='finalise') THEN
    RAISE EXCEPTION 'Des paies finalisées existent déjà cette année : corrigez par ajustement' USING ERRCODE='P0409'; END IF;
  UPDATE pay_employees SET ytd_opening=_ytd, ytd_year=_year, ytd_reason=trim(_reason), updated_by=auth.uid(), updated_at=now()
   WHERE company_id=_company AND user_id=_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employé sans fiche de paie'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pay_calc(p jsonb, i jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  np numeric := (i->>'np')::numeric; reg numeric := coalesce((i->>'regular')::numeric,0); bon numeric := coalesce((i->>'bonus')::numeric,0);
  y jsonb := coalesce(i->'ytd','{}'::jsonb); t numeric; yins numeric := coalesce((y->>'ins')::numeric,0);
  q1r numeric := (p->>'qpp_rate')::numeric; q1max numeric := ((p->>'qpp_max_pensionable')::numeric-(p->>'qpp_exempt')::numeric)*(p->>'qpp_rate')::numeric;
  q1 numeric; q1reg numeric; q2 numeric; ei numeric; eireg numeric; qp numeric; qpreg numeric; qper numeric;
  enh_share numeric := ((p->>'qpp_rate')::numeric-(p->>'qpp_base_rate')::numeric)/(p->>'qpp_rate')::numeric;
  a numeric; bpaf numeric; k1 numeric; k2q numeric; k4 numeric; fedann numeric; fedbon numeric; fed numeric;
  aq numeric; jded numeric; kq numeric; qcann numeric; qcbon numeric; qc numeric; missing text[] := '{}';
  er_ei numeric; er_qpp numeric; fss numeric; fssr numeric; norm numeric; cn numeric; P numeric := (i->>'total_payroll')::numeric;
BEGIN
  t := reg + bon;
  q1reg := round(greatest(reg - (p->>'qpp_exempt')::numeric/np, 0) * q1r, 2);
  q1 := round(greatest(t - (p->>'qpp_exempt')::numeric/np, 0) * q1r, 2);
  q1 := greatest(least(q1, q1max - coalesce((y->>'qpp1')::numeric,0)), 0);
  q2 := round(greatest(least(yins + t, (p->>'qpp2_ceiling')::numeric) - greatest(yins, (p->>'qpp_max_pensionable')::numeric), 0) * (p->>'qpp2_rate')::numeric, 2);
  q2 := greatest(least(q2, (p->>'qpp2_max')::numeric - coalesce((y->>'qpp2')::numeric,0)), 0);
  ei := greatest(least(round(t*(p->>'ei_rate')::numeric,2), round((p->>'ei_max_insurable')::numeric*(p->>'ei_rate')::numeric,2) - coalesce((y->>'ei')::numeric,0)), 0);
  eireg := round(reg*(p->>'ei_rate')::numeric,2);
  qp := greatest(least(round(t*(p->>'qpip_rate')::numeric,2), round((p->>'qpip_max')::numeric*(p->>'qpip_rate')::numeric,2) - coalesce((y->>'qpip')::numeric,0)), 0);
  qpreg := round(reg*(p->>'qpip_rate')::numeric,2);
  qper := greatest(least(round(t*(p->>'qpip_employer_rate')::numeric,2), round((p->>'qpip_max')::numeric*(p->>'qpip_employer_rate')::numeric,2) - coalesce((y->>'qpip_er')::numeric,0)), 0);

  a := greatest(np * (reg - q1reg*enh_share), 0);
  bpaf := CASE WHEN a <= (p->'fed_bpa'->>'from')::numeric THEN (p->'fed_bpa'->>'max')::numeric
               WHEN a >= (p->'fed_bpa'->>'to')::numeric THEN (p->'fed_bpa'->>'min')::numeric
               ELSE (p->'fed_bpa'->>'max')::numeric - ((p->'fed_bpa'->>'max')::numeric-(p->'fed_bpa'->>'min')::numeric)*(a-(p->'fed_bpa'->>'from')::numeric)/((p->'fed_bpa'->>'to')::numeric-(p->'fed_bpa'->>'from')::numeric) END;
  k1 := (p->>'fed_credit_rate')::numeric * coalesce((i->>'fed_claim')::numeric, bpaf);
  k2q := (p->>'fed_credit_rate')::numeric * (least(np*q1reg*(1-enh_share), q1max*(1-enh_share)) + least(np*eireg, (p->>'ei_max_insurable')::numeric*(p->>'ei_rate')::numeric) + least(np*qpreg, (p->>'qpip_max')::numeric*(p->>'qpip_rate')::numeric));
  IF p->>'fed_cea' IS NULL THEN missing := missing || 'fed_cea'; END IF;
  k4 := (p->>'fed_credit_rate')::numeric * least(a, coalesce((p->>'fed_cea')::numeric,0));
  fedann := greatest(pay_bracket_tax(a, p->'fed_brackets') - k1 - k2q - k4, 0) * (1 - (p->>'fed_abatement')::numeric);
  fedbon := CASE WHEN bon > 0 THEN greatest(pay_bracket_tax(a + bon, p->'fed_brackets') - k1 - k2q - k4, 0) * (1 - (p->>'fed_abatement')::numeric) - fedann ELSE 0 END;
  fed := round(fedann/np + fedbon, 2);

  IF p->>'qc_worker_ded_rate' IS NULL OR p->>'qc_worker_ded_max' IS NULL THEN missing := missing || 'qc_worker_deduction'; END IF;
  jded := least(np*reg*coalesce((p->>'qc_worker_ded_rate')::numeric,0), coalesce((p->>'qc_worker_ded_max')::numeric,0));
  aq := greatest(np*(reg - q1reg*enh_share) - jded, 0);
  kq := (p->>'qc_credit_rate')::numeric * coalesce((i->>'qc_claim')::numeric, (p->>'qc_basic')::numeric);
  qcann := greatest(pay_bracket_tax(aq, p->'qc_brackets') - kq, 0);
  qcbon := CASE WHEN bon > 0 THEN greatest(pay_bracket_tax(aq + bon, p->'qc_brackets') - kq, 0) - qcann ELSE 0 END;
  qc := round(qcann/np + qcbon, 2);

  er_qpp := q1 + q2;
  er_ei := round(ei * (p->>'ei_employer_factor')::numeric, 2);
  fssr := CASE i->>'sector'
    WHEN 'ordinaire' THEN CASE WHEN P IS NULL THEN NULL WHEN P <= (p->'fss'->>'low')::numeric THEN (p->'fss'->>'low_rate')::numeric
                               WHEN P >= (p->'fss'->>'high')::numeric THEN (p->'fss'->>'high_rate')::numeric
                               ELSE (p->'fss'->>'base')::numeric + (p->'fss'->>'slope')::numeric * P/1000000 END
    WHEN 'public' THEN (p->'fss'->>'high_rate')::numeric ELSE NULL END;
  IF fssr IS NULL THEN missing := missing || 'fss'; END IF;
  fss := CASE WHEN fssr IS NULL THEN NULL ELSE round(t*fssr/100, 2) END;
  norm := CASE WHEN coalesce((i->>'normes_exempt')::boolean,false) THEN 0
               ELSE round(greatest(least(t, (p->>'normes_max')::numeric - yins), 0) * (p->>'normes_rate')::numeric, 2) END;
  cn := CASE WHEN i->>'cnesst_rate_per_100' IS NULL THEN NULL ELSE round(t*(i->>'cnesst_rate_per_100')::numeric/100, 2) END;
  IF cn IS NULL THEN missing := missing || 'cnesst'; END IF;
  IF i->>'ccq_applicable' IS NULL OR (i->>'ccq_applicable')::boolean THEN missing := missing || 'ccq'; END IF;

  RETURN jsonb_build_object(
    'total', t, 'qpp1', q1, 'qpp2', q2, 'qpp', q1+q2, 'ei', ei, 'qpip', qp, 'fed_tax', fed, 'qc_tax', qc,
    'net', t - q1 - q2 - ei - qp - fed - qc,
    'fed', jsonb_build_object('annual_income', round(a,2), 'bpaf', round(bpaf,2), 'k1', round(k1,2), 'k2q', round(k2q,2), 'k4', round(k4,2), 'bonus_tax', round(fedbon,2)),
    'qc', jsonb_build_object('annual_income', round(aq,2), 'worker_deduction', round(jded,2), 'k', round(kq,2), 'bonus_tax', round(qcbon,2)),
    'employer', jsonb_build_object('qpp', er_qpp, 'ei', er_ei, 'qpip', qper, 'fss', fss, 'fss_rate_pct', fssr, 'normes', norm, 'cnesst', cn,
       'fdrcmo_check', P IS NOT NULL AND P > (p->>'fdrcmo_threshold')::numeric),
    'missing', to_jsonb(missing));
END $$;
GRANT EXECUTE ON FUNCTION public.pay_calc(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_run_compute(_company uuid, _from date, _to date, _pay_date date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
#variable_conflict use_column
DECLARE r record; p jsonb; yr int := extract(year FROM _pay_date); run uuid; np numeric; e record; y record; es record;
  g numeric; vac numeric; bon numeric; adj numeric; c jsonb; ytd jsonb; days int := _to - _from + 1;
BEGIN
  IF NOT public.pay_can_manage(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF days > 31 THEN RAISE EXCEPTION 'Période de paie de 31 jours maximum'; END IF;
  SELECT params INTO p FROM pay_rates WHERE year=yr AND coalesce(effective_from, make_date(year,1,1)) <= _pay_date;
  IF p IS NULL THEN RAISE EXCEPTION 'Aucun paramètre de paie en vigueur pour %', yr; END IF;
  SELECT * INTO es FROM pay_employer_settings WHERE company_id=_company;
  np := CASE WHEN days <= 7 THEN 52 WHEN days <= 14 THEN 26 WHEN days <= 16 THEN 24 ELSE 12 END;
  IF EXISTS (SELECT 1 FROM pay_runs o WHERE o.company_id=_company AND NOT (o.period_from=_from AND o.period_to=_to) AND o.period_from<=_to AND o.period_to>=_from AND o.status='finalise') THEN
    RAISE EXCEPTION 'Cette période chevauche une paie déjà finalisée : les mêmes heures seraient payées deux fois' USING ERRCODE='P0409'; END IF;
  SELECT id INTO run FROM pay_runs WHERE company_id=_company AND period_from=_from AND period_to=_to FOR UPDATE;
  IF run IS NOT NULL AND (SELECT status FROM pay_runs WHERE id=run)='finalise' THEN RAISE EXCEPTION 'Paie déjà finalisée' USING ERRCODE='P0409'; END IF;
  IF run IS NULL THEN INSERT INTO pay_runs(company_id,period_from,period_to,pay_date,rate_year,created_by) VALUES (_company,_from,_to,_pay_date,yr,auth.uid()) RETURNING id INTO run;
  ELSE UPDATE pay_runs SET pay_date=_pay_date, rate_year=yr WHERE id=run; DELETE FROM pay_stubs WHERE run_id=run;
       UPDATE pay_adjustments SET applied_run_id=NULL WHERE applied_run_id=run; END IF;
  FOR r IN
    WITH h AS (SELECT s.user_id, max(s.full_name) fn, sum(least(s.approved_min, 40*60))/60.0 reg, sum(greatest(s.approved_min - 40*60,0))/60.0 ot
               FROM pun_summary(_company,_from,_to) s GROUP BY s.user_id),
         a AS (SELECT DISTINCT user_id FROM pay_adjustments WHERE company_id=_company AND applied_run_id IS NULL AND created_at::date <= _pay_date)
    SELECT coalesce(h.user_id, a.user_id) user_id, h.fn, coalesce(h.reg,0) reg, coalesce(h.ot,0) ot
      FROM h FULL JOIN a ON a.user_id=h.user_id
     WHERE coalesce(h.reg,0)+coalesce(h.ot,0) > 0 OR a.user_id IS NOT NULL
  LOOP
    SELECT * INTO e FROM pay_employees WHERE company_id=_company AND user_id=r.user_id AND active;
    IF NOT FOUND OR e.hourly_rate <= 0 THEN CONTINUE; END IF;
    SELECT coalesce(sum(st.qpp - coalesce((st.calc->>'qpp2')::numeric,0)),0) qpp1, coalesce(sum((st.calc->>'qpp2')::numeric),0) qpp2,
           coalesce(sum(st.ei),0) ei, coalesce(sum(st.qpip),0) qpip, coalesce(sum((st.employer->>'qpip')::numeric),0) qpip_er,
           coalesce(sum(st.gross+st.vacation+st.bonus+st.adjustments),0) ins
      INTO y FROM pay_stubs st JOIN pay_runs pr ON pr.id=st.run_id
     WHERE pr.company_id=_company AND pr.rate_year=yr AND pr.status='finalise' AND pr.id<>run AND st.user_id=r.user_id;
    ytd := jsonb_build_object('ins', y.ins, 'qpp1', y.qpp1, 'qpp2', y.qpp2, 'ei', y.ei, 'qpip', y.qpip, 'qpip_er', y.qpip_er);
    IF e.ytd_year = yr AND e.ytd_opening IS NOT NULL THEN
      ytd := (SELECT jsonb_object_agg(k, coalesce((ytd->>k)::numeric,0) + coalesce((e.ytd_opening->>k)::numeric,0)) FROM jsonb_object_keys(ytd) k);
    END IF;
    SELECT coalesce(sum(amount) FILTER (WHERE kind='prime'),0), coalesce(sum(amount) FILTER (WHERE kind='correction'),0) INTO bon, adj
      FROM pay_adjustments WHERE company_id=_company AND user_id=r.user_id AND applied_run_id IS NULL AND created_at::date <= _pay_date;
    g := round(r.reg*e.hourly_rate + r.ot*e.hourly_rate*(p->>'ot_factor')::numeric, 2);
    vac := round(g*e.vacation_pct/100, 2);
    c := pay_calc(p, jsonb_build_object('np', np, 'regular', g + vac + adj, 'bonus', bon, 'ytd', ytd, 'fed_claim', e.fed_claim, 'qc_claim', e.qc_claim,
           'sector', coalesce(es.sector,'inconnu'), 'total_payroll', es.total_payroll, 'cnesst_rate_per_100', es.cnesst_rate_per_100,
           'ccq_applicable', es.ccq_applicable, 'normes_exempt', coalesce(es.normes_exempt,false)));
    INSERT INTO pay_stubs(run_id,company_id,user_id,full_name,reg_hours,ot_hours,rate,gross,vacation,bonus,adjustments,qpp,ei,qpip,fed_tax,qc_tax,net,employer,calc)
    VALUES (run,_company,r.user_id,r.fn,round(r.reg,2),round(r.ot,2),e.hourly_rate,g,vac,bon,adj,(c->>'qpp')::numeric,(c->>'ei')::numeric,(c->>'qpip')::numeric,
      (c->>'fed_tax')::numeric,(c->>'qc_tax')::numeric,(c->>'net')::numeric,
      (c->'employer') || jsonb_build_object('cnesst_missing', es.cnesst_rate_per_100 IS NULL, 'missing', c->'missing',
        'ytd', jsonb_build_object('ins', (ytd->>'ins')::numeric + (c->>'total')::numeric, 'qpp', (ytd->>'qpp1')::numeric + (ytd->>'qpp2')::numeric + (c->>'qpp')::numeric,
                                  'ei', (ytd->>'ei')::numeric + (c->>'ei')::numeric, 'qpip', (ytd->>'qpip')::numeric + (c->>'qpip')::numeric)), c);
    UPDATE pay_adjustments SET applied_run_id=run WHERE company_id=_company AND user_id=r.user_id AND applied_run_id IS NULL AND created_at::date <= _pay_date;
  END LOOP;
  UPDATE pay_runs SET totals = (SELECT jsonb_build_object('count',count(*),'gross',coalesce(sum(gross+vacation+bonus+adjustments),0),'net',coalesce(sum(net),0),
     'withheld',coalesce(sum(qpp+ei+qpip+fed_tax+qc_tax),0),
     'employer',coalesce(sum((employer->>'qpp')::numeric+(employer->>'ei')::numeric+(employer->>'qpip')::numeric+coalesce((employer->>'fss')::numeric,0)+coalesce((employer->>'normes')::numeric,0)+coalesce((employer->>'cnesst')::numeric,0)),0)) FROM pay_stubs WHERE run_id=run) WHERE id=run;
  RETURN run;
END $function$;

CREATE OR REPLACE FUNCTION public.pay_year_slips(_company uuid, _year integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE mgr boolean := public.pay_can_manage(_company);
BEGIN
  IF NOT mgr AND NOT EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id = _company AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
    SELECT jsonb_build_object('user_id', st.user_id, 'name', max(st.full_name), 'runs', count(*),
      'income', sum(st.gross + st.vacation + st.bonus + st.adjustments), 'qpp', sum(st.qpp), 'ei', sum(st.ei), 'qpip', sum(st.qpip),
      'fed_tax', sum(st.fed_tax), 'qc_tax', sum(st.qc_tax), 'net', sum(st.net)) x
    FROM pay_stubs st JOIN pay_runs r ON r.id = st.run_id
    WHERE r.company_id = _company AND r.status = 'finalise' AND extract(year FROM r.pay_date) = _year
      AND (mgr OR st.user_id = auth.uid())
    GROUP BY st.user_id) q), '[]'::jsonb);
END $function$;