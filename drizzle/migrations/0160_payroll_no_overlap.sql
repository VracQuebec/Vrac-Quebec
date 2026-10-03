CREATE OR REPLACE FUNCTION public.pay_run_compute(_company uuid, _from date, _to date, _pay_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
#variable_conflict use_column
DECLARE r record; p jsonb; yr int := extract(year FROM _pay_date); run uuid; np numeric; e record; y record;
  g numeric; vac numeric; ins numeric; qpp numeric; ei numeric; qpip numeric; ann numeric; fed numeric; qc numeric; netv numeric; days int := _to - _from + 1;
  qpp_max numeric; ei_max numeric; qpip_max numeric; qpip_er numeric; fss numeric; cnt numeric;
BEGIN
  IF NOT public.entcrm_can_finance(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF days > 31 THEN RAISE EXCEPTION 'Période de paie de 31 jours maximum'; END IF;
  SELECT params INTO p FROM pay_rates WHERE year=yr; IF p IS NULL THEN RAISE EXCEPTION 'Aucun taux pour %', yr; END IF;
  np := CASE WHEN days <= 7 THEN 52 WHEN days <= 14 THEN 26 WHEN days <= 16 THEN 24 ELSE 12 END;
  qpp_max := ((p->>'qpp_max_pensionable')::numeric - (p->>'qpp_exempt')::numeric) * (p->>'qpp_rate')::numeric;
  ei_max := (p->>'ei_max_insurable')::numeric * (p->>'ei_rate')::numeric;
  qpip_max := (p->>'qpip_max')::numeric * (p->>'qpip_rate')::numeric;
  IF EXISTS (SELECT 1 FROM pay_runs o WHERE o.company_id=_company AND NOT (o.period_from=_from AND o.period_to=_to) AND o.period_from<=_to AND o.period_to>=_from AND o.status='finalise') THEN
    RAISE EXCEPTION 'Cette période chevauche une paie déjà finalisée : les mêmes heures seraient payées deux fois' USING ERRCODE='P0409'; END IF;
  SELECT id INTO run FROM pay_runs WHERE company_id=_company AND period_from=_from AND period_to=_to FOR UPDATE;
  IF run IS NOT NULL AND (SELECT status FROM pay_runs WHERE id=run)='finalise' THEN RAISE EXCEPTION 'Paie déjà finalisée' USING ERRCODE='P0409'; END IF;
  IF run IS NULL THEN INSERT INTO pay_runs(company_id,period_from,period_to,pay_date,rate_year,created_by) VALUES (_company,_from,_to,_pay_date,yr,auth.uid()) RETURNING id INTO run;
  ELSE UPDATE pay_runs SET pay_date=_pay_date, rate_year=yr WHERE id=run; DELETE FROM pay_stubs WHERE run_id=run; END IF;
  FOR r IN SELECT s.user_id, max(s.full_name) fn, sum(least(s.approved_min, 40*60))/60.0 reg, sum(greatest(s.approved_min - 40*60,0))/60.0 ot
           FROM pun_summary(_company,_from,_to) s GROUP BY s.user_id HAVING sum(s.approved_min) > 0 LOOP
    SELECT * INTO e FROM pay_employees WHERE company_id=_company AND user_id=r.user_id AND active;
    IF NOT FOUND OR e.hourly_rate <= 0 THEN CONTINUE; END IF;
    SELECT coalesce(sum(st.qpp),0) qpp, coalesce(sum(st.ei),0) ei, coalesce(sum(st.qpip),0) qpip, coalesce(sum(st.gross+st.vacation),0) ins
      INTO y FROM pay_stubs st JOIN pay_runs pr ON pr.id=st.run_id
     WHERE pr.company_id=_company AND pr.rate_year=yr AND pr.status='finalise' AND pr.id<>run AND st.user_id=r.user_id;
    g := round(r.reg*e.hourly_rate + r.ot*e.hourly_rate*(p->>'ot_factor')::numeric, 2);
    vac := round(g*e.vacation_pct/100, 2); ins := g + vac;
    qpp := round(greatest(least(ins, (p->>'qpp_max_pensionable')::numeric/np) - (p->>'qpp_exempt')::numeric/np, 0) * (p->>'qpp_rate')::numeric, 2);
    qpp := greatest(least(qpp, round(qpp_max - y.qpp, 2)), 0);
    ei := round(least(ins, (p->>'ei_max_insurable')::numeric/np) * (p->>'ei_rate')::numeric, 2);
    ei := greatest(least(ei, round(ei_max - y.ei, 2)), 0);
    qpip := round(least(ins, (p->>'qpip_max')::numeric/np) * (p->>'qpip_rate')::numeric, 2);
    qpip := greatest(least(qpip, round(qpip_max - y.qpip, 2)), 0);
    qpip_er := CASE WHEN (p->>'qpip_rate')::numeric > 0 THEN round(qpip * (p->>'qpip_employer_rate')::numeric / (p->>'qpip_rate')::numeric, 2) ELSE 0 END;
    ann := (ins - qpp) * np;
    fed := greatest(pay_bracket_tax(ann, p->'fed_brackets') - ((p->'fed_brackets'->0)->>1)::numeric * coalesce(e.fed_claim,(p->>'fed_basic')::numeric), 0);
    fed := round(fed * (1 - (p->>'fed_abatement')::numeric) / np, 2);
    qc := round(greatest(pay_bracket_tax(ann, p->'qc_brackets') - ((p->'qc_brackets'->0)->>1)::numeric * coalesce(e.qc_claim,(p->>'qc_basic')::numeric), 0) / np, 2);
    netv := ins - qpp - ei - qpip - fed - qc;
    fss := round(ins * coalesce((p->>'fss_rate')::numeric, 0), 2);
    cnt := round(ins * coalesce((p->>'cnesst_rate')::numeric, 0), 2);
    INSERT INTO pay_stubs(run_id,company_id,user_id,full_name,reg_hours,ot_hours,rate,gross,vacation,qpp,ei,qpip,fed_tax,qc_tax,net,employer)
    VALUES (run,_company,r.user_id,r.fn,round(r.reg,2),round(r.ot,2),e.hourly_rate,g,vac,qpp,ei,qpip,fed,qc,netv,
      jsonb_build_object('qpp',qpp,'ei',round(ei*(p->>'ei_employer_factor')::numeric,2),'qpip',qpip_er,'fss',fss,'cnesst',cnt,
        'cnesst_missing', (p->>'cnesst_rate') IS NULL,
        'ytd', jsonb_build_object('ins', y.ins + ins, 'qpp', y.qpp + qpp, 'ei', y.ei + ei, 'qpip', y.qpip + qpip)));
  END LOOP;
  UPDATE pay_runs SET totals = (SELECT jsonb_build_object('count',count(*),'gross',coalesce(sum(gross+vacation),0),'net',coalesce(sum(net),0),
     'withheld',coalesce(sum(qpp+ei+qpip+fed_tax+qc_tax),0),
     'employer',coalesce(sum((employer->>'qpp')::numeric+(employer->>'ei')::numeric+(employer->>'qpip')::numeric+coalesce((employer->>'fss')::numeric,0)+coalesce((employer->>'cnesst')::numeric,0)),0)) FROM pay_stubs WHERE run_id=run) WHERE id=run;
  RETURN run;
END $fn$;

CREATE OR REPLACE FUNCTION public.pay_run_overlap_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status='finalise' AND OLD.status IS DISTINCT FROM 'finalise' AND EXISTS (
    SELECT 1 FROM pay_runs o WHERE o.company_id=NEW.company_id AND o.id<>NEW.id AND o.status='finalise'
      AND o.period_from<=NEW.period_to AND o.period_to>=NEW.period_from) THEN
    RAISE EXCEPTION 'Cette période chevauche une paie déjà finalisée : les mêmes heures seraient payées deux fois' USING ERRCODE='P0409';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.pay_run_overlap_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pay_run_overlap_guard ON public.pay_runs;
CREATE TRIGGER pay_run_overlap_guard BEFORE UPDATE OF status ON public.pay_runs FOR EACH ROW EXECUTE FUNCTION public.pay_run_overlap_guard();