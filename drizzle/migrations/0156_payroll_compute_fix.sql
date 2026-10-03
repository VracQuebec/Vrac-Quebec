CREATE OR REPLACE FUNCTION public.pay_run_compute(_company uuid, _from date, _to date, _pay_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
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