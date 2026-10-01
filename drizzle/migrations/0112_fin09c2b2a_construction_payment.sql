-- FIN-09C2B2A : paiement manuel TEST d'une retenue construction (B1). Réutilise fin_invoice_receipt_add, fin_invoice_position,
-- fin_ctax_alloc et le journal fiscal. Paiement = libération source 'paiement' + encaissement lié, atomiques.
ALTER TABLE public.fin_retention_releases ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'liberation';
ALTER TABLE public.fin_retention_releases ADD CONSTRAINT fin_rel_source_check CHECK (source IN ('liberation','paiement'));
ALTER TABLE public.fin_retention_releases ADD COLUMN IF NOT EXISTS receipt_id uuid REFERENCES public.fin_invoice_receipts(id);
CREATE UNIQUE INDEX IF NOT EXISTS fin_rel_receipt_uq ON public.fin_retention_releases(receipt_id) WHERE receipt_id IS NOT NULL;
ALTER TABLE public.fin_retention_tax_events DROP CONSTRAINT IF EXISTS fin_retention_tax_events_source_check;
ALTER TABLE public.fin_retention_tax_events ADD CONSTRAINT fin_retention_tax_events_source_check CHECK (source IN ('liberation','echeance','paiement'));
ALTER TABLE public.fin_retention_tax_events ADD COLUMN IF NOT EXISTS date_basis text;
COMMENT ON COLUMN public.fin_retention_tax_events.date_basis IS 'FIN-09C2B2A : date retenue = paiement | liberation | echeance (la plus tôt). NULL = événement antérieur à B2A.';

CREATE OR REPLACE FUNCTION public.fin_ctax_on_release()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r fin_retentions; prev numeric; cum numeric; a0 jsonb; a1 jsonb; due date;
BEGIN
  SELECT * INTO r FROM fin_retentions WHERE id = NEW.retention_id;
  IF r.kind <> 'construction_differee' THEN RETURN NEW; END IF;
  SELECT coalesce(max(cum_ttc),0) INTO prev FROM fin_retention_tax_events WHERE retention_id = r.id;
  SELECT least(r.amount, coalesce(sum(amount),0)) INTO cum FROM fin_retention_releases WHERE retention_id = r.id AND voided_at IS NULL;
  IF cum <= prev THEN RETURN NEW; END IF; -- part déjà exigible (échéance/revue) : aucune nouvelle part fiscale
  due := (r.ctax_snapshot->>'contractual_due')::date;
  a0 := public.fin_ctax_alloc(r.ctax_snapshot, prev); a1 := public.fin_ctax_alloc(r.ctax_snapshot, cum);
  INSERT INTO fin_retention_tax_events(company_id, invoice_id, retention_id, release_id, source, exigible_on, ttc, base, gst, qst, cum_ttc, date_basis)
  VALUES (r.company_id, r.invoice_id, r.id, NEW.id, NEW.source, least(NEW.released_on, due), cum - prev,
    (a1->>'base')::numeric - (a0->>'base')::numeric, (a1->>'gst')::numeric - (a0->>'gst')::numeric, (a1->>'qst')::numeric - (a0->>'qst')::numeric, cum,
    CASE WHEN NEW.released_on <= due THEN NEW.source ELSE 'echeance' END);
  RETURN NEW;
END $function$;

-- Encaissement lié à un paiement de retenue construction : annulation non prise en charge (B2).
CREATE OR REPLACE FUNCTION public.fin_ctax_receipt_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL AND EXISTS (SELECT 1 FROM fin_retention_releases WHERE receipt_id = NEW.id) THEN
    RAISE EXCEPTION 'Encaissement lié au paiement d''une retenue construction : annulation non prise en charge (sous-lot B2), aucune modification';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_fin_ctax_receipt_guard ON public.fin_invoice_receipts;
CREATE TRIGGER trg_fin_ctax_receipt_guard BEFORE UPDATE ON public.fin_invoice_receipts FOR EACH ROW EXECUTE FUNCTION public.fin_ctax_receipt_guard();

