-- FIN-12F — Trop-payés et remboursements reçus des fournisseurs (+ finitions FIN-12E1).
ALTER TABLE public.fin_refunds ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.fin_accounts(id);
ALTER TABLE public.fin_refunds ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE public.fin_refunds ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.fin_refunds ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES public.ent_crm_files(id);
ALTER TABLE public.fin_refunds ADD COLUMN IF NOT EXISTS idem_key text;
CREATE UNIQUE INDEX IF NOT EXISTS fin_refunds_idem ON public.fin_refunds(company_id, idem_key) WHERE idem_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fin_supplier_credit_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  credit_id uuid NOT NULL REFERENCES public.fin_supplier_credits(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  refunded_on date NOT NULL,
  account_id uuid REFERENCES public.fin_accounts(id),
  method text NOT NULL,
  reference text,
  file_id uuid REFERENCES public.ent_crm_files(id),
  note text,
  idem_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  UNIQUE (company_id, idem_key)
);
GRANT SELECT ON public.fin_supplier_credit_refunds TO authenticated;
GRANT ALL ON public.fin_supplier_credit_refunds TO service_role;
ALTER TABLE public.fin_supplier_credit_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_scrr_read" ON public.fin_supplier_credit_refunds FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE INDEX IF NOT EXISTS fin_scrr_credit ON public.fin_supplier_credit_refunds(credit_id);

