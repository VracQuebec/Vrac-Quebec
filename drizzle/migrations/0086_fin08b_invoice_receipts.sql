ALTER TABLE public.fin_expected_inflows ADD COLUMN IF NOT EXISTS legacy_received numeric(14,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.fin_expected_inflows.legacy_received IS 'FIN-08B : montant déclaré avant le journal des encaissements (date et moyen inconnus), compté une seule fois';
UPDATE public.fin_expected_inflows SET legacy_received = received WHERE invoice_id IS NOT NULL AND legacy_received = 0 AND received > 0;

CREATE TABLE public.fin_invoice_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  received_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('interac','virement','cheque','especes','carte','prelevement','autre')),
  account_id uuid REFERENCES public.fin_accounts(id),
  reference text,
  idem_key text NOT NULL,
  voided_at timestamptz, void_reason text, voided_by uuid,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idem_key)
);
CREATE INDEX fin_invoice_receipts_inv ON public.fin_invoice_receipts(invoice_id);
GRANT SELECT ON public.fin_invoice_receipts TO authenticated;
GRANT ALL ON public.fin_invoice_receipts TO service_role;
ALTER TABLE public.fin_invoice_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin receipts read" ON public.fin_invoice_receipts FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_inflow_invoice_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('fin.invoice_issue', true) = 'on' THEN
    IF OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL THEN NEW.legacy_received := OLD.received; END IF;
    RETURN NEW;
  END IF;
  IF current_setting('fin.receipt', true) = 'on' THEN RETURN NEW; END IF;
  IF OLD.invoice_id IS NOT NULL AND (NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.certainty IS DISTINCT FROM OLD.certainty OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Entrée liée à une facture émise : montant fixé par la facture';
  END IF;
  IF OLD.invoice_id IS NOT NULL AND (NEW.received IS DISTINCT FROM OLD.received OR NEW.legacy_received IS DISTINCT FROM OLD.legacy_received) THEN
    RAISE EXCEPTION 'Entrée liée à une facture : enregistrez l''encaissement depuis la facture';
  END IF;
  IF OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Liaison à une facture : par l''émission seulement'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fin_invoice_receipts_sync(_invoice uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; leg numeric := 0; s numeric; tot numeric;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  SELECT coalesce(legacy_received,0) INTO leg FROM fin_expected_inflows WHERE id = i.expected_inflow_id;
  SELECT coalesce(sum(amount),0) INTO s FROM fin_invoice_receipts WHERE invoice_id = _invoice AND voided_at IS NULL;
  tot := coalesce(leg,0) + s;
  PERFORM set_config('fin.receipt','on',true);
  UPDATE fin_expected_inflows SET received = least(amount, tot), updated_at = now() WHERE id = i.expected_inflow_id;
  PERFORM set_config('fin.receipt','',true);
  RETURN jsonb_build_object('total', i.total, 'legacy', coalesce(leg,0), 'receipts', s, 'received', least(i.total, tot),
    'rest', greatest(0, i.total - tot), 'unallocated', greatest(0, tot - i.total), 'paid', tot >= i.total);
END $$;
REVOKE ALL ON FUNCTION public.fin_invoice_receipts_sync(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_invoice_receipt_add(_invoice uuid, _amount numeric, _date date, _method text, _account uuid, _ref text, _idem text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; v uuid;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF i.status <> 'emise' THEN RAISE EXCEPTION 'Encaissement possible seulement sur une facture émise'; END IF;
  IF coalesce(_idem,'') = '' THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  SELECT id INTO v FROM fin_invoice_receipts WHERE company_id = i.company_id AND idem_key = _idem;
  IF v IS NOT NULL THEN RETURN public.fin_invoice_receipts_sync(_invoice) || jsonb_build_object('id', v, 'replayed', true); END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Montant positif requis'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Date requise'; END IF;
  IF _account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fin_accounts WHERE id = _account AND company_id = i.company_id) THEN RAISE EXCEPTION 'Compte inconnu pour cette entreprise'; END IF;
  INSERT INTO fin_invoice_receipts(company_id, invoice_id, amount, received_on, method, account_id, reference, idem_key, created_by)
  VALUES (i.company_id, _invoice, round(_amount,2), _date, _method, _account, nullif(trim(_ref),''), _idem, auth.uid()) RETURNING id INTO v;
  RETURN public.fin_invoice_receipts_sync(_invoice) || jsonb_build_object('id', v, 'replayed', false);
END $$;

CREATE OR REPLACE FUNCTION public.fin_invoice_receipt_void(_id uuid, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r fin_invoice_receipts;
BEGIN
  SELECT * INTO r FROM fin_invoice_receipts WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF r.voided_at IS NULL THEN
    UPDATE fin_invoice_receipts SET voided_at = now(), void_reason = trim(_reason), voided_by = auth.uid() WHERE id = _id;
  END IF;
  RETURN public.fin_invoice_receipts_sync(r.invoice_id);
END $$;
CREATE OR REPLACE FUNCTION public.fin_invoice_receipt_summary(_invoice uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; leg numeric; s numeric; tot numeric;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR NOT public.fin_can_read(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT coalesce(legacy_received,0) INTO leg FROM fin_expected_inflows WHERE id = i.expected_inflow_id;
  SELECT coalesce(sum(amount),0) INTO s FROM fin_invoice_receipts WHERE invoice_id = _invoice AND voided_at IS NULL;
  tot := coalesce(leg,0) + s;
  RETURN jsonb_build_object('total', i.total, 'legacy', coalesce(leg,0), 'receipts', s, 'received', least(coalesce(i.total,0), tot),
    'rest', greatest(0, coalesce(i.total,0) - tot), 'unallocated', greatest(0, tot - coalesce(i.total,0)), 'paid', i.total IS NOT NULL AND tot >= i.total);
END $$;
REVOKE ALL ON FUNCTION public.fin_invoice_receipt_add(uuid,numeric,date,text,uuid,text,text), public.fin_invoice_receipt_void(uuid,text), public.fin_invoice_receipt_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_invoice_receipt_add(uuid,numeric,date,text,uuid,text,text), public.fin_invoice_receipt_void(uuid,text), public.fin_invoice_receipt_summary(uuid) TO authenticated;