-- Validation + aperçu exact (aucune écriture). Interne.
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
    IF NOT k = ANY(allowed) THEN errs := errs || ('Champ inconnu : ' || k); ELSIF jsonb_typeof(_p->k) <> 'string' THEN errs := errs || ('Champ texte attendu : ' || k); END IF;
  END LOOP;
  IF _r.kind <> 'construction_differee' OR _r.ctax_snapshot IS NULL THEN errs := errs || 'Paiement de retenue : retenue construction B1 seulement (autres retenues : libération puis encaissement ordinaire)'; END IF;
  IF _r.status <> 'active' THEN errs := errs || 'Retenue annulée : aucun paiement'; END IF;
  IF NOT coalesce(i.is_test, false) THEN errs := errs || 'Pilote B2A : factures TEST seulement (aucun paiement réel)'; END IF;
  IF i.status <> 'emise' THEN errs := errs || 'Facture non émise'; END IF;
  IF coalesce(_p->>'test_confirm','') <> 'oui' THEN errs := errs || 'Confirmez le mode TEST (aucun paiement réel, aucune déclaration ni remise)'; END IF;
  IF coalesce(_p->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' THEN errs := errs || 'Montant payé invalide (2 décimales au plus)'; ELSE amt := (_p->>'amount')::numeric; IF amt <= 0 THEN errs := errs || 'Montant positif requis'; amt := NULL; END IF; END IF;
  d := public.fin_ctax_date(_p->>'paid_on');
  IF d IS NULL THEN errs := errs || 'Date de paiement reçu requise (AAAA-MM-JJ valide)';
  ELSE
    IF d > today THEN errs := errs || 'Paiement daté dans le futur : seul un paiement réellement reçu est enregistré'; END IF;
    IF i.issue_date IS NOT NULL AND d < i.issue_date THEN errs := errs || ('Paiement daté avant la facture (' || i.issue_date || ')'); END IF;
    SELECT max(released_on) INTO mx FROM fin_retention_releases WHERE retention_id = _r.id AND voided_at IS NULL;
    IF mx IS NOT NULL AND d < mx THEN errs := errs || ('Paiement antérieur à une libération/paiement déjà enregistré (' || mx || ') : correction rétroactive non prise en charge'); END IF;
    SELECT max(exigible_on) INTO mxe FROM fin_retention_tax_events WHERE retention_id = _r.id;
    IF mxe IS NOT NULL AND d < mxe THEN errs := errs || ('Paiement antérieur à une exigibilité déjà enregistrée (' || mxe || ') : correction rétroactive non prise en charge'); END IF;
  END IF;
  IF coalesce(_p->>'method','') NOT IN ('interac','virement','cheque','especes','carte','prelevement','autre') THEN errs := errs || 'Mode de paiement requis'; END IF;
  IF coalesce(_p->>'account_id','') <> '' THEN
    BEGIN acc := (_p->>'account_id')::uuid; EXCEPTION WHEN OTHERS THEN errs := errs || 'Compte invalide'; END;
    IF acc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fin_accounts WHERE id = acc AND company_id = _r.company_id) THEN errs := errs || 'Compte inconnu pour cette entreprise'; END IF;
  END IF;
  IF length(trim(coalesce(_p->>'reference',''))) NOT BETWEEN 1 AND 200 THEN errs := errs || 'Référence de preuve requise (n° de chèque, virement…; 200 caractères au plus)'; END IF;
  IF length(trim(coalesce(_p->>'reason',''))) NOT BETWEEN 1 AND 400 THEN errs := errs || 'Motif requis (400 caractères au plus)'; END IF;
  SELECT coalesce(sum(amount),0) INTO released FROM fin_retention_releases WHERE retention_id = _r.id AND voided_at IS NULL;
  rest := _r.amount - released;
  IF amt IS NOT NULL AND amt > rest THEN errs := errs || ('Montant supérieur à la retenue restante (' || rest || ' $) : un paiement mêlant part courante et retenue n''est pas pris en charge — enregistrez la part courante par l''encaissement ordinaire'); END IF;
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
    'expect_hash', md5(concat_ws('|', 'cpv1', _r.id, _r.rev, released, prev, pos->>'rest', pos->>'held', amt, d, _p->>'method', coalesce(acc::text,''), trim(_p->>'reference'), trim(_p->>'reason'))));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_construction_pay_preview(_retention uuid, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r fin_retentions;
BEGIN
  SELECT * INTO r FROM fin_retentions WHERE id = _retention;
  IF r.id IS NULL OR NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN public.fin_ctax_pay_eval(r, _p) || jsonb_build_object('rev', r.rev);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_construction_pay(_retention uuid, _key text, _p jsonb, _expect_rev integer, _expect_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv uuid; r fin_retentions; e fin_retention_releases; rq text; v jsonb; nid uuid; rc jsonb; amt numeric; d date;
BEGIN
  SELECT invoice_id INTO inv FROM fin_retentions WHERE id = _retention;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;              -- ordre commun : facture → retenue → encaissement
  SELECT * INTO r FROM fin_retentions WHERE id = _retention FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  -- requête originale complète (saisie + révision + empreinte) avant tout calcul d'état
  rq := md5(jsonb_build_object('op', 'ctax_pay', 'retention', _retention, 'p', _p, 'rev', _expect_rev, 'hash', _expect_hash)::text);
  SELECT * INTO e FROM fin_retention_releases WHERE company_id = r.company_id AND idem_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.payload_hash = rq AND e.retention_id = _retention THEN
      RETURN jsonb_build_object('id', e.id, 'receipt', e.receipt_id, 'replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv));
    END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_invoice_receipts WHERE company_id = r.company_id AND idem_key = 'ctaxpay:' || _key) THEN
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour un encaissement' USING ERRCODE = 'P0409'; END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  v := public.fin_ctax_pay_eval(r, _p);
  IF jsonb_array_length(v->'errors') > 0 THEN RAISE EXCEPTION 'Paiement refusé : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v->'errors')), ' ; '); END IF;
  IF _expect_hash IS DISTINCT FROM v->>'expect_hash' THEN RAISE EXCEPTION 'Retenue, solde ou saisie modifiés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  amt := (v->>'amount')::numeric; d := (v->>'paid_on')::date;
  INSERT INTO fin_retention_releases(company_id, invoice_id, retention_id, amount, released_on, reason, idem_key, payload_hash, source)
  VALUES (r.company_id, inv, r.id, amt, d, left('Paiement reçu (TEST) : ' || trim(_p->>'reason'), 500), _key, rq, 'paiement') RETURNING id INTO nid;
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  rc := public.fin_invoice_receipt_add(inv, amt, d, _p->>'method', nullif(_p->>'account_id','')::uuid, trim(_p->>'reference'), 'ctaxpay:' || _key);
  IF coalesce((rc->>'replayed')::boolean, false) THEN RAISE EXCEPTION 'Encaissement inattendu déjà présent' USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_retention_releases SET receipt_id = (rc->>'id')::uuid WHERE id = nid;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, release_id, action, detail)
  VALUES (r.company_id, inv, r.id, nid, 'payment', jsonb_build_object('amount', amt, 'date', d, 'receipt', rc->>'id', 'reference', trim(_p->>'reference'), 'test', true, 'tax', v->'tax'));
  PERFORM public.fin_retention_check(inv);
  RETURN jsonb_build_object('id', nid, 'receipt', (rc->>'id')::uuid, 'replayed', false, 'rev', r.rev + 1, 'tax', v->'tax', 'position', public.fin_invoice_position(inv));
END $function$;

REVOKE ALL ON FUNCTION public.fin_ctax_pay_eval(fin_retentions, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_ctax_receipt_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_construction_pay_preview(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_construction_pay(uuid, text, jsonb, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_construction_pay_preview(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_construction_pay(uuid, text, jsonb, integer, text) TO authenticated;