CREATE OR REPLACE FUNCTION public.fin_credit_refunded(_credit uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(sum(amount),0) FROM public.fin_supplier_credit_refunds WHERE credit_id = _credit AND voided_at IS NULL $$;
CREATE OR REPLACE FUNCTION public.fin_scr_avail(_credit uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.total - public.fin_credit_allocated(s.id) - public.fin_credit_refunded(s.id) FROM public.fin_supplier_credits s WHERE s.id = _credit $$;
REVOKE EXECUTE ON FUNCTION public.fin_credit_refunded(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fin_scr_avail(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.fin_scr_alloc(_credit uuid, _bill uuid, _amount numeric, _key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.fin_supplier_credits; b public.fin_supplier_bills; a public.fin_supplier_credit_allocs; avail numeric; bal numeric; amt numeric;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé d''affectation requise'; END IF;
  SELECT * INTO c FROM public.fin_supplier_credits WHERE id = _credit FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.fin_supplier_credit_allocs WHERE company_id = c.company_id AND idem_key = _key;
  IF a.id IS NOT NULL THEN
    IF a.credit_id = _credit AND a.bill_id = _bill AND (_amount IS NULL OR a.amount = round(_amount,2)) THEN
      RETURN jsonb_build_object('id', a.id, 'amount', a.amount, 'replay', true); END IF;
    RAISE EXCEPTION 'Clé d''affectation déjà utilisée pour une autre demande' USING ERRCODE='P0409';
  END IF;
  IF c.status <> 'confirmed' THEN RAISE EXCEPTION 'Seul un crédit confirmé peut être affecté' USING ERRCODE='P0409'; END IF;
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _bill FOR UPDATE;
  IF b.id IS NULL OR b.company_id <> c.company_id THEN RAISE EXCEPTION 'Facture hors de cette entreprise' USING ERRCODE='42501'; END IF;
  IF b.supplier_id <> c.supplier_id THEN RAISE EXCEPTION 'Facture d''un autre fournisseur' USING ERRCODE='P0409'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Seule une facture confirmée peut recevoir un crédit' USING ERRCODE='P0409'; END IF;
  PERFORM 1 FROM public.fin_occurrences WHERE id = b.occurrence_id FOR UPDATE;
  avail := public.fin_scr_avail(c.id);
  bal := b.total - public.fin_occ_paid(b.occurrence_id) - public.fin_bill_credited(b.id);
  IF avail <= 0 THEN RAISE EXCEPTION 'Crédit entièrement utilisé (affecté ou remboursé) : disponible 0 $' USING ERRCODE='P0409'; END IF;
  IF bal <= 0 THEN RAISE EXCEPTION 'Facture déjà soldée (reste 0 $)' USING ERRCODE='P0409'; END IF;
  amt := CASE WHEN _amount IS NULL THEN least(avail, bal) ELSE round(_amount,2) END;
  IF amt <= 0 THEN RAISE EXCEPTION 'Montant supérieur à 0 requis'; END IF;
  IF amt > avail THEN RAISE EXCEPTION 'Affectation de % $ refusée : crédit disponible % $', amt, avail USING ERRCODE='P0409'; END IF;
  IF amt > bal THEN RAISE EXCEPTION 'Affectation de % $ refusée : reste à payer de la facture % $', amt, bal USING ERRCODE='P0409'; END IF;
  INSERT INTO public.fin_supplier_credit_allocs(company_id, credit_id, bill_id, amount, idem_key, created_by)
  VALUES (c.company_id, c.id, b.id, amt, _key, auth.uid()) RETURNING * INTO a;
  PERFORM public.fin_scr_log(c, a.id, 'allocate', NULL, jsonb_build_object('bill_id', b.id, 'reference', b.reference, 'amount', amt, 'bill_rest_after', bal - amt, 'available_after', avail - amt));
  PERFORM public.fin_sb_log(b, 'credit_allocate', NULL, jsonb_build_object('credit_id', c.id, 'reference', c.reference, 'amount', amt));
  RETURN jsonb_build_object('id', a.id, 'amount', amt, 'bill_rest', bal - amt, 'available', avail - amt);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_scr_list(_company uuid, _supplier uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'supplier_id', s.supplier_id, 'supplier', cl.name, 'reference', s.reference, 'doc_date', s.doc_date,
      'status', s.status, 'total', s.total, 'tax_status', s.tax_status, 'linked_bill_id', s.linked_bill_id, 'file_id', s.file_id,
      'allocated', CASE WHEN s.status='confirmed' THEN public.fin_credit_allocated(s.id) ELSE 0 END,
      'refunded', CASE WHEN s.status='confirmed' THEN public.fin_credit_refunded(s.id) ELSE 0 END,
      'available', CASE WHEN s.status='confirmed' THEN public.fin_scr_avail(s.id) END,
      'created_at', s.created_at) ORDER BY s.created_at DESC), '[]')
    FROM public.fin_supplier_credits s JOIN public.ent_crm_clients cl ON cl.id = s.supplier_id
    WHERE s.company_id = _company AND (_supplier IS NULL OR s.supplier_id = _supplier));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_scr_void(_id uuid, _expect_rev integer, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.fin_supplier_credits; al numeric; rf numeric;
BEGIN
  SELECT * INTO c FROM public.fin_supplier_credits WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_correct(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF _expect_rev IS DISTINCT FROM c.rev THEN RAISE EXCEPTION 'Conflit : rechargez le crédit' USING ERRCODE='P0409'; END IF;
  IF c.status = 'void' THEN RAISE EXCEPTION 'Déjà annulé' USING ERRCODE='P0409'; END IF;
  al := public.fin_credit_allocated(c.id); rf := public.fin_credit_refunded(c.id);
  IF al > 0 OR rf > 0 THEN RAISE EXCEPTION 'Opérations actives sur ce crédit : % $ affectés à des factures, % $ remboursés. Annulez d''abord ces affectations et remboursements, puis le crédit.', al, rf USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_supplier_credits SET status = 'void', void_reason = btrim(_reason), voided_at = now(), voided_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO c;
  PERFORM public.fin_scr_log(c, NULL, 'void', _reason, NULL);
  RETURN jsonb_build_object('id', c.id, 'status', c.status);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_payment_void(_payment uuid, _kind text, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p public.fin_payments; a record; n int := 0; nre int; sre numeric; nrf int; srf numeric;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_correct(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _kind NOT IN ('entry_error','returned') THEN RAISE EXCEPTION 'Type d''annulation invalide'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF p.status NOT IN ('validated','draft') THEN RAISE EXCEPTION 'Versement déjà annulé ou retourné' USING ERRCODE='P0409'; END IF;
  IF _kind='returned' AND p.status='draft' THEN RAISE EXCEPTION 'Un brouillon ne peut pas être « retourné » : annulez-le comme saisie'; END IF;
  SELECT count(*), coalesce(sum(amount),0) INTO nrf, srf FROM public.fin_refunds WHERE payment_id=p.id AND voided_at IS NULL;
  SELECT count(*), coalesce(sum(amount),0) INTO nre, sre FROM public.fin_allocations WHERE payment_id=p.id AND reversed_at IS NULL
     AND created_at IS DISTINCT FROM p.created_at AND created_at IS DISTINCT FROM p.validated_at;
  IF nrf > 0 OR nre > 0 THEN
    RAISE EXCEPTION 'Ce versement ne peut pas être annulé : % remboursement(s) reçu(s) (% $) et % affectation(s) ultérieure(s) de son disponible (% $) en dépendent. Annulez d''abord ces opérations (fiche fournisseur ou fiche du règlement), puis le versement.', nrf, srf, nre, sre USING ERRCODE='P0409';
  END IF;
  FOR a IN SELECT al.*, oc.obligation_id FROM public.fin_allocations al JOIN public.fin_occurrences oc ON oc.id=al.occurrence_id WHERE al.payment_id=p.id AND al.reversed_at IS NULL LOOP
    UPDATE public.fin_allocations SET reversed_at=now(), reversed_by=auth.uid(), reversed_reason=CASE _kind WHEN 'entry_error' THEN 'Saisie annulée : ' ELSE 'Paiement retourné/refusé : ' END||btrim(_reason) WHERE id=a.id;
    PERFORM public.fin_log_pay(p.company_id, p.id, a.obligation_id, a.occurrence_id, 'allocation_reversed', btrim(_reason), jsonb_build_object('amount', a.amount, 'kind', _kind));
    n := n + 1;
  END LOOP;
  UPDATE public.fin_payments SET status=CASE _kind WHEN 'entry_error' THEN 'voided' ELSE 'returned' END, void_reason=btrim(_reason), voided_at=now(), voided_by=auth.uid() WHERE id=p.id;
  PERFORM public.fin_log_pay(p.company_id, p.id, NULL, NULL, CASE _kind WHEN 'entry_error' THEN 'payment_void' ELSE 'payment_returned' END, btrim(_reason), jsonb_build_object('allocations', n, 'amount', p.amount));
  RETURN jsonb_build_object('reversed', n, 'status', CASE _kind WHEN 'entry_error' THEN 'voided' ELSE 'returned' END);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_sup_refund(_source_kind text, _source uuid, _p jsonb, _dry boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p public.fin_payments; c public.fin_supplier_credits; co uuid; av numeric; amt numeric := round(nullif(_p->>'amount','')::numeric,2);
  d date := nullif(_p->>'date','')::date; acc uuid := nullif(_p->>'account_id','')::uuid; m text := _p->>'method';
  ref text := nullif(btrim(coalesce(_p->>'reference','')),''); fid uuid := nullif(_p->>'file_id','')::uuid; note text := nullif(btrim(coalesce(_p->>'note','')),'');
  k text := nullif(_p->>'idem_key',''); src_date date; ex record; rid uuid;
BEGIN
  IF _source_kind NOT IN ('payment','credit') THEN RAISE EXCEPTION 'Source de remboursement invalide'; END IF;
  IF _source_kind = 'payment' THEN
    SELECT * INTO p FROM public.fin_payments WHERE id=_source FOR UPDATE; co := p.company_id; src_date := p.paid_on;
  ELSE
    SELECT * INTO c FROM public.fin_supplier_credits WHERE id=_source FOR UPDATE; co := c.company_id; src_date := c.doc_date;
  END IF;
  IF co IS NULL OR NOT public.fin_can_write(co) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF k IS NULL OR length(k) < 8 THEN RAISE EXCEPTION 'Clé technique de saisie manquante'; END IF;
  IF _source_kind = 'payment' THEN SELECT id, payment_id AS src, amount INTO ex FROM public.fin_refunds WHERE company_id=co AND idem_key=k;
  ELSE SELECT id, credit_id AS src, amount INTO ex FROM public.fin_supplier_credit_refunds WHERE company_id=co AND idem_key=k; END IF;
  IF ex.id IS NOT NULL THEN
    IF ex.src = _source AND ex.amount = amt THEN RETURN jsonb_build_object('refund_id', ex.id, 'replay', true,
      'available', CASE WHEN _source_kind='payment' THEN public.fin_payment_avail(_source) ELSE public.fin_scr_avail(_source) END); END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre demande' USING ERRCODE='P0409';
  END IF;
  IF _source_kind = 'payment' THEN
    IF p.status <> 'validated' THEN RAISE EXCEPTION 'Versement non validé ou annulé : aucun remboursement possible' USING ERRCODE='P0409'; END IF;
    av := public.fin_payment_avail(p.id);
  ELSE
    IF c.status <> 'confirmed' THEN RAISE EXCEPTION 'Seule une note de crédit confirmée peut être remboursée' USING ERRCODE='P0409'; END IF;
    av := public.fin_scr_avail(c.id);
  END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Montant reçu : supérieur à 0 $'; END IF;
  IF d IS NULL OR d > current_date THEN RAISE EXCEPTION 'Date de réception : aujourd''hui ou avant (une intention de remboursement n''est pas un encaissement)'; END IF;
  IF src_date IS NOT NULL AND d < src_date THEN RAISE EXCEPTION 'La réception ne peut pas précéder le document source (%)', src_date; END IF;
  IF m IS NULL OR m NOT IN ('interac','virement','cheque','especes','carte','prelevement','autre') THEN RAISE EXCEPTION 'Mode de réception à choisir'; END IF;
  IF acc IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_accounts WHERE id=acc AND company_id=co AND archived_at IS NULL) THEN RAISE EXCEPTION 'Compte financier de réception à choisir'; END IF;
  IF fid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ent_crm_files WHERE id=fid AND company_id=co) THEN RAISE EXCEPTION 'Justificatif introuvable' USING ERRCODE='42501'; END IF;
  IF coalesce(ref,'') ~ '[0-9]{13,19}' THEN RAISE EXCEPTION 'Ne saisissez jamais un numéro complet de carte ou de compte'; END IF;
  IF amt > av THEN RAISE EXCEPTION 'Remboursement de % $ refusé : disponible actuel % $ (déjà affecté ou remboursé). Rien n''a été enregistré.', amt, av USING ERRCODE='P0409'; END IF;
  IF _dry THEN RETURN jsonb_build_object('available', av, 'after', av - amt, 'cash_in', amt); END IF;
  IF _source_kind = 'payment' THEN
    INSERT INTO public.fin_refunds(company_id, payment_id, amount, refunded_on, reason, created_by, account_id, method, reference, file_id, idem_key)
    VALUES (co, p.id, amt, d, coalesce(note, 'Remboursement reçu du fournisseur (trop-payé)'), auth.uid(), acc, m, ref, fid, k)
    ON CONFLICT (company_id, idem_key) WHERE idem_key IS NOT NULL DO NOTHING RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'Demande déjà en cours de traitement : rechargez' USING ERRCODE='P0409'; END IF;
    PERFORM public.fin_log_pay(co, p.id, NULL, NULL, 'refund', note, jsonb_build_object('amount', amt, 'date', d, 'refund_id', rid, 'method', m, 'account_id', acc, 'available_after', av - amt));
  ELSE
    INSERT INTO public.fin_supplier_credit_refunds(company_id, credit_id, amount, refunded_on, account_id, method, reference, file_id, note, idem_key, created_by)
    VALUES (co, c.id, amt, d, acc, m, ref, fid, note, k, auth.uid())
    ON CONFLICT (company_id, idem_key) DO NOTHING RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'Demande déjà en cours de traitement : rechargez' USING ERRCODE='P0409'; END IF;
    PERFORM public.fin_scr_log(c, NULL, 'refund', note, jsonb_build_object('amount', amt, 'date', d, 'refund_id', rid, 'method', m, 'account_id', acc, 'available_after', av - amt));
  END IF;
  RETURN jsonb_build_object('refund_id', rid, 'available', av - amt);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_sup_refund_void(_source_kind text, _refund uuid, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.fin_supplier_credit_refunds; c public.fin_supplier_credits; co uuid; cr uuid;
BEGIN
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF _source_kind = 'payment' THEN
    SELECT company_id INTO co FROM public.fin_refunds WHERE id=_refund;
    IF co IS NULL OR NOT public.fin_can_correct(co) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
    PERFORM public.fin_refund_void(_refund, _reason);
    RETURN jsonb_build_object('id', _refund, 'voided', true);
  ELSIF _source_kind = 'credit' THEN
    SELECT credit_id INTO cr FROM public.fin_supplier_credit_refunds WHERE id=_refund;
    SELECT * INTO c FROM public.fin_supplier_credits WHERE id=cr FOR UPDATE;
    SELECT * INTO r FROM public.fin_supplier_credit_refunds WHERE id=_refund FOR UPDATE;
    IF r.id IS NULL OR NOT public.fin_can_correct(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
    IF r.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Remboursement déjà annulé' USING ERRCODE='P0409'; END IF;
    UPDATE public.fin_supplier_credit_refunds SET voided_at=now(), voided_by=auth.uid(), void_reason=btrim(_reason) WHERE id=r.id;
    PERFORM public.fin_scr_log(c, NULL, 'refund_void', btrim(_reason), jsonb_build_object('refund_id', r.id, 'amount', r.amount));
    RETURN jsonb_build_object('id', r.id, 'voided', true, 'available', public.fin_scr_avail(c.id));
  END IF;
  RAISE EXCEPTION 'Source de remboursement invalide';
END $function$;

CREATE OR REPLACE FUNCTION public.fin_supplier_balances(_company uuid, _supplier uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pk text := 'c:' || _supplier::text; bills jsonb; pays jsonb; crs jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_supplier_profiles WHERE client_id=_supplier AND company_id=_company) THEN RAISE EXCEPTION 'Fournisseur introuvable' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'doc_date'), '[]') INTO bills FROM (
    SELECT jsonb_build_object('id', b.id, 'reference', b.reference, 'doc_date', b.doc_date, 'due_date', o.due_date, 'due_unknown', coalesce(o.due_unknown, false),
      'occurrence_id', b.occurrence_id, 'total', b.total, 'paid', public.fin_occ_paid(b.occurrence_id), 'credited', public.fin_bill_credited(b.id),
      'rest', greatest(b.total - public.fin_occ_paid(b.occurrence_id) - public.fin_bill_credited(b.id), 0)) x
    FROM public.fin_supplier_bills b LEFT JOIN public.fin_occurrences o ON o.id=b.occurrence_id
    WHERE b.company_id=_company AND b.supplier_id=_supplier AND b.status='confirmed') q;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'paid_on' DESC), '[]') INTO pays FROM (
    SELECT jsonb_build_object('id', p.id, 'paid_on', p.paid_on, 'amount', p.amount, 'method', p.method, 'reference', p.reference, 'status', p.status,
      'available', CASE WHEN p.status='validated' THEN public.fin_payment_avail(p.id) ELSE 0 END,
      'excess_origin', (SELECT (l.after->>'excess')::numeric FROM public.fin_events l WHERE l.payment_id=p.id AND l.action='overpayment' ORDER BY l.created_at LIMIT 1),
      'allocs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'amount', a.amount, 'created_at', a.created_at, 'reversed_at', a.reversed_at, 'reversed_reason', a.reversed_reason,
          'later', a.created_at IS DISTINCT FROM p.created_at AND a.created_at IS DISTINCT FROM p.validated_at,
          'bill_id', b.id, 'bill_ref', b.reference) ORDER BY a.created_at), '[]')
        FROM public.fin_allocations a LEFT JOIN public.fin_supplier_bills b ON b.occurrence_id=a.occurrence_id AND b.company_id=p.company_id WHERE a.payment_id=p.id),
      'refunds', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount, 'date', r.refunded_on, 'method', r.method, 'reference', r.reference,
          'account', ac.name, 'file_id', r.file_id, 'note', r.reason, 'voided_at', r.voided_at, 'void_reason', r.void_reason) ORDER BY r.created_at), '[]')
        FROM public.fin_refunds r LEFT JOIN public.fin_accounts ac ON ac.id=r.account_id WHERE r.payment_id=p.id)) x
    FROM public.fin_payments p WHERE p.company_id=_company AND p.payee_key=pk AND p.status IN ('validated','voided','returned')) q;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'doc_date' DESC), '[]') INTO crs FROM (
    SELECT jsonb_build_object('id', s.id, 'reference', s.reference, 'doc_date', s.doc_date, 'total', s.total, 'status', s.status, 'rev', s.rev,
      'allocated', public.fin_credit_allocated(s.id), 'refunded', public.fin_credit_refunded(s.id), 'available', public.fin_scr_avail(s.id),
      'allocs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'amount', a.amount, 'created_at', a.created_at, 'reversed_at', a.reversed_at, 'reversed_reason', a.reverse_reason, 'bill_id', a.bill_id, 'bill_ref', b.reference) ORDER BY a.created_at), '[]')
        FROM public.fin_supplier_credit_allocs a JOIN public.fin_supplier_bills b ON b.id=a.bill_id WHERE a.credit_id=s.id),
      'refunds', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount, 'date', r.refunded_on, 'method', r.method, 'reference', r.reference,
          'account', ac.name, 'file_id', r.file_id, 'note', r.note, 'voided_at', r.voided_at, 'void_reason', r.void_reason) ORDER BY r.created_at), '[]')
        FROM public.fin_supplier_credit_refunds r LEFT JOIN public.fin_accounts ac ON ac.id=r.account_id WHERE r.credit_id=s.id)) x
    FROM public.fin_supplier_credits s WHERE s.company_id=_company AND s.supplier_id=_supplier AND s.status IN ('confirmed','void')) q;
  RETURN jsonb_build_object('bills', bills, 'payments', pays, 'credits', crs,
    'overpaid_available', (SELECT coalesce(sum((x->>'available')::numeric),0) FROM jsonb_array_elements(pays) x WHERE x->>'status'='validated'),
    'credit_available', (SELECT coalesce(sum((x->>'available')::numeric),0) FROM jsonb_array_elements(crs) x WHERE x->>'status'='confirmed'),
    'rest_total', (SELECT coalesce(sum((x->>'rest')::numeric),0) FROM jsonb_array_elements(bills) x));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_cap_attach(_id uuid, _bill uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.fin_doc_captures; r jsonb; k text; dk text;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) OR NOT public.fin_cap_exp_ok(c.id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_supplier_bills WHERE id = _bill AND company_id = c.company_id) THEN dk := 'bill';
  ELSIF EXISTS (SELECT 1 FROM public.fin_supplier_credits WHERE id = _bill AND company_id = c.company_id) THEN dk := 'credit';
  ELSE RAISE EXCEPTION 'Document hors de cette entreprise' USING ERRCODE='42501'; END IF;
  k := 'att:' || _bill::text;
  SELECT x INTO r FROM jsonb_array_elements(c.results) x WHERE x->>'key' = k;
  IF r IS NOT NULL THEN RETURN r || jsonb_build_object('replay', true); END IF;
  r := jsonb_build_object('kind', 'attached', 'doc', dk, 'id', _bill, 'key', k, 'at', now());
  UPDATE public.fin_doc_captures SET results = results || jsonb_build_array(r), status = 'traite', rev = rev + 1, updated_at = now() WHERE id = _id;
  PERFORM public.fin_cap_log(c, 'attach', NULL, r);
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_cap_create(_id uuid, _kind text, _index integer, _p jsonb, _dup_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.fin_doc_captures; r jsonb; p jsonb; d jsonb; k text; n integer; ref text; sup text; exd jsonb;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _kind NOT IN ('bill','credit') THEN RAISE EXCEPTION 'Type non pris en charge (relevé, reçu employé : aucune dette créée ici)'; END IF;
  IF c.status = 'ecarte' THEN RAISE EXCEPTION 'Document écarté' USING ERRCODE='P0409'; END IF;
  n := coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(c.extraction->'documents') = 'array' THEN c.extraction->'documents' END), 0);
  IF n > 1 AND _index IS NULL THEN RAISE EXCEPTION 'Plusieurs factures détectées : choisissez explicitement le document à créer' USING ERRCODE='P0409'; END IF;
  k := 'cap:' || c.id::text || ':' || coalesce(_index, 0)::text;
  SELECT x INTO r FROM jsonb_array_elements(c.results) x WHERE x->>'key' = k;
  IF r IS NOT NULL THEN RETURN r || jsonb_build_object('replay', true); END IF;
  p := _p || jsonb_build_object('file_id', c.file_id, 'file_sha256', c.file_sha256, 'currency', 'CAD');
  ref := lower(btrim(coalesce(p->>'reference',''))); sup := coalesce(p->>'supplier_id','');
  IF ref <> '' AND sup <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(c.company_id::text || 'csv:' || CASE WHEN _kind = 'bill' THEN 'facture' ELSE 'credit' END || ':' || sup || ':' || ref, 0));
  END IF;
  IF nullif(btrim(coalesce(_dup_reason,'')),'') IS NULL THEN
    IF _kind = 'bill' THEN
      d := public.fin_bill_dups(c.company_id, NULL, p);
      IF jsonb_array_length(d->'exact') > 0 THEN exd := d->'exact'->0; END IF;
    ELSIF ref <> '' THEN
      SELECT jsonb_build_object('id', x.id, 'reference', x.reference, 'status', x.status, 'total', x.total, 'doc_date', x.doc_date) INTO exd
        FROM public.fin_supplier_credits x WHERE x.company_id = c.company_id AND x.status <> 'void' AND x.supplier_id::text = sup AND lower(btrim(x.reference)) = ref LIMIT 1;
    END IF;
    IF exd IS NOT NULL THEN
      PERFORM public.fin_cap_log(c, 'duplicate_' || _kind, NULL, jsonb_build_object('existing', exd->>'id'));
      RETURN jsonb_build_object('kind', 'duplicate', 'doc', _kind, 'created', false,
        'message', CASE WHEN _kind = 'bill' THEN 'Cette facture est déjà enregistrée pour ce fournisseur. Aucun nouveau brouillon n''a été créé : joignez ce reçu à la facture existante, ou indiquez un motif d''exception.'
                        ELSE 'Cette note de crédit est déjà enregistrée pour ce fournisseur et ce numéro. Aucun nouveau brouillon n''a été créé : joignez ce reçu à la note existante, ou indiquez un motif d''exception.' END,
        'existing', CASE WHEN public.fin_can_read(c.company_id) THEN jsonb_build_object('id', exd->>'id', 'reference', exd->>'reference', 'status', exd->>'status', 'total', exd->'total', 'doc_date', exd->>'doc_date') END);
    END IF;
  END IF;
  IF _kind = 'bill' THEN r := public.fin_bill_save(c.company_id, NULL, p, NULL, k);
  ELSE r := public.fin_scr_save(c.company_id, NULL, p, NULL, k); END IF;
  r := jsonb_build_object('kind', _kind, 'id', r->>'id', 'index', _index, 'key', k, 'at', now());
  UPDATE public.fin_doc_captures SET results = results || jsonb_build_array(r), status = 'traite', rev = rev + 1, updated_at = now() WHERE id = _id;
  PERFORM public.fin_cap_log(c, 'create_' || _kind, nullif(btrim(coalesce(_dup_reason,'')),''), r);
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_payment_save(_company uuid, _p jsonb, _dry boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE amt numeric := round(nullif(_p->>'amount','')::numeric,2); d date := nullif(_p->>'paid_on','')::date; m text := _p->>'method';
  dr boolean := coalesce((_p->>'draft')::boolean,false); idem text := nullif(_p->>'idem_key',''); ex public.fin_payments; pid uuid;
  allocs jsonb := coalesce(_p->'allocations','[]'::jsonb); payee text; pname text; res jsonb; dups jsonb; src text := nullif(btrim(_p->>'source_label'),'');
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF idem IS NULL THEN RAISE EXCEPTION 'Clé technique de saisie manquante'; END IF;
  SELECT * INTO ex FROM public.fin_payments WHERE company_id=_company AND idem_key=idem;
  IF ex.id IS NOT NULL THEN RETURN jsonb_build_object('payment_id', ex.id, 'replayed', true, 'status', ex.status); END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Montant du versement : supérieur à 0 $'; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'Date du versement requise'; END IF;
  IF m IS NULL OR m NOT IN ('interac','virement','cheque','especes','carte','prelevement','autre') THEN RAISE EXCEPTION 'Moyen de paiement à choisir'; END IF;
  IF d > current_date AND NOT dr THEN RAISE EXCEPTION 'Date future : un versement à venir s''enregistre comme brouillon (planification), pas comme versement effectué'; END IF;
  IF coalesce(src,'') ~ '[0-9]{7,}' OR regexp_replace(coalesce(_p->>'reference',''),'[^0-9]','','g') ~ '^[0-9]{13,19}$' THEN
    RAISE EXCEPTION 'Ne saisissez jamais un numéro complet de carte ou de compte : 4 derniers chiffres au plus'; END IF;
  SELECT public.fin_payee_key(ob), coalesce(cl.name, ob.payee_label, ob.label) INTO payee, pname
    FROM public.fin_occurrences oc JOIN public.fin_obligations ob ON ob.id=oc.obligation_id
    LEFT JOIN public.ent_crm_clients cl ON cl.id=ob.payee_client_id AND cl.company_id=ob.company_id
   WHERE oc.id = nullif(allocs->0->>'occurrence_id','')::uuid AND oc.company_id=_company;
  IF payee IS NULL THEN RAISE EXCEPTION 'Échéance introuvable' USING ERRCODE='42501'; END IF;
  res := public.fin__alloc(_company, payee, allocs, amt, true);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'paid_on',paid_on,'amount',amount,'method',method,'reference',reference)),'[]') INTO dups
    FROM public.fin_payments WHERE company_id=_company AND payee_key=payee AND amount=amt AND paid_on=d AND status='validated';
  IF _dry THEN RETURN res || jsonb_build_object('payee', pname, 'amount', amt, 'remainder', amt - (res->>'total')::numeric, 'duplicates', dups, 'draft', dr, 'excess_required', amt - (res->>'total')::numeric > 0); END IF;
  -- FIN-12F : un trop-payé n'est accepté qu'après confirmation explicite du montant excédentaire (au cent près).
  IF amt - (res->>'total')::numeric > 0 AND round(nullif(_p->>'excess_confirm','')::numeric,2) IS DISTINCT FROM amt - (res->>'total')::numeric THEN
    RAISE EXCEPTION 'Trop-payé de % $ : le versement dépasse le solde affecté. Confirmez explicitement ce montant excédentaire (il restera disponible chez ce bénéficiaire, relié à ce versement). Rien n''a été enregistré.', amt - (res->>'total')::numeric USING ERRCODE='P0409';
  END IF;
  INSERT INTO public.fin_payments(company_id, payee_key, payee_name, amount, paid_on, method, source_label, reference, note, status, draft_alloc, validated_at, idem_key, created_by, is_support)
  VALUES (_company, payee, pname, amt, d, m, src, nullif(btrim(_p->>'reference'),''), nullif(btrim(_p->>'note'),''),
          CASE WHEN dr THEN 'draft' ELSE 'validated' END, CASE WHEN dr THEN allocs END, CASE WHEN dr THEN NULL ELSE now() END, idem, auth.uid(), public.has_role(auth.uid(),'admin'))
  ON CONFLICT (company_id, idem_key) DO NOTHING RETURNING id INTO pid;
  IF pid IS NULL THEN SELECT id INTO pid FROM public.fin_payments WHERE company_id=_company AND idem_key=idem; RETURN jsonb_build_object('payment_id', pid, 'replayed', true); END IF;
  PERFORM public.fin_log_pay(_company, pid, NULL, NULL, CASE WHEN dr THEN 'payment_draft' ELSE 'payment' END, NULL, jsonb_build_object('amount',amt,'paid_on',d,'method',m));
  IF NOT dr THEN res := public.fin__alloc(_company, payee, allocs, amt, false, pid); END IF;
  IF amt - (res->>'total')::numeric > 0 THEN PERFORM public.fin_log_pay(_company, pid, NULL, NULL, 'overpayment', 'Excédent confirmé', jsonb_build_object('excess', amt - (res->>'total')::numeric)); END IF;
  RETURN res || jsonb_build_object('payment_id', pid, 'payee', pname, 'amount', amt, 'remainder', amt - (res->>'total')::numeric, 'duplicates', dups, 'draft', dr);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_csv_commit(_company uuid, _request_key text, _file_name text, _file_sha text, _settings jsonb, _docs jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE imp public.fin_csv_imports; d jsonb; pb text; ex jsonb; dk text; r jsonb; oc text; bid uuid; cid uuid; res jsonb := '[]'; cnt jsonb;
  cm jsonb; res_kind text; att uuid; capr public.fin_doc_captures;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF jsonb_array_length(_docs) > 500 THEN RAISE EXCEPTION 'Maximum 500 documents par import'; END IF;
  SELECT * INTO imp FROM public.fin_csv_imports WHERE company_id = _company AND request_key = _request_key;
  IF imp.id IS NOT NULL THEN RETURN imp.summary || jsonb_build_object('import_id', imp.id, 'replay', true); END IF;
  INSERT INTO public.fin_csv_imports(company_id, file_name, file_sha256, request_key, settings, created_by)
  VALUES (_company, left(_file_name, 200), _file_sha, _request_key, coalesce(_settings,'{}'), auth.uid())
  ON CONFLICT (company_id, request_key) DO NOTHING RETURNING * INTO imp;
  IF imp.id IS NULL THEN
    SELECT * INTO imp FROM public.fin_csv_imports WHERE company_id = _company AND request_key = _request_key;
    RETURN imp.summary || jsonb_build_object('import_id', imp.id, 'replay', true);
  END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(_docs) LOOP
    bid := NULL; cid := NULL; ex := NULL; cm := '[]'; att := NULL;
    res_kind := d->'resolution'->>'kind';
    pb := public.fin_csv_doc_problem(_company, d);
    dk := 'csv:' || (d->>'kind') || ':' || coalesce(d->'p'->>'supplier_id','') || ':' || lower(btrim(coalesce(d->'p'->>'reference','')));
    IF pb IS NULL THEN
      IF res_kind = 'attach' THEN
        att := nullif(d->'resolution'->>'capture_id','')::uuid;
        SELECT * INTO capr FROM public.fin_doc_captures WHERE id = att AND company_id = _company FOR UPDATE;
        IF capr.id IS NULL OR NOT public.fin_cap_exp_ok(att) OR capr.exp_file_id IS NOT NULL THEN pb := 'Reçu à rattacher introuvable'; END IF;
      END IF;
    END IF;
    IF pb IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || dk, 0));
      ex := public.fin_csv_existing(_company, d);
      IF ex IS NULL THEN cm := public.fin_csv_cap_matches(_company, d); END IF;
      IF ex IS NULL AND jsonb_array_length(cm) > 0 THEN
        IF res_kind = 'attach' THEN
          IF d->>'kind' NOT IN ('facture','credit') THEN pb := 'Rattachement d''un reçu : factures et notes de crédit seulement';
          ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cm) x WHERE (x->>'capture_id')::uuid = att) THEN pb := 'Le reçu choisi ne correspond pas à ce document'; END IF;
        ELSIF res_kind = 'distinct' THEN
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(cm) x WHERE x->>'level' = 'certaine') THEN pb := 'Correspondance certaine avec un reçu déjà lu : rattachez-le au lieu de créer un deuxième document'; END IF;
        ELSE pb := 'Reçu déjà lu correspondant (' || (cm->0->>'level') || ') : choisissez « rattacher » ou « document distinct »'; END IF;
      ELSIF res_kind = 'attach' AND ex IS NULL THEN pb := 'Le reçu choisi ne correspond plus à ce document';
      END IF;
    END IF;
    IF pb IS NOT NULL AND ex IS NULL THEN oc := 'refuse';
    ELSIF ex IS NOT NULL THEN oc := CASE WHEN (ex->>'same')::boolean THEN 'deja_present' ELSE 'conflit' END;
      IF d->>'kind' = 'facture' THEN bid := (ex->>'id')::uuid; ELSE cid := (ex->>'id')::uuid; END IF;
      pb := CASE WHEN oc = 'conflit' THEN 'Même fournisseur et numéro, montant différent (existant ' || coalesce(ex->>'total','?') || ' $) : à examiner, rien n''est écrasé' ELSE 'Document déjà enregistré' END;
    ELSE
      IF d->>'kind' = 'facture' THEN r := public.fin_bill_save(_company, NULL, d->'p', NULL, dk); bid := (r->>'id')::uuid;
        PERFORM public.fin_sb_log(b, 'csv_import', NULL, jsonb_build_object('import_id', imp.id, 'rows', d->'rows', 'src', d->'src')) FROM public.fin_supplier_bills b WHERE b.id = bid;
        IF att IS NOT NULL THEN PERFORM public.fin_cap_attach(att, bid); END IF;
      ELSE r := public.fin_scr_save(_company, NULL, d->'p', NULL, dk); cid := (r->>'id')::uuid;
        IF att IS NOT NULL THEN PERFORM public.fin_cap_attach(att, cid); END IF; END IF;
      oc := CASE WHEN (r->>'replay')::boolean THEN 'deja_present' ELSE 'cree' END;
      pb := CASE WHEN att IS NOT NULL THEN CASE WHEN cid IS NOT NULL THEN 'Reçu rattaché au brouillon de note de crédit' ELSE 'Reçu rattaché au brouillon' END WHEN res_kind = 'distinct' THEN 'Créé comme document distinct du reçu lu (choix explicite)' END;
    END IF;
    INSERT INTO public.fin_csv_import_docs(import_id, company_id, doc_kind, supplier_id, reference, doc_key, content_hash, source_rows, payload, outcome, reason, bill_id, credit_id)
    VALUES (imp.id, _company, CASE WHEN d->>'kind' IN ('facture','credit') THEN d->>'kind' ELSE 'facture' END, nullif(d->'p'->>'supplier_id','')::uuid, d->'p'->>'reference', dk, d->>'hash',
      coalesce((SELECT array_agg(x::int) FROM jsonb_array_elements_text(d->'rows') x), '{}'),
      d->'p' || jsonb_build_object('src', d->'src', 'resolution', d->'resolution', 'captures', cm), oc, pb, bid, cid);
    res := res || jsonb_build_object('key', d->>'key', 'outcome', oc, 'reason', pb, 'bill_id', bid, 'credit_id', cid, 'attached_capture', att);
  END LOOP;
  SELECT jsonb_build_object('cree', count(*) FILTER (WHERE x->>'outcome'='cree'), 'deja_present', count(*) FILTER (WHERE x->>'outcome'='deja_present'),
    'conflit', count(*) FILTER (WHERE x->>'outcome'='conflit'), 'refuse', count(*) FILTER (WHERE x->>'outcome'='refuse')) INTO cnt FROM jsonb_array_elements(res) x;
  UPDATE public.fin_csv_imports SET summary = jsonb_build_object('counts', cnt, 'docs', res) WHERE id = imp.id;
  RETURN jsonb_build_object('import_id', imp.id, 'counts', cnt, 'docs', res);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fin_sup_refund(text, uuid, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fin_sup_refund_void(text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fin_supplier_balances(uuid, uuid) FROM anon;
