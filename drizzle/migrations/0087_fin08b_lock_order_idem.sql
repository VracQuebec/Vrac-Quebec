CREATE OR REPLACE FUNCTION public.fin_invoice_receipt_add(_invoice uuid, _amount numeric, _date date, _method text, _account uuid, _ref text, _idem text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; e fin_invoice_receipts; v uuid;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_idem,'') = '' THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  SELECT * INTO e FROM fin_invoice_receipts WHERE company_id = i.company_id AND idem_key = _idem;
  IF e.id IS NOT NULL THEN
    IF e.invoice_id = _invoice AND e.amount = round(_amount,2) AND e.received_on = _date AND e.method = _method
       AND e.account_id IS NOT DISTINCT FROM _account AND e.reference IS NOT DISTINCT FROM nullif(trim(_ref),'') THEN
      RETURN public.fin_invoice_receipts_sync(_invoice) || jsonb_build_object('id', e.id, 'replayed', true);
    END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour un autre encaissement : vérifiez l''historique avant toute nouvelle saisie' USING ERRCODE = 'P0409';
  END IF;
  IF i.status <> 'emise' THEN RAISE EXCEPTION 'Encaissement possible seulement sur une facture émise'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Montant positif requis'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Date requise'; END IF;
  IF _account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fin_accounts WHERE id = _account AND company_id = i.company_id) THEN RAISE EXCEPTION 'Compte inconnu pour cette entreprise'; END IF;
  INSERT INTO fin_invoice_receipts(company_id, invoice_id, amount, received_on, method, account_id, reference, idem_key, created_by)
  VALUES (i.company_id, _invoice, round(_amount,2), _date, _method, _account, nullif(trim(_ref),''), _idem, auth.uid()) RETURNING id INTO v;
  RETURN public.fin_invoice_receipts_sync(_invoice) || jsonb_build_object('id', v, 'replayed', false);
END $$;

-- Ordre des verrous identique à l'ajout : facture puis encaissement.
CREATE OR REPLACE FUNCTION public.fin_invoice_receipt_void(_id uuid, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv uuid; r fin_invoice_receipts;
BEGIN
  SELECT invoice_id INTO inv FROM fin_invoice_receipts WHERE id = _id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_invoice_receipts WHERE id = _id FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF r.voided_at IS NULL THEN
    UPDATE fin_invoice_receipts SET voided_at = now(), void_reason = trim(_reason), voided_by = auth.uid() WHERE id = _id;
  END IF;
  RETURN public.fin_invoice_receipts_sync(r.invoice_id);
END $$;