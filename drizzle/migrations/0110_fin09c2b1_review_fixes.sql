-- FIN-09C2B1 correctifs : allocation monotone (méthode à diviseur en cents, bornée, exacte), chronologie des libérations, dates hors périmètre.
CREATE OR REPLACE FUNCTION public.fin_ctax_alloc(_s jsonb, _cum numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE w bigint[]; a bigint[]; t bigint; c bigint; b int; i int;
BEGIN
  w := ARRAY[round((_s->>'base')::numeric * 100), round((_s->>'gst')::numeric * 100), round((_s->>'qst')::numeric * 100)]::bigint[];
  IF w[1] < 0 OR w[2] < 0 OR w[3] < 0 THEN RAISE EXCEPTION 'Instantané de retenue invalide (composant négatif)'; END IF;
  t := w[1] + w[2] + w[3]; c := round(coalesce(_cum, 0) * 100);
  IF c < 0 THEN RAISE EXCEPTION 'Cumul négatif refusé'; END IF;
  IF c >= t THEN RETURN jsonb_build_object('base', w[1] / 100.0, 'gst', w[2] / 100.0, 'qst', w[3] / 100.0); END IF;
  -- Quota inférieur puis attribution séquentielle par plus fort quotient w/(a+1) : monotone en c, aucun composant ne recule.
  a := ARRAY[w[1] * c / t, w[2] * c / t, w[3] * c / t];
  WHILE a[1] + a[2] + a[3] < c LOOP
    b := 0;
    FOR i IN 1..3 LOOP
      IF a[i] < w[i] AND (b = 0 OR w[i] * (a[b] + 1) > w[b] * (a[i] + 1)) THEN b := i; END IF;
    END LOOP;
    a[b] := a[b] + 1;
  END LOOP;
  RETURN jsonb_build_object('base', round(a[1] / 100.0, 2), 'gst', round(a[2] / 100.0, 2), 'qst', round(a[3] / 100.0, 2));
END $$;
REVOKE ALL ON FUNCTION public.fin_ctax_alloc(jsonb, numeric) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.fin_retention_tax_events ADD CONSTRAINT fin_rte_nonneg CHECK (base >= 0 AND gst >= 0 AND qst >= 0 AND ttc > 0 AND ttc = base + gst + qst);

CREATE OR REPLACE FUNCTION public.fin_ctax_rel_chrono()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r fin_retentions; idate date; mx date;
BEGIN
  SELECT * INTO r FROM fin_retentions WHERE id = NEW.retention_id;
  IF r.ctax_snapshot IS NULL THEN RETURN NEW; END IF;
  SELECT issue_date INTO idate FROM fin_invoices WHERE id = r.invoice_id;
  IF NEW.released_on > (now() AT TIME ZONE 'America/Toronto')::date THEN
    RAISE EXCEPTION 'Libération datée dans le futur : seule une libération effective est enregistrée (la date prévue reste l''échéance contractuelle)' USING ERRCODE = 'P0001'; END IF;
  IF idate IS NOT NULL AND NEW.released_on < idate THEN
    RAISE EXCEPTION 'Libération datée avant la date de facture (%) : refusée', idate USING ERRCODE = 'P0001'; END IF;
  SELECT max(released_on) INTO mx FROM fin_retention_releases WHERE retention_id = r.id AND voided_at IS NULL;
  IF mx IS NOT NULL AND NEW.released_on < mx THEN
    RAISE EXCEPTION 'Libération antérieure à une libération déjà enregistrée (%) : correction rétroactive de l''exigibilité non prise en charge en B1 (sous-lot B2)', mx USING ERRCODE = 'P0001'; END IF;
  SELECT max(exigible_on) INTO mx FROM fin_retention_tax_events WHERE retention_id = r.id;
  IF mx IS NOT NULL AND NEW.released_on < mx THEN
    RAISE EXCEPTION 'Libération antérieure à une exigibilité déjà enregistrée (%) : correction rétroactive non prise en charge en B1 (sous-lot B2)', mx USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fin_ctax_rel_chrono() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_fin_ctax_rel_chrono BEFORE INSERT ON public.fin_retention_releases FOR EACH ROW EXECUTE FUNCTION public.fin_ctax_rel_chrono();

CREATE OR REPLACE FUNCTION public.fin_ctax_validate(_i fin_invoices, _p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
  cdate := public.fin_ctax_date(_p->>'contract_date'); IF cdate IS NULL THEN errs := array_append(errs, 'Date du contrat requise (AAAA-MM-JJ valide)'::text); ELSIF cdate > d THEN errs := array_append(errs, 'Date du contrat postérieure à la date de facture : incohérent'::text); END IF;
  IF length(trim(coalesce(_p->>'clause_ref',''))) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, 'Clause de retenue ou référence documentaire requise'::text); END IF;
  IF length(trim(coalesce(_p->>'release_condition',''))) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, 'Condition de libération requise'::text); END IF;
  IF length(trim(coalesce(_p->>'reason',''))) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, 'Motif requis'::text); END IF;
  due := public.fin_ctax_date(_p->>'contractual_due');
  IF due IS NULL THEN errs := array_append(errs, 'Échéance contractuelle de la retenue requise en B1 (AAAA-MM-JJ valide)'::text);
  ELSIF due <= d THEN errs := array_append(errs, 'Échéance contractuelle à la date de facture ou avant : taxes non différées, hors périmètre B1 (utilisez la retenue ordinaire « taxes déjà exigibles »)'::text); END IF;
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

