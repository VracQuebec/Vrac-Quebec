CREATE OR REPLACE FUNCTION public.pay_calc(p jsonb, i jsonb)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $function$
DECLARE
  np numeric := (i->>'np')::numeric; reg numeric := coalesce((i->>'regular')::numeric,0); bon numeric := coalesce((i->>'bonus')::numeric,0);
  y jsonb := coalesce(i->'ytd','{}'::jsonb); t numeric; yins numeric := coalesce((y->>'ins')::numeric,0);
  q1r numeric := (p->>'qpp_rate')::numeric; q1max numeric := ((p->>'qpp_max_pensionable')::numeric-(p->>'qpp_exempt')::numeric)*(p->>'qpp_rate')::numeric;
  q1 numeric; q1reg numeric; q2 numeric; ei numeric; eireg numeric; qp numeric; qpreg numeric; qper numeric;
  enh_share numeric := ((p->>'qpp_rate')::numeric-(p->>'qpp_base_rate')::numeric)/(p->>'qpp_rate')::numeric;
  a numeric; bpaf numeric; k1 numeric; k2q numeric; k4 numeric; fedann numeric; fedbon numeric; fed numeric;
  aq numeric; jded numeric; kq numeric; qcann numeric; qcbon numeric; qc numeric; missing text[] := '{}';
  er_ei numeric; er_qpp numeric; fss numeric; fssr numeric; norm numeric; cn numeric; mass numeric := (i->>'total_payroll')::numeric;
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
  IF p->>'fed_cea' IS NULL THEN missing := array_append(missing, 'fed_cea'); END IF;
  k4 := (p->>'fed_credit_rate')::numeric * least(a, coalesce((p->>'fed_cea')::numeric,0));
  fedann := greatest(pay_bracket_tax(a, p->'fed_brackets') - k1 - k2q - k4, 0) * (1 - (p->>'fed_abatement')::numeric);
  fedbon := CASE WHEN bon > 0 THEN greatest(pay_bracket_tax(a + bon, p->'fed_brackets') - k1 - k2q - k4, 0) * (1 - (p->>'fed_abatement')::numeric) - fedann ELSE 0 END;
  fed := round(fedann/np + fedbon, 2);

  IF p->>'qc_worker_ded_rate' IS NULL OR p->>'qc_worker_ded_max' IS NULL THEN missing := array_append(missing, 'qc_worker_deduction'); END IF;
  jded := least(np*reg*coalesce((p->>'qc_worker_ded_rate')::numeric,0), coalesce((p->>'qc_worker_ded_max')::numeric,0));
  aq := greatest(np*(reg - q1reg*enh_share) - jded, 0);
  kq := (p->>'qc_credit_rate')::numeric * coalesce((i->>'qc_claim')::numeric, (p->>'qc_basic')::numeric);
  qcann := greatest(pay_bracket_tax(aq, p->'qc_brackets') - kq, 0);
  qcbon := CASE WHEN bon > 0 THEN greatest(pay_bracket_tax(aq + bon, p->'qc_brackets') - kq, 0) - qcann ELSE 0 END;
  qc := round(qcann/np + qcbon, 2);

  er_qpp := q1 + q2;
  er_ei := round(ei * (p->>'ei_employer_factor')::numeric, 2);
  fssr := CASE i->>'sector'
    WHEN 'ordinaire' THEN CASE WHEN mass IS NULL THEN NULL WHEN mass <= (p->'fss'->>'low')::numeric THEN (p->'fss'->>'low_rate')::numeric
                               WHEN mass >= (p->'fss'->>'high')::numeric THEN (p->'fss'->>'high_rate')::numeric
                               ELSE (p->'fss'->>'base')::numeric + (p->'fss'->>'slope')::numeric * mass/1000000 END
    WHEN 'public' THEN (p->'fss'->>'high_rate')::numeric ELSE NULL END;
  IF fssr IS NULL THEN missing := array_append(missing, 'fss'); END IF;
  fss := CASE WHEN fssr IS NULL THEN NULL ELSE round(t*fssr/100, 2) END;
  norm := CASE WHEN coalesce((i->>'normes_exempt')::boolean,false) THEN 0
               ELSE round(greatest(least(t, (p->>'normes_max')::numeric - yins), 0) * (p->>'normes_rate')::numeric, 2) END;
  cn := CASE WHEN i->>'cnesst_rate_per_100' IS NULL THEN NULL ELSE round(t*(i->>'cnesst_rate_per_100')::numeric/100, 2) END;
  IF cn IS NULL THEN missing := array_append(missing, 'cnesst'); END IF;
  IF i->>'ccq_applicable' IS NULL OR (i->>'ccq_applicable')::boolean THEN missing := array_append(missing, 'ccq'); END IF;

  RETURN jsonb_build_object(
    'total', t, 'qpp1', q1, 'qpp2', q2, 'qpp', q1+q2, 'ei', ei, 'qpip', qp, 'fed_tax', fed, 'qc_tax', qc,
    'net', t - q1 - q2 - ei - qp - fed - qc,
    'fed', jsonb_build_object('annual_income', round(a,2), 'bpaf', round(bpaf,2), 'k1', round(k1,2), 'k2q', round(k2q,2), 'k4', round(k4,2), 'bonus_tax', round(fedbon,2)),
    'qc', jsonb_build_object('annual_income', round(aq,2), 'worker_deduction', round(jded,2), 'k', round(kq,2), 'bonus_tax', round(qcbon,2)),
    'employer', jsonb_build_object('qpp', er_qpp, 'ei', er_ei, 'qpip', qper, 'fss', fss, 'fss_rate_pct', fssr, 'normes', norm, 'cnesst', cn,
       'fdrcmo_check', mass IS NOT NULL AND mass > (p->>'fdrcmo_threshold')::numeric),
    'missing', to_jsonb(missing));
END $function$;