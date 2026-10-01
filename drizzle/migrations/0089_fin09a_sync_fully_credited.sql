-- Facture entièrement créditée : l'entrée attendue liée sort des prévisions (archivée, historique conservé) au lieu d'un montant nul interdit.
CREATE OR REPLACE FUNCTION public.fin_invoice_receipts_sync(_invoice uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; b jsonb;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  b := public.fin_invoice_balance(_invoice);
  PERFORM set_config('fin.receipt','on',true);
  IF (b->>'net')::numeric > 0 THEN
    UPDATE fin_expected_inflows SET amount = (b->>'net')::numeric, received = (b->>'received')::numeric, archived_at = NULL, updated_at = now() WHERE id = i.expected_inflow_id;
  ELSE
    UPDATE fin_expected_inflows SET archived_at = coalesce(archived_at, now()), note = left(coalesce(note,'') || ' — soldée par note de crédit', 500), updated_at = now()
    WHERE id = i.expected_inflow_id AND archived_at IS NULL;
  END IF;
  PERFORM set_config('fin.receipt','',true);
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.fin_invoice_receipts_sync(uuid) FROM PUBLIC, anon, authenticated;