-- FIN-09C2B2B1 correctif (revue 17138650) : 1) ordre libération → encaissement pour synchroniser l'échéancier de l'entrée attendue
-- une seule fois quand les deux annulations sont visibles; 2) égalité d'horodatage entre candidats actifs = refus explicite.
-- Aucun recalcul de documents ni du journal fiscal.
-- évaluation interne (aucune écriture)
CREATE OR REPLACE FUNCTION public.fin_ctax_pcorr_eval(_r fin_retentions, _l fin_retention_releases, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE errs text[] := '{}'; i fin_invoices; rc fin_invoice_receipts; k text; due date; full_ok boolean; pos jsonb; rest numeric;
  allowed text[] := ARRAY['reason','test_confirm','error_confirm'];
BEGIN
  IF jsonb_typeof(_p) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('errors', jsonb_build_array('Saisie invalide')); END IF;
  FOR k IN SELECT jsonb_object_keys(_p) LOOP
    IF NOT k = ANY(allowed) THEN errs := array_append(errs, ('Champ inconnu : ' || k)::text); ELSIF jsonb_typeof(_p->k) <> 'string' THEN errs := array_append(errs, ('Champ texte attendu : ' || k)::text); END IF;
  END LOOP;
  SELECT * INTO i FROM fin_invoices WHERE id = _r.invoice_id;
  SELECT * INTO rc FROM fin_invoice_receipts WHERE id = _l.receipt_id;
  IF _r.kind <> 'construction_differee' OR _r.ctax_snapshot IS NULL THEN errs := array_append(errs, 'Correction : retenue construction B1 seulement'::text); END IF;
  IF _r.status <> 'active' THEN errs := array_append(errs, 'Retenue annulée : historique figé'::text); END IF;
  IF NOT coalesce(i.is_test, false) THEN errs := array_append(errs, 'Pilote B2B1 : factures TEST seulement (aucune correction réelle)'::text); END IF;
  IF i.status <> 'emise' THEN errs := array_append(errs, 'Facture non émise'::text); END IF;
  IF _l.id IS NULL OR _l.retention_id <> _r.id THEN errs := array_append(errs, 'Paiement inconnu pour cette retenue'::text);
  ELSE
    IF _l.source <> 'paiement' OR _l.receipt_id IS NULL OR rc.id IS NULL OR rc.invoice_id <> _r.invoice_id OR coalesce(rc.idem_key,'') NOT LIKE 'ctaxpay:%' THEN
      errs := array_append(errs, 'Seul un paiement de retenue TEST avec encaissement lié peut être annulé ici (libération simple ou encaissement ordinaire : hors périmètre)'::text); END IF;
    IF _l.voided_at IS NOT NULL OR rc.voided_at IS NOT NULL THEN errs := array_append(errs, 'Paiement déjà annulé'::text); END IF;
    IF EXISTS (SELECT 1 FROM fin_retention_releases WHERE retention_id = _r.id AND voided_at IS NULL AND id <> _l.id AND (released_on, created_at) > (_l.released_on, _l.created_at)) THEN
      errs := array_append(errs, 'Seul le dernier paiement/libération actif peut être annulé (correction rétroactive non prise en charge)'::text); END IF;
    -- 0116 : égalité exacte (même date ET même horodatage) = ordre non prouvé → refus explicite (aucun départage par uuid)
    IF EXISTS (SELECT 1 FROM fin_retention_releases WHERE retention_id = _r.id AND voided_at IS NULL AND id <> _l.id AND released_on = _l.released_on AND created_at = _l.created_at) THEN
      errs := array_append(errs, 'Ordre ambigu : un autre paiement/libération actif a la même date et le même horodatage — dernier paiement non prouvé, annulation refusée'::text); END IF;
    IF rc.id IS NOT NULL AND EXISTS (SELECT 1 FROM fin_invoice_receipts WHERE invoice_id = _r.invoice_id AND voided_at IS NULL AND id <> rc.id AND created_at >= rc.created_at) THEN
      errs := array_append(errs, 'Un encaissement plus récent ou de même horodatage existe (ordre non prouvé) : correction rétroactive non prise en charge'::text); END IF;
    due := (_r.ctax_snapshot->>'contractual_due')::date;
    IF due IS NULL OR _l.released_on < due THEN errs := array_append(errs, 'Paiement antérieur à l''échéance contractuelle : il a sa propre part fiscale — annulation non prise en charge (sous-lot B2B2)'::text); END IF;
    IF EXISTS (SELECT 1 FROM fin_retention_tax_events WHERE release_id = _l.id) THEN errs := array_append(errs, 'Un événement fiscal est lié à ce paiement : annulation non prise en charge (sous-lot B2B2)'::text); END IF;
    SELECT EXISTS (SELECT 1 FROM fin_retention_tax_events WHERE retention_id = _r.id AND source = 'echeance' AND exigible_on <= _l.released_on AND release_id IS NULL)
       AND coalesce((SELECT max(cum_ttc) FROM fin_retention_tax_events WHERE retention_id = _r.id), 0) = _r.amount INTO full_ok;
    IF NOT full_ok THEN errs := array_append(errs, 'Prérequis non prouvé : taxes de la retenue non entièrement exigibles par la revue d''échéance avant ce paiement — annulation refusée'::text); END IF;
  END IF;
  IF coalesce(_p->>'test_confirm','') <> 'oui' THEN errs := array_append(errs, 'Confirmez le mode TEST'::text); END IF;
  IF coalesce(_p->>'error_confirm','') <> 'oui' THEN errs := array_append(errs, 'Confirmez qu''il s''agit d''une erreur de saisie (pas un remboursement ni un retour bancaire)'::text); END IF;
  IF length(trim(coalesce(_p->>'reason',''))) NOT BETWEEN 1 AND 400 THEN errs := array_append(errs, 'Motif requis (400 caractères au plus)'::text); END IF;
  IF cardinality(errs) > 0 THEN RETURN jsonb_build_object('errors', to_jsonb(errs)); END IF;
  pos := public.fin_invoice_position(_r.invoice_id);
  SELECT _r.amount - coalesce(sum(amount),0) INTO rest FROM fin_retention_releases WHERE retention_id = _r.id AND voided_at IS NULL;
  RETURN jsonb_build_object('errors', '[]'::jsonb, 'release', _l.id, 'receipt', rc.id, 'amount', _l.amount, 'paid_on', _l.released_on, 'reference', rc.reference,
    'retention_rest', rest, 'before', pos - 'retention_schedule',
    'after', jsonb_build_object('held', (pos->>'held')::numeric + _l.amount, 'rest', (pos->>'rest')::numeric + _l.amount, 'current_due', (pos->>'current_due')::numeric, 'retention_rest', rest + _l.amount),
    'tax', jsonb_build_object('unchanged', true),
    'expect_hash', md5(jsonb_build_object('v', 'pcv1', 'retention', _r.id, 'rev', _r.rev, 'release', _l.id, 'receipt', rc.id, 'amount', _l.amount, 'paid_on', _l.released_on,
      'receipt_amount', rc.amount, 'rest', pos->'rest', 'held', pos->'held', 'reason', trim(_p->>'reason'))::text));
END $function$;
REVOKE ALL ON FUNCTION public.fin_ctax_pcorr_eval(fin_retentions, fin_retention_releases, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_construction_pay_void(_release uuid, _key text, _p jsonb, _expect_rev integer, _expect_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv uuid; rid uuid; r fin_retentions; l fin_retention_releases; rq text; v jsonb; c fin_ctax_corrections; cid uuid; why text;
BEGIN
  SELECT invoice_id, retention_id INTO inv, rid FROM fin_retention_releases WHERE id = _release;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;                  -- ordre : facture → retenue → libération → encaissement
  SELECT * INTO r FROM fin_retentions WHERE id = rid FOR UPDATE;
  SELECT * INTO l FROM fin_retention_releases WHERE id = _release FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF l.receipt_id IS NOT NULL THEN PERFORM 1 FROM fin_invoice_receipts WHERE id = l.receipt_id FOR UPDATE; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  -- requête originale complète AVANT tout calcul d'état / révision
  rq := md5(jsonb_build_object('op', 'ctax_pay_void', 'release', _release, 'p', _p, 'rev', _expect_rev, 'hash', _expect_hash)::text);
  SELECT * INTO c FROM fin_ctax_corrections WHERE company_id = r.company_id AND idem_key = _key;
  IF c.id IS NOT NULL THEN
    IF c.request_hash = rq AND c.release_id = _release THEN
      RETURN jsonb_build_object('id', c.id, 'replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv));
    END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_ctax_corrections WHERE release_id = _release) THEN RAISE EXCEPTION 'Paiement déjà annulé par une autre demande' USING ERRCODE = 'P0409'; END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  v := public.fin_ctax_pcorr_eval(r, l, _p);
  IF jsonb_array_length(v->'errors') > 0 THEN RAISE EXCEPTION 'Annulation refusée : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v->'errors')), ' ; '); END IF;
  IF _expect_hash IS DISTINCT FROM v->>'expect_hash' THEN RAISE EXCEPTION 'Retenue, paiement ou motif modifiés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  why := 'Erreur de saisie TEST : ' || trim(_p->>'reason');
  INSERT INTO fin_ctax_corrections(company_id, invoice_id, retention_id, release_id, receipt_id, reason, idem_key, request_hash, request, before, actor)
  VALUES (r.company_id, inv, r.id, l.id, l.receipt_id, trim(_p->>'reason'), _key, rq,
          jsonb_build_object('p', _p, 'rev', _expect_rev, 'hash', _expect_hash), v->'before', auth.uid()) RETURNING id INTO cid;
  -- 0116 : libération marquée AVANT l'encaissement pour que l'unique synchronisation du moteur (fin_invoice_receipt_void → fin_invoice_receipts_sync)
  -- voie les DEUX annulations; gardes toujours fermées hors correction journalisée dans cette transaction.
  UPDATE fin_retention_releases SET voided_at = now(), voided_by = auth.uid(), void_reason = left(why, 500), void_key = _key, void_request_hash = rq WHERE id = l.id;
  PERFORM public.fin_invoice_receipt_void(l.receipt_id, why);           -- moteur d'encaissement existant : synchronise amount/received/retention_schedule
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, release_id, action, detail)
  VALUES (r.company_id, inv, r.id, l.id, 'payment_correction', jsonb_build_object('correction', cid, 'receipt', l.receipt_id, 'amount', l.amount, 'date', l.released_on, 'reason', trim(_p->>'reason'), 'test', true, 'tax', 'inchangée'));
  PERFORM public.fin_retention_check(inv);
  UPDATE fin_ctax_corrections SET after = public.fin_invoice_position(inv) - 'retention_schedule' WHERE id = cid;
  RETURN jsonb_build_object('id', cid, 'replayed', false, 'rev', r.rev + 1, 'position', public.fin_invoice_position(inv));
END $function$;

REVOKE ALL ON FUNCTION public.fin_construction_pay_void(uuid, text, jsonb, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_construction_pay_void(uuid, text, jsonb, integer, text) TO authenticated;
