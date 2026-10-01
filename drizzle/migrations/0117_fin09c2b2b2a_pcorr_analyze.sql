-- FIN-09C2B2B2A : analyse LECTURE SEULE d'un paiement de retenue construction TEST (aucune écriture, aucune levée des gardes B2B1).
CREATE OR REPLACE FUNCTION public.fin_ctax_pcorr_analyze(_release uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l fin_retention_releases; r fin_retentions; i fin_invoices; rc fin_invoice_receipts; v jsonb; due date; missing text[] := '{}'; amb text[] := '{}';
BEGIN
  SELECT * INTO l FROM fin_retention_releases WHERE id = _release;
  IF l.id IS NULL OR NOT public.fin_can_read(l.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM fin_retentions WHERE id = l.retention_id AND company_id = l.company_id;
  SELECT * INTO i FROM fin_invoices WHERE id = r.invoice_id AND company_id = l.company_id;
  IF r.id IS NULL OR i.id IS NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  SELECT * INTO rc FROM fin_invoice_receipts WHERE id = l.receipt_id AND company_id = l.company_id;
  due := (r.ctax_snapshot->>'contractual_due')::date;
  IF r.ctax_snapshot IS NULL THEN missing := array_append(missing, 'Instantané fiscal construction absent'::text); END IF;
  IF due IS NULL THEN missing := array_append(missing, 'Échéance contractuelle figée absente'::text); END IF;
  IF l.receipt_id IS NULL THEN missing := array_append(missing, 'Aucun encaissement lié à cette libération'::text);
  ELSIF rc.id IS NULL THEN missing := array_append(missing, 'Encaissement lié introuvable'::text); END IF;
  IF EXISTS (SELECT 1 FROM fin_retention_releases WHERE retention_id = r.id AND voided_at IS NULL AND id <> l.id AND released_on = l.released_on AND created_at = l.created_at) THEN
    amb := array_append(amb, 'Autre paiement/libération actif de même date et même horodatage'::text); END IF;
  IF rc.id IS NOT NULL AND EXISTS (SELECT 1 FROM fin_invoice_receipts WHERE invoice_id = r.invoice_id AND voided_at IS NULL AND id <> rc.id AND created_at = rc.created_at) THEN
    amb := array_append(amb, 'Autre encaissement actif de même horodatage'::text); END IF;
  -- réutilise l'évaluation B2B1 (sans écriture) avec une saisie de formulaire valide pour n'obtenir que les raisons de fond
  v := public.fin_ctax_pcorr_eval(r, l, jsonb_build_object('reason','analyse','test_confirm','oui','error_confirm','oui'));
  RETURN jsonb_build_object(
    'label', 'Analyse TEST — aucune annulation ni modification fiscale',
    'route', CASE WHEN jsonb_array_length(v->'errors') = 0 THEN 'b2b1' ELSE 'refused' END,
    'reasons', v->'errors', 'missing', to_jsonb(missing), 'ambiguities', to_jsonb(amb),
    'is_test', i.is_test, 'invoice_status', i.status, 'invoice_number', i.number, 'retention_status', r.status, 'retention_kind', r.kind, 'rev', r.rev,
    'payment', jsonb_build_object('id', l.id, 'amount', l.amount, 'paid_on', l.released_on, 'source', l.source, 'voided_at', l.voided_at, 'created_at', l.created_at),
    'receipt', CASE WHEN rc.id IS NULL THEN NULL ELSE jsonb_build_object('id', rc.id, 'amount', rc.amount, 'received_on', rc.received_on, 'reference', rc.reference, 'voided_at', rc.voided_at, 'created_at', rc.created_at) END,
    'contractual_due', due, 'retention_amount', r.amount,
    'snapshot', CASE WHEN r.ctax_snapshot IS NULL THEN NULL ELSE jsonb_build_object('base', r.ctax_snapshot->'base', 'gst', r.ctax_snapshot->'gst', 'qst', r.ctax_snapshot->'qst', 'ttc', r.ctax_snapshot->'ttc') END,
    'position', public.fin_invoice_position(r.invoice_id) - 'retention_schedule',
    'linked_tax_events', coalesce((SELECT jsonb_agg(jsonb_build_object('source', source, 'exigible_on', exigible_on, 'base', base, 'gst', gst, 'qst', qst, 'ttc', ttc, 'cum_ttc', cum_ttc, 'date_basis', date_basis) ORDER BY created_at) FROM fin_retention_tax_events WHERE release_id = l.id), '[]'::jsonb),
    'later_tax_events', coalesce((SELECT jsonb_agg(jsonb_build_object('source', source, 'exigible_on', exigible_on, 'base', base, 'gst', gst, 'qst', qst, 'ttc', ttc, 'cum_ttc', cum_ttc) ORDER BY exigible_on, created_at) FROM fin_retention_tax_events WHERE retention_id = r.id AND release_id IS DISTINCT FROM l.id AND (exigible_on > l.released_on OR (exigible_on = l.released_on AND created_at > l.created_at))), '[]'::jsonb),
    'later_payments', coalesce((SELECT jsonb_agg(jsonb_build_object('amount', amount, 'paid_on', released_on, 'source', source) ORDER BY released_on, created_at) FROM fin_retention_releases WHERE retention_id = r.id AND voided_at IS NULL AND id <> l.id AND (released_on, created_at) > (l.released_on, l.created_at)), '[]'::jsonb),
    'corrections', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'reason', reason, 'created_at', created_at) ORDER BY created_at) FROM fin_ctax_corrections WHERE retention_id = r.id), '[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.fin_ctax_pcorr_analyze(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_ctax_pcorr_analyze(uuid) TO authenticated;