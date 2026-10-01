-- FIN-09C2B1 : correctif — ajout d'erreurs par array_append (littéral texte sans ambiguïté de type).
CREATE OR REPLACE FUNCTION public.fin_ctax_validate(_i fin_invoices, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE errs text[] := '{}'; s ent_crm_settings; r jsonb; d date; today date := (now() AT TIME ZONE 'America/Toronto')::date;
  allowed text[] := ARRAY['mode','amount','pct','reason','basis','works','contract_ref','contract_date','clause_ref','release_condition','contractual_due','test_confirm'];
  k text; base numeric; pct numeric; dr jsonb; cdate date; due date; snap jsonb; ph text; sh text;
BEGIN
  IF jsonb_typeof(_p) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('errors', jsonb_build_array('Saisie invalide')); END IF;
  FOR k IN SELECT jsonb_object_keys(_p) LOOP
    IF NOT k = ANY(allowed) THEN errs := array_append(errs, ('Champ inconnu : ' || k)::text); ELSIF jsonb_typeof(_p->k) <> 'string' THEN errs := array_append(errs, ('Champ texte attendu : ' || k)::text); END IF;
  END LOOP;
  IF NOT coalesce(_i.is_test, false) THEN errs := array_append(errs, 'Mode construction préparatoire : réservé aux factures TEST (aucune facture réelle)'::text); END IF;
  IF _i.status <> 'brouillon' THEN errs := array_append(errs, 'Mode construction : à choisir AVANT l''émission (facture déjà émise : non convertible)'::text); END IF;
  IF _i.progress_situation_id IS NOT NULL OR _i.quote_id IS NOT NULL THEN errs := array_append(errs, 'Facture progressive ou issue d''une soumission : hors périmètre B1 (sous-lot B2)'::text); END IF;
  IF _i.recurrence_occurrence_id IS NOT NULL THEN errs := array_append(errs, 'Facture récurrente : hors périmètre B1 (sous-lot B2)'::text); END IF;
  IF _i.credit_of IS NOT NULL THEN errs := array_append(errs, 'Document de crédit : hors périmètre'::text); END IF;
  IF coalesce(_i.prices_include_tax, false) THEN errs := array_append(errs, 'Prix taxes incluses : hors périmètre B1 (base HT requise, sous-lot B2)'::text); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_i.lines,'[]'::jsonb)) l WHERE coalesce(l->>'tax','') <> 'taxable') THEN
    errs := array_append(errs, 'Traitements fiscaux mixtes (détaxé/exonéré/à déterminer) : hors périmètre B1 — toutes les lignes doivent être taxables au taux standard'::text); END IF;
  SELECT * INTO s FROM ent_crm_settings WHERE company_id = _i.company_id;
  IF coalesce(s.gst_status,'') <> 'inscrit' OR coalesce(s.qst_status,'') <> 'inscrit' THEN errs := array_append(errs, 'Profil fiscal : inscrit TPS et TVQ requis (non-inscrit ou à compléter : hors périmètre B1)'::text); END IF;
  d := coalesce(_i.issue_date, today);
  r := public.fin_tax_compute(_i.lines, false, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), d);
  IF NOT coalesce((r->>'resolved')::boolean, false) THEN errs := array_append(errs, ('Taxes à déterminer : ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; '))::text); END IF;
  IF coalesce(_p->>'basis','') NOT IN ('law','written_agreement') THEN errs := array_append(errs, 'Fondement requis : loi ou convention écrite'::text); END IF;
  IF coalesce(_p->>'works','') NOT IN ('construction','renovation','transformation','reparation','navire') THEN errs := array_append(errs, 'Nature des travaux requise : construction, rénovation, transformation, réparation d''un immeuble, ou navire'::text); END IF;
  IF length(trim(coalesce(_p->>'contract_ref',''))) NOT BETWEEN 1 AND 200 THEN errs := array_append(errs, 'Référence du contrat requise (200 caractères au plus)'::text); END IF;
  cdate := public.fin_ctax_date(_p->>'contract_date'); IF cdate IS NULL THEN errs := array_append(errs, 'Date du contrat requise (AAAA-MM-JJ valide)'::text); END IF;
  IF length(trim(coalesce(_p->>'clause_ref',''))) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, 'Clause de retenue ou référence documentaire requise'::text); END IF;
  IF length(trim(coalesce(_p->>'release_condition',''))) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, 'Condition de libération requise'::text); END IF;
  IF length(trim(coalesce(_p->>'reason',''))) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, 'Motif requis'::text); END IF;
  due := public.fin_ctax_date(_p->>'contractual_due');
  IF due IS NULL THEN errs := array_append(errs, 'Échéance contractuelle de la retenue requise en B1 (AAAA-MM-JJ valide)'::text);
  ELSIF due < d THEN errs := array_append(errs, 'Échéance contractuelle antérieure à la date de facture'::text); END IF;
  IF coalesce(_p->>'test_confirm','') <> 'oui' THEN errs := array_append(errs, 'Confirmez le mode TEST préparatoire (aucune déclaration ni remise)'::text); END IF;
  IF _p->>'mode' = 'amount' THEN
    IF coalesce(_p->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' THEN errs := array_append(errs, 'Montant HT retenu invalide (2 décimales au plus)'::text); ELSE base := (_p->>'amount')::numeric; END IF;
  ELSIF _p->>'mode' = 'percent' THEN
    IF coalesce(_p->>'pct','') !~ '^\d{1,3}(\.\d{1,4})?$' THEN errs := array_append(errs, 'Pourcentage invalide (4 décimales au plus)'::text);
    ELSE pct := (_p->>'pct')::numeric; IF pct <= 0 OR pct > 100 THEN errs := array_append(errs, 'Pourcentage de plus de 0 à 100 requis'::text); ELSIF (r->>'pre_tax') IS NOT NULL THEN base := round((r->>'pre_tax')::numeric * pct / 100, 2); END IF; END IF;
  ELSE errs := array_append(errs, 'Mode requis : montant HT ou pourcentage HT'::text); END IF;
  IF base IS NOT NULL AND (base <= 0 OR (r->>'pre_tax') IS NULL OR base > (r->>'pre_tax')::numeric) THEN errs := array_append(errs, 'Base HT retenue : de plus de 0 jusqu''au total HT'::text); END IF;
  IF cardinality(errs) > 0 THEN RETURN jsonb_build_object('errors', to_jsonb(errs)); END IF;
  dr := public.fin_tax_compute(jsonb_build_array(jsonb_build_object('qty', 1, 'price', base, 'tax', 'taxable')), false, 'inscrit', 'inscrit', d,
    jsonb_build_object('gst', r->'gst_rate', 'qst', r->'qst_rate'));
  snap := jsonb_build_object('version', 1, 'preparatory', true, 'mode', _p->>'mode', 'pct', pct, 'invoice_pre_tax', (r->>'pre_tax')::numeric,
    'invoice_gst', (r->>'gst')::numeric, 'invoice_qst', (r->>'qst')::numeric, 'invoice_total', (r->>'total')::numeric,
    'gst_rate', r->'gst_rate', 'qst_rate', r->'qst_rate', 'computed_on', d,
    'base', base, 'gst', (dr->>'gst')::numeric, 'qst', (dr->>'qst')::numeric, 'ttc', (dr->>'total')::numeric,
    'immediate_gst', (r->>'gst')::numeric - (dr->>'gst')::numeric, 'immediate_qst', (r->>'qst')::numeric - (dr->>'qst')::numeric,
    'current_part', (r->>'total')::numeric - (dr->>'total')::numeric,
    'basis', _p->>'basis', 'works', _p->>'works', 'contract_ref', trim(_p->>'contract_ref'), 'contract_date', cdate,
    'clause_ref', trim(_p->>'clause_ref'), 'release_condition', trim(_p->>'release_condition'), 'contractual_due', due, 'reason', trim(_p->>'reason'),
    'rule', 'TPS/TVQ sur la somme retenue exigibles à la première des dates : paiement/libération de la retenue ou date où elle devient exigible selon le contrat (Revenu Québec; ARC RC4052, Holdbacks). Montant figé à l''émission; seule l''exigibilité est différée. État préparatoire, aucune déclaration ni remise.',
    'sources', jsonb_build_array('https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/perception-de-la-tps-et-de-la-tvq/moment-ou-la-tpstvh-et-la-tvq-doivent-etre-percues/',
      'https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4052/rc4052-gst-hst-information-home-construction-industry.html'),
    'tax_engine', 'fin_tax_compute v' || (r->>'version'));
  ph := md5(_p::text);
  sh := md5(jsonb_build_object('inv', _i.id, 'lines', _i.lines, 'issue', _i.issue_date, 'due', _i.due_date, 'upd', _i.updated_at, 'gst', s.gst_status, 'qst', s.qst_status, 'snap', snap, 'tax', r)::text);
  RETURN jsonb_build_object('errors', '[]'::jsonb, 'snapshot', snap, 'tax', r, 'expect_hash', md5(ph || sh));
END $function$;
