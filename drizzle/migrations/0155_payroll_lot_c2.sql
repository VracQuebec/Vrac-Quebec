CREATE TABLE public.pay_rates (year int PRIMARY KEY, params jsonb NOT NULL, validated boolean NOT NULL DEFAULT false, note text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.pay_rates TO authenticated; GRANT ALL ON public.pay_rates TO service_role;
ALTER TABLE public.pay_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.pay_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY w ON public.pay_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.pay_rates(year, params, note) VALUES (2026, '{
 "qpp_rate":0.063,"qpp_exempt":3500,"qpp_max_pensionable":74000,
 "ei_rate":0.0130,"ei_max_insurable":68900,"ei_employer_factor":1.4,
 "qpip_rate":0.0043,"qpip_employer_rate":0.00602,"qpip_max":103000,
 "fed_brackets":[[0,0.14],[58523,0.205],[117045,0.26],[181440,0.29],[258482,0.33]],"fed_basic":16452,"fed_abatement":0.165,
 "qc_brackets":[[0,0.14],[54345,0.19],[108680,0.24],[132245,0.2575]],"qc_basic":18952,
 "ot_factor":1.5,"vacation_pct":4}'::jsonb, 'Taux approximatifs 2026 — à valider avec Revenu Québec et l''ARC avant toute paie réelle.') ON CONFLICT DO NOTHING;

CREATE TABLE public.pay_employees (company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE, user_id uuid NOT NULL,
 hourly_rate numeric(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0), vacation_pct numeric(5,2) NOT NULL DEFAULT 4 CHECK (vacation_pct BETWEEN 0 AND 20),
 fed_claim numeric(10,2), qc_claim numeric(10,2), active boolean NOT NULL DEFAULT true, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (company_id, user_id));
GRANT SELECT ON public.pay_employees TO authenticated; GRANT ALL ON public.pay_employees TO service_role;
ALTER TABLE public.pay_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.pay_employees FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.entcrm_can_finance(company_id));

CREATE TABLE public.pay_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
 period_from date NOT NULL, period_to date NOT NULL, pay_date date NOT NULL, rate_year int NOT NULL, status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','finalise')),
 totals jsonb NOT NULL DEFAULT '{}', created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), finalized_by uuid, finalized_at timestamptz, CHECK (period_to >= period_from));
CREATE UNIQUE INDEX pay_runs_period ON public.pay_runs(company_id, period_from, period_to);
GRANT SELECT ON public.pay_runs TO authenticated; GRANT ALL ON public.pay_runs TO service_role;
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.pay_runs FOR SELECT TO authenticated USING (public.entcrm_can_finance(company_id));

CREATE TABLE public.pay_stubs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE, company_id uuid NOT NULL, user_id uuid NOT NULL,
 full_name text, reg_hours numeric(8,2) NOT NULL, ot_hours numeric(8,2) NOT NULL, rate numeric(10,2) NOT NULL, gross numeric(12,2) NOT NULL, vacation numeric(12,2) NOT NULL,
 qpp numeric(12,2) NOT NULL, ei numeric(12,2) NOT NULL, qpip numeric(12,2) NOT NULL, fed_tax numeric(12,2) NOT NULL, qc_tax numeric(12,2) NOT NULL, net numeric(12,2) NOT NULL,
 employer jsonb NOT NULL, UNIQUE (run_id, user_id));
GRANT SELECT ON public.pay_stubs TO authenticated; GRANT ALL ON public.pay_stubs TO service_role;
ALTER TABLE public.pay_stubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.pay_stubs FOR SELECT TO authenticated USING (public.entcrm_can_finance(company_id) OR (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.pay_runs r WHERE r.id = run_id AND r.status='finalise')));

