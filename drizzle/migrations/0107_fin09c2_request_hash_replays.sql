ALTER TABLE public.fin_retentions ADD COLUMN IF NOT EXISTS request_hash text, ADD COLUMN IF NOT EXISTS void_request_hash text;
ALTER TABLE public.fin_retention_releases ADD COLUMN IF NOT EXISTS void_request_hash text;
COMMENT ON COLUMN public.fin_retentions.payload_hash IS 'Empreinte de saisie validée (historique); le rejeu compare request_hash (requête complète)';
COMMENT ON COLUMN public.fin_retentions.request_hash IS 'FIN-09C2 : empreinte durable de la requête originale (facture, saisie brute, confirmation)';

CREATE OR REPLACE FUNCTION public.fin_retention_create(_invoice uuid, _key text, _p jsonb, _expect_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices; v jsonb; e fin_retentions; nid uuid; rq text;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  -- Empreinte durable de la requête complète (facture + saisie brute canonique + confirmation d'aperçu),
  -- reconnue AVANT tout calcul dépendant du solde : un rejeu exact reste un rejeu après encaissement/avoir/libération.
  rq := md5(jsonb_build_object('invoice', _invoice, 'p', _p, 'expect', _expect_hash)::text);
  SELECT * INTO e FROM fin_retentions WHERE company_id = i.company_id AND idem_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.invoice_id = _invoice AND e.request_hash = rq THEN
      RETURN jsonb_build_object('id', e.id, 'replayed', true, 'position', public.fin_invoice_position(_invoice));
    END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre retenue' USING ERRCODE = 'P0409';
  END IF;
  v := public.fin_retention_validate(i, _p);
  IF jsonb_array_length(v->'errors') > 0 THEN RAISE EXCEPTION 'Retenue refusée : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v->'errors')), ' ; '); END IF;
  IF _expect_hash IS DISTINCT FROM md5((v->>'payload_hash') || (v->>'state_hash')) THEN
    RAISE EXCEPTION 'Solde ou saisie modifiés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409';
  END IF;
  INSERT INTO fin_retentions(company_id, invoice_id, kind, mode, pct, base_amount, amount, reason, contract_ref, planned_release, release_condition, idem_key, payload_hash, request_hash)
  VALUES (i.company_id, _invoice, 'taxes_exigibles', v->>'mode', (v->>'pct')::numeric, (v->>'base')::numeric, (v->>'amount')::numeric, v->>'reason', v->>'contract_ref',
    (v->>'planned_release')::date, v->>'release_condition', _key, v->>'payload_hash', rq) RETURNING id INTO nid;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, action, detail)
  VALUES (i.company_id, _invoice, nid, 'create', jsonb_build_object('amount', v->'amount', 'mode', v->'mode', 'pct', v->'pct', 'base', v->'base', 'reason', v->'reason', 'planned_release', v->'planned_release'));
  PERFORM public.fin_retention_check(_invoice);
  PERFORM public.fin_invoice_receipts_sync(_invoice);
  RETURN jsonb_build_object('id', nid, 'replayed', false, 'position', public.fin_invoice_position(_invoice));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_release(_retention uuid, _key text, _amount text, _date text, _reason text, _expect_rev integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inv uuid; r fin_retentions; e fin_retention_releases; amt numeric; d date; h text; rest numeric; nid uuid;
BEGIN
  SELECT invoice_id INTO inv FROM fin_retentions WHERE id = _retention;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = _retention FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  IF _amount IS NULL OR _amount !~ '^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Montant de libération invalide (2 décimales au plus)'; END IF;
  amt := _amount::numeric;
  BEGIN IF _date IS NULL OR _date !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'x'; END IF; d := _date::date; IF to_char(d,'YYYY-MM-DD') <> _date THEN RAISE EXCEPTION 'x'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Date de libération invalide'; END;
  IF coalesce(trim(_reason),'') = '' OR length(trim(_reason)) > 500 THEN RAISE EXCEPTION 'Motif de libération requis'; END IF;
  -- requête complète, révision attendue comprise
  h := md5(concat_ws('|', 'rq2', _retention, amt, d, trim(_reason), coalesce(_expect_rev::text, 'null')));
  SELECT * INTO e FROM fin_retention_releases WHERE company_id = r.company_id AND idem_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.payload_hash = h THEN RETURN jsonb_build_object('id', e.id, 'replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv)); END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre libération' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  IF r.status <> 'active' THEN RAISE EXCEPTION 'Retenue annulée : aucune libération possible'; END IF;
  IF amt <= 0 THEN RAISE EXCEPTION 'Montant positif requis'; END IF;
  rest := r.amount - coalesce((SELECT sum(amount) FROM fin_retention_releases WHERE retention_id = r.id AND voided_at IS NULL),0);
  IF amt > rest THEN RAISE EXCEPTION 'Libération supérieure à la retenue restante (% $)', rest; END IF;
  INSERT INTO fin_retention_releases(company_id, invoice_id, retention_id, amount, released_on, reason, idem_key, payload_hash)
  VALUES (r.company_id, inv, r.id, amt, d, trim(_reason), _key, h) RETURNING id INTO nid;
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, release_id, action, detail)
  VALUES (r.company_id, inv, r.id, nid, 'release', jsonb_build_object('amount', amt, 'date', d, 'reason', trim(_reason)));
  PERFORM public.fin_invoice_receipts_sync(inv);
  RETURN jsonb_build_object('id', nid, 'replayed', false, 'rev', r.rev + 1, 'position', public.fin_invoice_position(inv));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_void(_retention uuid, _key text, _reason text, _expect_rev integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inv uuid; r fin_retentions;
BEGIN
  SELECT invoice_id INTO inv FROM fin_retentions WHERE id = _retention;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = _retention FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  IF coalesce(trim(_reason),'') = '' OR length(trim(_reason)) > 500 THEN RAISE EXCEPTION 'Motif d''annulation requis'; END IF;
  IF r.status = 'annulee' THEN
    IF r.void_key = _key AND r.void_request_hash = md5(concat_ws('|', 'rv', r.id, trim(_reason), coalesce(_expect_rev::text,'null'))) THEN RETURN jsonb_build_object('replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv)); END IF;
    RAISE EXCEPTION 'Retenue déjà annulée par une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_retentions WHERE company_id = r.company_id AND void_key = _key) OR EXISTS (SELECT 1 FROM fin_retention_releases WHERE company_id = r.company_id AND void_key = _key) THEN
    RAISE EXCEPTION 'Clé d''annulation déjà utilisée' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_retentions SET status = 'annulee', voided_at = now(), voided_by = auth.uid(), void_reason = trim(_reason), void_key = _key, void_request_hash = md5(concat_ws('|', 'rv', r.id, trim(_reason), coalesce(_expect_rev::text,'null'))), rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, action, detail) VALUES (r.company_id, inv, r.id, 'void', jsonb_build_object('reason', trim(_reason)));
  PERFORM public.fin_invoice_receipts_sync(inv);
  RETURN jsonb_build_object('replayed', false, 'rev', r.rev + 1, 'position', public.fin_invoice_position(inv));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_release_void(_release uuid, _key text, _reason text, _expect_rev integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inv uuid; rid uuid; r fin_retentions; l fin_retention_releases;
BEGIN
  SELECT invoice_id, retention_id INTO inv, rid FROM fin_retention_releases WHERE id = _release;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = rid FOR UPDATE;
  SELECT * INTO l FROM fin_retention_releases WHERE id = _release FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  IF coalesce(trim(_reason),'') = '' OR length(trim(_reason)) > 500 THEN RAISE EXCEPTION 'Motif d''annulation requis'; END IF;
  IF l.voided_at IS NOT NULL THEN
    IF l.void_key = _key AND l.void_request_hash = md5(concat_ws('|', 'lv', l.id, trim(_reason), coalesce(_expect_rev::text,'null'))) THEN RETURN jsonb_build_object('replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv)); END IF;
    RAISE EXCEPTION 'Libération déjà annulée par une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_retentions WHERE company_id = r.company_id AND void_key = _key) OR EXISTS (SELECT 1 FROM fin_retention_releases WHERE company_id = r.company_id AND void_key = _key) THEN
    RAISE EXCEPTION 'Clé d''annulation déjà utilisée' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  IF r.status <> 'active' THEN RAISE EXCEPTION 'Retenue annulée : historique figé'; END IF;
  UPDATE fin_retention_releases SET voided_at = now(), voided_by = auth.uid(), void_reason = trim(_reason), void_key = _key, void_request_hash = md5(concat_ws('|', 'lv', l.id, trim(_reason), coalesce(_expect_rev::text,'null'))) WHERE id = l.id;
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, release_id, action, detail) VALUES (r.company_id, inv, r.id, l.id, 'release_void', jsonb_build_object('reason', trim(_reason), 'amount', l.amount));
  PERFORM public.fin_retention_check(inv);
  PERFORM public.fin_invoice_receipts_sync(inv);
  RETURN jsonb_build_object('replayed', false, 'rev', r.rev + 1, 'position', public.fin_invoice_position(inv));
END $function$;