CREATE OR REPLACE FUNCTION public.fin_construction_evaluate(_retention uuid, _key text, _on text, _expect_rev integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inv uuid; r fin_retentions; d date; due date; prev numeric; a0 jsonb; a1 jsonb; rq text; t fin_retention_tax_events;
BEGIN
  SELECT invoice_id INTO inv FROM fin_retentions WHERE id = _retention;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = _retention FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF r.kind <> 'construction_differee' THEN RAISE EXCEPTION 'Revue d''exigibilité : retenue construction seulement'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  d := public.fin_ctax_date(_on); IF d IS NULL THEN RAISE EXCEPTION 'Date de revue invalide (AAAA-MM-JJ)'; END IF;
  IF d > (now() AT TIME ZONE 'America/Toronto')::date THEN RAISE EXCEPTION 'Date de revue future : une échéance non encore atteinte ne rend rien exigible'; END IF;
  rq := md5(concat_ws('|', 'ce1', r.id, d, coalesce(_expect_rev::text,'null')));
  SELECT * INTO t FROM fin_retention_tax_events WHERE company_id = r.company_id AND idem_key = _key;
  IF t.id IS NOT NULL THEN
    IF t.request_hash = rq THEN RETURN jsonb_build_object('replayed', true, 'reached', true, 'rev', r.rev, 'state', public.fin_ctax_state(r.id)); END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  due := (r.ctax_snapshot->>'contractual_due')::date;
  IF d < due THEN RETURN jsonb_build_object('replayed', false, 'reached', false, 'rev', r.rev, 'state', public.fin_ctax_state(r.id)); END IF;
  SELECT coalesce(max(cum_ttc),0) INTO prev FROM fin_retention_tax_events WHERE retention_id = r.id;
  IF prev >= r.amount OR r.status <> 'active' THEN RETURN jsonb_build_object('replayed', false, 'reached', true, 'nothing', true, 'rev', r.rev, 'state', public.fin_ctax_state(r.id)); END IF;
  a0 := public.fin_ctax_alloc(r.ctax_snapshot, prev); a1 := public.fin_ctax_alloc(r.ctax_snapshot, r.amount);
  INSERT INTO fin_retention_tax_events(company_id, invoice_id, retention_id, source, exigible_on, ttc, base, gst, qst, cum_ttc, idem_key, request_hash)
  VALUES (r.company_id, inv, r.id, 'echeance', due, r.amount - prev, (a1->>'base')::numeric - (a0->>'base')::numeric,
    (a1->>'gst')::numeric - (a0->>'gst')::numeric, (a1->>'qst')::numeric - (a0->>'qst')::numeric, r.amount, _key, rq);
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, action, detail)
  VALUES (r.company_id, inv, r.id, 'tax_due_review', jsonb_build_object('on', d, 'exigible_on', due, 'ttc', r.amount - prev, 'preparatory', true));
  RETURN jsonb_build_object('replayed', false, 'reached', true, 'rev', r.rev + 1, 'state', public.fin_ctax_state(r.id));
END $function$;