CREATE OR REPLACE FUNCTION public.pay_bracket_tax(_inc numeric, _br jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(sum(greatest(least(_inc, coalesce((_br->(i::int))->>0, '1e15')::numeric) - ((_br->(i::int-1))->>0)::numeric, 0) * ((_br->(i::int-1))->>1)::numeric),0)
  FROM generate_series(1, jsonb_array_length(_br)) i
$$;

CREATE OR REPLACE FUNCTION public.pay_employee_save(_company uuid, _user uuid, _rate numeric, _vac numeric, _fed numeric, _qc numeric, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.entcrm_can_finance(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id=_company AND user_id=_user) THEN RAISE EXCEPTION 'Employé hors entreprise'; END IF;
  INSERT INTO pay_employees(company_id,user_id,hourly_rate,vacation_pct,fed_claim,qc_claim,active,updated_by,updated_at)
  VALUES (_company,_user,_rate,coalesce(_vac,4),_fed,_qc,coalesce(_active,true),auth.uid(),now())
  ON CONFLICT (company_id,user_id) DO UPDATE SET hourly_rate=EXCLUDED.hourly_rate, vacation_pct=EXCLUDED.vacation_pct, fed_claim=EXCLUDED.fed_claim, qc_claim=EXCLUDED.qc_claim, active=EXCLUDED.active, updated_by=auth.uid(), updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.pay_run_compute(_company uuid, _from date, _to date, _pay_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; p jsonb; yr int := extract(year FROM _pay_date); run uuid; np numeric; e record;
  g numeric; vac numeric; ins numeric; qpp numeric; ei numeric; qpip numeric; ann numeric; fed numeric; qc numeric; netv numeric; days int := _to - _from + 1;
BEGIN
  IF NOT public.entcrm_can_finance(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF days > 31 THEN RAISE EXCEPTION 'Période de paie de 31 jours maximum'; END IF;
  SELECT params INTO p FROM pay_rates WHERE year=yr; IF p IS NULL THEN RAISE EXCEPTION 'Aucun taux pour %', yr; END IF;
  np := CASE WHEN days <= 7 THEN 52 WHEN days <= 14 THEN 26 WHEN days <= 16 THEN 24 ELSE 12 END;
  SELECT id INTO run FROM pay_runs WHERE company_id=_company AND period_from=_from AND period_to=_to FOR UPDATE;
  IF run IS NOT NULL AND (SELECT status FROM pay_runs WHERE id=run)='finalise' THEN RAISE EXCEPTION 'Paie déjà finalisée' USING ERRCODE='P0409'; END IF;
  IF run IS NULL THEN INSERT INTO pay_runs(company_id,period_from,period_to,pay_date,rate_year,created_by) VALUES (_company,_from,_to,_pay_date,yr,auth.uid()) RETURNING id INTO run;
  ELSE UPDATE pay_runs SET pay_date=_pay_date, rate_year=yr WHERE id=run; DELETE FROM pay_stubs WHERE run_id=run; END IF;
  FOR r IN SELECT s.user_id, max(s.full_name) fn, sum(least(s.approved_min, 40*60))/60.0 reg, sum(greatest(s.approved_min - 40*60,0))/60.0 ot
           FROM pun_summary(_company,_from,_to) s GROUP BY s.user_id HAVING sum(s.approved_min) > 0 LOOP
    SELECT * INTO e FROM pay_employees WHERE company_id=_company AND user_id=r.user_id AND active;
    IF NOT FOUND OR e.hourly_rate <= 0 THEN CONTINUE; END IF;
    g := round(r.reg*e.hourly_rate + r.ot*e.hourly_rate*(p->>'ot_factor')::numeric, 2);
    vac := round(g*e.vacation_pct/100, 2); ins := g + vac;
    qpp := round(greatest(least(ins, (p->>'qpp_max_pensionable')::numeric/np) - (p->>'qpp_exempt')::numeric/np, 0) * (p->>'qpp_rate')::numeric, 2);
    ei := round(least(ins, (p->>'ei_max_insurable')::numeric/np) * (p->>'ei_rate')::numeric, 2);
    qpip := round(least(ins, (p->>'qpip_max')::numeric/np) * (p->>'qpip_rate')::numeric, 2);
    ann := (ins - qpp) * np;
    fed := greatest(pay_bracket_tax(ann, p->'fed_brackets') - ((p->'fed_brackets'->0)->>1)::numeric * coalesce(e.fed_claim,(p->>'fed_basic')::numeric), 0);
    fed := round(fed * (1 - (p->>'fed_abatement')::numeric) / np, 2);
    qc := round(greatest(pay_bracket_tax(ann, p->'qc_brackets') - ((p->'qc_brackets'->0)->>1)::numeric * coalesce(e.qc_claim,(p->>'qc_basic')::numeric), 0) / np, 2);
    netv := ins - qpp - ei - qpip - fed - qc;
    INSERT INTO pay_stubs(run_id,company_id,user_id,full_name,reg_hours,ot_hours,rate,gross,vacation,qpp,ei,qpip,fed_tax,qc_tax,net,employer)
    VALUES (run,_company,r.user_id,r.fn,round(r.reg,2),round(r.ot,2),e.hourly_rate,g,vac,qpp,ei,qpip,fed,qc,netv,
      jsonb_build_object('qpp',qpp,'ei',round(ei*(p->>'ei_employer_factor')::numeric,2),'qpip',round(least(ins,(p->>'qpip_max')::numeric/np)*(p->>'qpip_employer_rate')::numeric,2)));
  END LOOP;
  UPDATE pay_runs SET totals = (SELECT jsonb_build_object('count',count(*),'gross',coalesce(sum(gross+vacation),0),'net',coalesce(sum(net),0),
     'withheld',coalesce(sum(qpp+ei+qpip+fed_tax+qc_tax),0),'employer',coalesce(sum((employer->>'qpp')::numeric+(employer->>'ei')::numeric+(employer->>'qpip')::numeric),0)) FROM pay_stubs WHERE run_id=run) WHERE id=run;
  RETURN run;
END $$;

CREATE OR REPLACE FUNCTION public.pay_run_finalize(_run uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid; st text;
BEGIN
  SELECT company_id, status INTO c, st FROM pay_runs WHERE id=_run FOR UPDATE;
  IF c IS NULL OR NOT public.entcrm_can_finance(c) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF st='finalise' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pay_stubs WHERE run_id=_run) THEN RAISE EXCEPTION 'Aucun talon à finaliser'; END IF;
  UPDATE pay_runs SET status='finalise', finalized_by=auth.uid(), finalized_at=now() WHERE id=_run;
END $$;

REVOKE EXECUTE ON FUNCTION public.pay_employee_save, public.pay_run_compute, public.pay_run_finalize FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pay_employee_save, public.pay_run_compute, public.pay_run_finalize TO authenticated;