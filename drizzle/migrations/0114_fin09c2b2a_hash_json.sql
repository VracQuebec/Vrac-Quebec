-- FIN-09C2B2A (revue d46b001) : empreinte d'aperçu = JSON canonique structuré (jsonb, clés nommées, chaînes échappées)
-- au lieu de concat_ws('|') ambigu (référence 'x|y' + motif 'z' ≡ référence 'x' + motif 'y|z'). Aucun recalcul de données.
CREATE OR REPLACE FUNCTION public.fin_ctax_pay_eval(_r fin_retentions, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE errs text[] := '{}'; i fin_invoices; k text; amt numeric; d date; today date := (now() AT TIME ZONE 'America/Toronto')::date;
  allowed text[] := ARRAY['amount','paid_on','method','account_id','reference','reason','test_confirm'];
  rest numeric; released numeric; prev numeric; cum numeric; a0 jsonb; a1 jsonb; mx date; mxe date; pos jsonb; due date; acc uuid; tax jsonb; after jsonb;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _r.invoice_id;
  IF jsonb_typeof(_p) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('errors', jsonb_build_array('Saisie invalide')); END IF;
  FOR k IN SELECT jsonb_object_keys(_p) LOOP
    IF NOT k = ANY(allowed) THEN errs := array_append(errs, ('Champ inconnu : ' || k)::text); ELSIF jsonb_typeof(_p->k) <> 'string' THEN errs := array_append(errs, ('Champ texte attendu : ' || k)::text); END IF;
  END LOOP;
  IF _r.kind <> 'construction_differee' OR _r.ctax_snapshot IS NULL THEN errs := array_append(errs, 'Paiement de retenue : retenue construction B1 seulement (autres retenues : libération puis encaissement ordinaire)'::text); END IF;
  IF _r.status <> 'active' THEN errs := array_append(errs, 'Retenue annulée : aucun paiement'::text); END IF;
  IF NOT coalesce(i.is_test, false) THEN errs := array_append(errs, 'Pilote B2A : factures TEST seulement (aucun paiement réel)'::text); END IF;
  IF i.status <> 'emise' THEN errs := array_append(errs, 'Facture non émise'::text); END IF;
  IF coalesce(_p->>'test_confirm','') <> 'oui' THEN errs := array_append(errs, 'Confirmez le mode TEST (aucun paiement réel, aucune déclaration ni remise)'::text); END IF;
  IF coalesce(_p->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' THEN errs := array_append(errs, 'Montant payé invalide (2 décimales au plus)'::text); ELSE amt := (_p->>'amount')::numeric; IF amt <= 0 THEN errs := array_append(errs, 'Montant positif requis'::text); amt := NULL; END IF; END IF;
  d := public.fin_ctax_date(_p->>'paid_on');
  IF d IS NULL THEN errs := array_append(errs, 'Date de paiement reçu requise (AAAA-MM-JJ valide)'::text);
  ELSE
    IF d > today THEN errs := array_append(errs, 'Paiement daté dans le futur : seul un paiement réellement reçu est enregistré'::text); END IF;
    IF i.issue_date IS NOT NULL AND d < i.issue_date THEN errs := array_append(errs, ('Paiement daté avant la facture (' || i.issue_date || ')')::text); END IF;
    SELECT max(released_on) INTO mx FROM fin_retention_releases WHERE retention_id = _r.id AND voided_at IS NULL;
    IF mx IS NOT NULL AND d < mx THEN errs := array_append(errs, ('Paiement antérieur à une libération/paiement déjà enregistré (' || mx || ') : correction rétroactive non prise en charge')::text); END IF;
    SELECT max(exigible_on) INTO mxe FROM fin_retention_tax_events WHERE retention_id = _r.id;
    IF mxe IS NOT NULL AND d < mxe THEN errs := array_append(errs, ('Paiement antérieur à une exigibilité déjà enregistrée (' || mxe || ') : correction rétroactive non prise en charge')::text); END IF;
  END IF;
  IF coalesce(_p->>'method','') NOT IN ('interac','virement','cheque','especes','carte','prelevement','autre') THEN errs := array_append(errs, 'Mode de paiement requis'::text); END IF;
  IF coalesce(_p->>'account_id','') <> '' THEN
    BEGIN acc := (_p->>'account_id')::uuid; EXCEPTION WHEN OTHERS THEN errs := array_append(errs, 'Compte invalide'::text); END;
    IF acc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fin_accounts WHERE id = acc AND company_id = _r.company_id) THEN errs := array_append(errs, 'Compte inconnu pour cette entreprise'::text); END IF;
  END IF;
  IF length(trim(coalesce(_p->>'reference',''))) NOT BETWEEN 1 AND 200 THEN errs := array_append(errs, 'Référence de preuve requise (n° de chèque, virement…, 200 caractères au plus)'::text); END IF;
  IF length(trim(coalesce(_p->>'reason',''))) NOT BETWEEN 1 AND 400 THEN errs := array_append(errs, 'Motif requis (400 caractères au plus)'::text); END IF;
  SELECT coalesce(sum(amount),0) INTO released FROM fin_retention_releases WHERE retention_id = _r.id AND voided_at IS NULL;
  rest := _r.amount - released;
  IF amt IS NOT NULL AND amt > rest THEN errs := array_append(errs, ('Montant supérieur à la retenue restante (' || rest || ' $) : un paiement mêlant part courante et retenue n''est pas pris en charge — enregistrez la part courante par l''encaissement ordinaire')::text); END IF;
  pos := public.fin_invoice_position(_r.invoice_id);
  IF cardinality(errs) > 0 THEN RETURN jsonb_build_object('errors', to_jsonb(errs)); END IF;
  due := (_r.ctax_snapshot->>'contractual_due')::date;
  SELECT coalesce(max(cum_ttc),0) INTO prev FROM fin_retention_tax_events WHERE retention_id = _r.id;
  cum := least(_r.amount, released + amt);
  IF cum > prev THEN
    a0 := public.fin_ctax_alloc(_r.ctax_snapshot, prev); a1 := public.fin_ctax_alloc(_r.ctax_snapshot, cum);
    tax := jsonb_build_object('ttc', cum - prev, 'base', (a1->>'base')::numeric - (a0->>'base')::numeric, 'gst', (a1->>'gst')::numeric - (a0->>'gst')::numeric,
      'qst', (a1->>'qst')::numeric - (a0->>'qst')::numeric, 'exigible_on', least(d, due), 'date_basis', CASE WHEN d <= due THEN 'paiement' ELSE 'echeance' END);
  ELSE tax := jsonb_build_object('ttc', 0, 'base', 0, 'gst', 0, 'qst', 0, 'already_exigible', true); END IF;
  after := jsonb_build_object('held', (pos->>'held')::numeric - amt, 'rest', (pos->>'rest')::numeric - amt, 'current_due', (pos->>'current_due')::numeric, 'retention_rest', rest - amt);
  RETURN jsonb_build_object('errors', '[]'::jsonb, 'amount', amt, 'paid_on', d, 'retention_rest', rest, 'tax', tax, 'before', pos - 'retention_schedule', 'after', after,
    'expect_hash', md5(jsonb_build_object('v', 'cpv2', 'retention', _r.id, 'rev', _r.rev, 'released', released, 'prev', prev, 'rest', pos->'rest', 'held', pos->'held', 'amount', amt, 'paid_on', d, 'method', _p->>'method', 'account_id', acc, 'reference', trim(_p->>'reference'), 'reason', trim(_p->>'reason'))::text));
END $function$;
REVOKE ALL ON FUNCTION public.fin_ctax_pay_eval(fin_retentions, jsonb) FROM PUBLIC, anon, authenticated;