ALTER TABLE public.fin_payments ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.fin_accounts(id);
COMMENT ON COLUMN public.fin_payments.account_id IS 'FIN-13A1 : compte financier du versement complet; NULL = compte non précisé (anciens paiements), jamais attribué automatiquement';
CREATE INDEX IF NOT EXISTS fin_payments_account_idx ON public.fin_payments(account_id);

CREATE OR REPLACE FUNCTION public.fin_pay_account_check(_company uuid, _account uuid, _method text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE a public.fin_accounts;
BEGIN
  SELECT * INTO a FROM public.fin_accounts WHERE id = _account AND company_id = _company AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte financier introuvable dans cette entreprise' USING ERRCODE = '42501'; END IF;
  IF coalesce(a.currency,'CAD') <> 'CAD' THEN RAISE EXCEPTION 'Compte en devise % : les versements sont en CAD', a.currency USING ERRCODE = '22023'; END IF;
  IF _method = 'especes' AND a.kind <> 'cash' THEN RAISE EXCEPTION 'Paiement en espèces : choisissez un compte de caisse, pas un compte %', a.kind USING ERRCODE = '22023'; END IF;
  IF _method IN ('virement','cheque','interac','prelevement') AND a.kind <> 'bank' THEN RAISE EXCEPTION 'Ce moyen de paiement exige un compte bancaire' USING ERRCODE = '22023'; END IF;
  IF _method = 'carte' AND a.kind NOT IN ('card','credit','bank') THEN RAISE EXCEPTION 'Paiement par carte : choisissez un compte carte ou bancaire' USING ERRCODE = '22023'; END IF;
END $f$;
REVOKE EXECUTE ON FUNCTION public.fin_pay_account_check(uuid, uuid, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.fin_pay_account_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL THEN PERFORM public.fin_pay_account_check(NEW.company_id, NEW.account_id, NEW.method); END IF;
  ELSIF NEW.account_id IS DISTINCT FROM OLD.account_id AND coalesce(current_setting('fin.acct_change', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Le compte d''un paiement se modifie seulement par « Préciser le compte » (motif obligatoire)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS fin_pay_account_guard ON public.fin_payments;
CREATE TRIGGER fin_pay_account_guard BEFORE INSERT OR UPDATE OF account_id ON public.fin_payments FOR EACH ROW EXECUTE FUNCTION public.fin_pay_account_guard();

CREATE OR REPLACE FUNCTION public.fin_payment_set_account(_payment uuid, _account uuid, _reason text, _dry boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE p public.fin_payments; fromn text; ton text; bad record;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id = _payment;
  IF NOT FOUND OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_bank_src:payment:' || _payment::text));
  SELECT * INTO p FROM public.fin_payments WHERE id = _payment FOR UPDATE;
  IF p.status = 'void' THEN RAISE EXCEPTION 'Paiement annulé : compte non modifiable' USING ERRCODE = 'P0409'; END IF;
  PERFORM public.fin_pay_account_check(p.company_id, _account, p.method);
  IF p.account_id = _account THEN RAISE EXCEPTION 'Ce compte est déjà celui du paiement' USING ERRCODE = '22023'; END IF;
  SELECT l.account_id, a.name INTO bad FROM public.fin_bank_match_items i JOIN public.fin_bank_lines l ON l.id = i.line_id JOIN public.fin_accounts a ON a.id = l.account_id
   WHERE i.active AND i.source_kind = 'payment' AND i.source_id = _payment AND l.account_id <> _account LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Ce paiement est rapproché à une transaction du compte « % ». Annulez d''abord ce rapprochement avec motif avant de choisir un autre compte.', bad.name USING ERRCODE = 'P0409'; END IF;
  SELECT name INTO fromn FROM public.fin_accounts WHERE id = p.account_id;
  SELECT name INTO ton FROM public.fin_accounts WHERE id = _account;
  IF _dry THEN
    RETURN jsonb_build_object('payment_id', p.id, 'amount', p.amount, 'paid_on', p.paid_on, 'from', coalesce(fromn, 'Compte non précisé'), 'to', ton,
      'effect', jsonb_build_array(jsonb_build_object('account', coalesce(fromn, 'Compte non précisé'), 'delta', p.amount), jsonb_build_object('account', ton, 'delta', -p.amount)),
      'total_delta', 0, 'unchanged', 'Montant, date, affectations et soldes des factures inchangés');
  END IF;
  IF length(btrim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'Motif obligatoire' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('fin.acct_change', 'on', true);
  UPDATE public.fin_payments SET account_id = _account WHERE id = p.id;
  PERFORM set_config('fin.acct_change', '', true);
  PERFORM public.fin_log_pay(p.company_id, p.id, NULL, NULL, 'payment_account', btrim(_reason), jsonb_build_object('from', p.account_id, 'to', _account, 'from_name', fromn, 'to_name', ton));
  RETURN jsonb_build_object('payment_id', p.id, 'account_id', _account, 'to', ton);
END $f$;
REVOKE EXECUTE ON FUNCTION public.fin_payment_set_account(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_payment_set_account(uuid, uuid, text, boolean) TO authenticated;

-- Parcours internes notes de frais : versement sans compte toléré (remboursements/avances), signalé par un paramètre de transaction
ALTER FUNCTION public.fin_exp_reimburse(uuid, jsonb) RENAME TO fin_exp_reimburse_core;
ALTER FUNCTION public.fin_exp_adv_pay(uuid, jsonb) RENAME TO fin_exp_adv_pay_core;
REVOKE EXECUTE ON FUNCTION public.fin_exp_reimburse_core(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_exp_adv_pay_core(uuid, jsonb) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.fin_exp_reimburse(_report uuid, _p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r jsonb; BEGIN PERFORM set_config('fin.pay_origin', 'exp', true); r := public.fin_exp_reimburse_core(_report, _p); PERFORM set_config('fin.pay_origin', '', true); RETURN r; END $f$;
CREATE FUNCTION public.fin_exp_adv_pay(_id uuid, _p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r jsonb; BEGIN PERFORM set_config('fin.pay_origin', 'exp', true); r := public.fin_exp_adv_pay_core(_id, _p); PERFORM set_config('fin.pay_origin', '', true); RETURN r; END $f$;
REVOKE EXECUTE ON FUNCTION public.fin_exp_reimburse(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_exp_adv_pay(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_exp_reimburse(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_exp_adv_pay(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_payment_validate(_payment uuid, _dry boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p public.fin_payments; res jsonb;
BEGIN
  SELECT * INTO p FROM public.fin_payments WHERE id=_payment FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Seul un brouillon peut être validé' USING ERRCODE='P0409'; END IF;
  IF p.paid_on > current_date THEN RAISE EXCEPTION 'Date du versement future (%) : il reste un brouillon tant que le versement n''est pas effectué', p.paid_on; END IF;
  res := public.fin__alloc(p.company_id, p.payee_key, p.draft_alloc, p.amount, _dry, p.id);
  IF _dry THEN RETURN res || jsonb_build_object('account_missing', p.account_id IS NULL); END IF;
  IF p.account_id IS NULL THEN RAISE EXCEPTION 'Compte financier à préciser avant de valider ce versement (« Préciser le compte »)' USING ERRCODE='22023'; END IF;
  UPDATE public.fin_payments SET status='validated', validated_at=now() WHERE id=p.id;
  PERFORM public.fin_log_pay(p.company_id, p.id, NULL, NULL, 'payment_validate', NULL, res);
  RETURN res;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_bank_movements(_company uuid)
 RETURNS TABLE(kind text, id uuid, dir text, amount numeric, on_date date, account_id uuid, reference text, label text, party text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT 'payment', p.id, 'out', p.amount, p.paid_on, p.account_id, p.reference,
    CASE WHEN EXISTS (SELECT 1 FROM public.fin_exp_advances a WHERE a.payment_id = p.id) THEN 'Avance versée à un employé'
         WHEN p.payee_name ILIKE 'Employé%' THEN 'Remboursement d''employé' ELSE 'Paiement fournisseur (montant total)' END, p.payee_name
    FROM public.fin_payments p WHERE p.company_id = _company AND p.status = 'validated'
  UNION ALL
  SELECT 'receipt', r.id, 'in', r.amount, r.received_on, r.account_id, r.reference, 'Encaissement client' || coalesce(' — facture ' || i.number, ''), i.client_name
    FROM public.fin_invoice_receipts r JOIN public.fin_invoices i ON i.id = r.invoice_id WHERE r.company_id = _company AND r.voided_at IS NULL
  UNION ALL
  SELECT 'refund', f.id, 'in', f.amount, f.refunded_on, f.account_id, f.reference, 'Remboursement reçu d''un fournisseur (trop-payé)', p.payee_name
    FROM public.fin_refunds f JOIN public.fin_payments p ON p.id = f.payment_id WHERE f.company_id = _company AND f.voided_at IS NULL
  UNION ALL
  SELECT 'credit_refund', c.id, 'in', c.amount, c.refunded_on, c.account_id, c.reference, 'Remboursement reçu d''un fournisseur (note de crédit)', NULL
    FROM public.fin_supplier_credit_refunds c WHERE c.company_id = _company AND c.voided_at IS NULL
  UNION ALL
  SELECT 'restitution', x.id, 'in', x.amount, x.received_on, NULL::uuid, x.reference, 'Restitution d''avance par un employé', a.employee_name
    FROM public.fin_exp_restitutions x JOIN public.fin_exp_advances a ON a.id = x.advance_id WHERE x.company_id = _company AND x.voided_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.fin_payment_save(_company uuid, _p jsonb, _dry boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE amt numeric := round(nullif(_p->>'amount','')::numeric,2); d date := nullif(_p->>'paid_on','')::date; m text := _p->>'method';
  dr boolean := coalesce((_p->>'draft')::boolean,false); idem text := nullif(_p->>'idem_key',''); ex public.fin_payments; pid uuid;
  allocs jsonb := coalesce(_p->'allocations','[]'::jsonb); payee text; pname text; res jsonb; dups jsonb; src text := nullif(btrim(_p->>'source_label'),''); acc uuid := nullif(_p->>'account_id','')::uuid;
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
  -- FIN-13A1 : compte financier du versement complet (obligatoire pour un versement effectué, sauf parcours internes notes de frais).
  IF acc IS NOT NULL THEN PERFORM public.fin_pay_account_check(_company, acc, m);
  ELSIF NOT dr AND coalesce(current_setting('fin.pay_origin', true),'') <> 'exp' THEN
    RAISE EXCEPTION 'Compte financier à choisir : indiquez le compte (banque, caisse ou carte) d''où l''argent est sorti' USING ERRCODE='22023'; END IF;
  SELECT public.fin_payee_key(ob), coalesce(cl.name, ob.payee_label, ob.label) INTO payee, pname
    FROM public.fin_occurrences oc JOIN public.fin_obligations ob ON ob.id=oc.obligation_id
    LEFT JOIN public.ent_crm_clients cl ON cl.id=ob.payee_client_id AND cl.company_id=ob.company_id
   WHERE oc.id = nullif(allocs->0->>'occurrence_id','')::uuid AND oc.company_id=_company;
  IF payee IS NULL THEN RAISE EXCEPTION 'Échéance introuvable' USING ERRCODE='42501'; END IF;
  res := public.fin__alloc(_company, payee, allocs, amt, true);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'paid_on',paid_on,'amount',amount,'method',method,'reference',reference)),'[]') INTO dups
    FROM public.fin_payments WHERE company_id=_company AND payee_key=payee AND amount=amt AND paid_on=d AND status='validated';
  IF _dry THEN RETURN res || jsonb_build_object('payee', pname, 'amount', amt, 'remainder', amt - (res->>'total')::numeric, 'duplicates', dups, 'draft', dr, 'excess_required', amt - (res->>'total')::numeric > 0); END IF;
  IF amt - (res->>'total')::numeric > 0 AND round(nullif(_p->>'excess_confirm','')::numeric,2) IS DISTINCT FROM amt - (res->>'total')::numeric THEN
    RAISE EXCEPTION 'Trop-payé de % $ : le versement dépasse le solde affecté. Confirmez explicitement ce montant excédentaire (il restera disponible chez ce bénéficiaire, relié à ce versement). Rien n''a été enregistré.', amt - (res->>'total')::numeric USING ERRCODE='P0409';
  END IF;
  INSERT INTO public.fin_payments(company_id, payee_key, payee_name, amount, paid_on, method, source_label, reference, note, status, draft_alloc, validated_at, idem_key, created_by, is_support, account_id)
  VALUES (_company, payee, pname, amt, d, m, src, nullif(btrim(_p->>'reference'),''), nullif(btrim(_p->>'note'),''),
          CASE WHEN dr THEN 'draft' ELSE 'validated' END, CASE WHEN dr THEN allocs END, CASE WHEN dr THEN NULL ELSE now() END, idem, auth.uid(), public.has_role(auth.uid(),'admin'), acc)
  ON CONFLICT (company_id, idem_key) DO NOTHING RETURNING id INTO pid;
  IF pid IS NULL THEN SELECT id INTO pid FROM public.fin_payments WHERE company_id=_company AND idem_key=idem; RETURN jsonb_build_object('payment_id', pid, 'replayed', true); END IF;
  PERFORM public.fin_log_pay(_company, pid, NULL, NULL, CASE WHEN dr THEN 'payment_draft' ELSE 'payment' END, NULL, jsonb_build_object('amount',amt,'paid_on',d,'method',m,'account_id',acc));
  IF NOT dr THEN res := public.fin__alloc(_company, payee, allocs, amt, false, pid); END IF;
  IF amt - (res->>'total')::numeric > 0 THEN PERFORM public.fin_log_pay(_company, pid, NULL, NULL, 'overpayment', 'Excédent confirmé', jsonb_build_object('excess', amt - (res->>'total')::numeric)); END IF;
  RETURN res || jsonb_build_object('payment_id', pid, 'payee', pname, 'amount', amt, 'remainder', amt - (res->>'total')::numeric, 'duplicates', dups, 'draft', dr);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_bank_match(_line uuid, _items jsonb, _idem text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE l public.fin_bank_lines; prev public.fin_bank_matches; it jsonb; m record; s numeric := 0; mid uuid; n int := 0; kinds text[] := '{}'; wdir text;
BEGIN
  SELECT * INTO l FROM public.fin_bank_lines WHERE id = _line;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction introuvable' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_bank_guard(l.company_id, true);
  IF coalesce(length(_idem),0) < 8 THEN RAISE EXCEPTION 'Clé de demande manquante' USING ERRCODE = '22023'; END IF;
  SELECT * INTO prev FROM public.fin_bank_matches WHERE company_id = l.company_id AND idem_key = _idem;
  IF FOUND THEN
    IF prev.line_id <> _line THEN RAISE EXCEPTION 'Clé de demande déjà utilisée pour une autre transaction' USING ERRCODE = 'P0409'; END IF;
    RETURN jsonb_build_object('match_id', prev.id, 'replay', true, 'status', prev.status);
  END IF;
  SELECT * INTO l FROM public.fin_bank_lines WHERE id = _line FOR UPDATE;
  SELECT * INTO prev FROM public.fin_bank_matches WHERE company_id = l.company_id AND idem_key = _idem;
  IF FOUND THEN RETURN jsonb_build_object('match_id', prev.id, 'replay', true, 'status', prev.status); END IF;
  IF l.status = 'rapproche' OR EXISTS (SELECT 1 FROM public.fin_bank_matches x WHERE x.line_id = _line AND x.status = 'active') THEN
    RAISE EXCEPTION 'Cette transaction est déjà rapprochée' USING ERRCODE = 'P0409'; END IF;
  IF l.status = 'exclu' THEN RAISE EXCEPTION 'Transaction exclue : remettez-la « À rapprocher » avant de la rapprocher' USING ERRCODE = 'P0409'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN RAISE EXCEPTION 'Choisissez de 1 à 50 mouvements' USING ERRCODE = '22023'; END IF;
  wdir := CASE WHEN l.amount > 0 THEN 'in' ELSE 'out' END;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) ORDER BY value->>'kind', value->>'id' LOOP
    IF (it->>'kind') || ':' || (it->>'id') = ANY(kinds) THEN RAISE EXCEPTION 'Mouvement choisi deux fois' USING ERRCODE = '22023'; END IF;
    kinds := kinds || ((it->>'kind') || ':' || (it->>'id'));
    PERFORM pg_advisory_xact_lock(hashtext('fin_bank_src:' || (it->>'kind') || ':' || (it->>'id')));
    SELECT * INTO m FROM public.fin_bank_movements(l.company_id) mv WHERE mv.kind = it->>'kind' AND mv.id = (it->>'id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mouvement introuvable, annulé ou hors de cette entreprise' USING ERRCODE = '42501'; END IF;
    IF m.dir <> wdir THEN RAISE EXCEPTION 'Sens incompatible entre le relevé et le mouvement' USING ERRCODE = '22023'; END IF;
    IF m.kind = 'payment' AND m.account_id IS NULL THEN RAISE EXCEPTION 'Compte non précisé sur ce paiement : utilisez « Préciser le compte » avant de confirmer le rapprochement' USING ERRCODE = '22023'; END IF;
    IF m.account_id IS NOT NULL AND m.account_id <> l.account_id THEN RAISE EXCEPTION 'Le mouvement est enregistré sur un autre compte financier' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = m.kind AND i.source_id = m.id) THEN
      RAISE EXCEPTION 'Ce mouvement est déjà rapproché à une autre transaction du relevé' USING ERRCODE = 'P0409'; END IF;
    s := s + m.amount; n := n + 1;
  END LOOP;
  IF s <> abs(l.amount) THEN
    RAISE EXCEPTION 'Écart de % $ : la somme des mouvements (% $) ne correspond pas exactement à la transaction (% $). Aucun écart n''est absorbé : laissez-la « À examiner ».',
      to_char(abs(l.amount) - s, 'FM999999990.00'), to_char(s, 'FM999999990.00'), to_char(abs(l.amount), 'FM999999990.00') USING ERRCODE = 'P0410';
  END IF;
  INSERT INTO public.fin_bank_matches(company_id, line_id, idem_key, total) VALUES (l.company_id, _line, _idem, s) RETURNING id INTO mid;
  INSERT INTO public.fin_bank_match_items(company_id, match_id, line_id, source_kind, source_id, amount)
    SELECT l.company_id, mid, _line, mv.kind, mv.id, mv.amount FROM public.fin_bank_movements(l.company_id) mv
     WHERE (mv.kind || ':' || mv.id::text) = ANY(kinds);
  UPDATE public.fin_bank_lines SET status = 'rapproche', status_reason = NULL, rev = rev + 1, updated_at = now() WHERE id = _line;
  INSERT INTO public.fin_bank_events(company_id, line_id, match_id, kind, detail) VALUES (l.company_id, _line, mid, 'match', jsonb_build_object('items', _items, 'total', s));
  RETURN jsonb_build_object('match_id', mid, 'replay', false, 'count', n, 'total', s);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Rapprochement concurrent détecté : la transaction ou un mouvement vient d''être rapproché ailleurs' USING ERRCODE = 'P0409';
END $function$;

CREATE OR REPLACE FUNCTION public.fin_bank_overview(_company uuid, _account uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE regs jsonb; blockers jsonb; lines jsonb; tot jsonb; imps jsonb; internal jsonb; pf date; pt date; full_ok boolean;
BEGIN
  PERFORM public.fin_bank_guard(_company, false); PERFORM public.fin_bank_account_ok(_company, _account);
  SELECT min(txn_date), max(txn_date) INTO pf, pt FROM public.fin_bank_lines WHERE account_id = _account;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'date', l.txn_date, 'amount', l.amount, 'description', l.description, 'reference', l.reference,
      'bank_id', l.bank_txn_id, 'status', l.status, 'reason', l.status_reason, 'rev', l.rev, 'distinct', l.added_as_distinct, 'import_id', l.import_id, 'row_no', l.row_no, 'raw', l.raw,
      'suggest', l.status = 'a_rapprocher' AND EXISTS (SELECT 1 FROM public.fin_bank_movements(_company) m WHERE m.dir = (CASE WHEN l.amount > 0 THEN 'in' ELSE 'out' END)
          AND (m.account_id IS NULL OR m.account_id = l.account_id) AND m.amount = abs(l.amount) AND abs(m.on_date - l.txn_date) <= 10
          AND NOT EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = m.kind AND i.source_id = m.id)),
      'twins', (SELECT count(*) FROM public.fin_bank_lines t WHERE t.account_id = l.account_id AND t.fp = l.fp),
      'match', (SELECT jsonb_build_object('id', mt.id, 'at', mt.created_at, 'items', (SELECT jsonb_agg(jsonb_build_object('kind', i.source_kind, 'id', i.source_id, 'amount', i.amount,
                 'unspecified', i.source_kind = 'payment' AND NOT EXISTS (SELECT 1 FROM public.fin_payments p WHERE p.id = i.source_id AND p.account_id = l.account_id),
                 'label', (SELECT m.label || coalesce(' — ' || m.party, '') FROM public.fin_bank_movements(_company) m WHERE m.kind = i.source_kind AND m.id = i.source_id),
                 'date', (SELECT m.on_date FROM public.fin_bank_movements(_company) m WHERE m.kind = i.source_kind AND m.id = i.source_id)))
                 FROM public.fin_bank_match_items i WHERE i.match_id = mt.id))
                FROM public.fin_bank_matches mt WHERE mt.line_id = l.id AND mt.status = 'active'),
      'history', (SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at, 'detail', e.detail) ORDER BY e.at) FROM public.fin_bank_events e WHERE e.line_id = l.id)
    ) ORDER BY l.txn_date DESC, l.row_no), '[]'::jsonb) INTO lines
  FROM public.fin_bank_lines l WHERE l.account_id = _account;
  SELECT jsonb_build_object(
    'count', count(*), 'in', coalesce(sum(amount) FILTER (WHERE amount > 0),0), 'out', coalesce(-sum(amount) FILTER (WHERE amount < 0),0),
    'matched_in', coalesce(sum(amount) FILTER (WHERE amount > 0 AND status = 'rapproche'),0), 'matched_out', coalesce(-sum(amount) FILTER (WHERE amount < 0 AND status = 'rapproche'),0),
    'matched_count', count(*) FILTER (WHERE status = 'rapproche'),
    'open_in', coalesce(sum(amount) FILTER (WHERE amount > 0 AND status IN ('a_rapprocher','a_examiner')),0), 'open_out', coalesce(-sum(amount) FILTER (WHERE amount < 0 AND status IN ('a_rapprocher','a_examiner')),0),
    'open_count', count(*) FILTER (WHERE status IN ('a_rapprocher','a_examiner')), 'review_count', count(*) FILTER (WHERE status = 'a_examiner'),
    'excluded_count', count(*) FILTER (WHERE status = 'exclu'), 'excluded_net', coalesce(sum(amount) FILTER (WHERE status = 'exclu'),0)) INTO tot
  FROM public.fin_bank_lines WHERE account_id = _account;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'file_name', i.file_name, 'file_id', i.file_id, 'at', i.created_at, 'by', i.created_by, 'period_from', i.period_from, 'period_to', i.period_to,
     'complete', i.complete, 'has_original', i.source_file_id IS NOT NULL, 'balance', i.summary->'balance', 'summary', i.summary - 'rows') ORDER BY i.created_at DESC), '[]'::jsonb) INTO imps
  FROM public.fin_bank_imports i WHERE i.account_id = _account;
  SELECT jsonb_build_object('count', count(*), 'in', coalesce(sum(m.amount) FILTER (WHERE m.dir = 'in'),0), 'out', coalesce(sum(m.amount) FILTER (WHERE m.dir = 'out'),0),
      'rows', coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'id', m.id, 'dir', m.dir, 'amount', m.amount, 'date', m.on_date, 'label', m.label, 'party', m.party, 'reference', m.reference, 'account_id', m.account_id) ORDER BY m.on_date), '[]'::jsonb)) INTO internal
  FROM public.fin_bank_movements(_company) m
  WHERE pf IS NOT NULL AND m.on_date BETWEEN pf AND pt AND (m.account_id IS NULL OR m.account_id = _account)
    AND NOT EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = m.kind AND i.source_id = m.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('match_id', i.match_id, 'line_id', i.line_id, 'payment_id', p.id, 'amount', p.amount, 'paid_on', p.paid_on, 'payee', p.payee_name,
      'line_date', l.txn_date, 'line_desc', l.description, 'payment_account_id', p.account_id)), '[]'::jsonb) INTO regs
    FROM public.fin_bank_match_items i JOIN public.fin_bank_lines l ON l.id = i.line_id JOIN public.fin_payments p ON p.id = i.source_id
   WHERE i.active AND i.source_kind = 'payment' AND l.account_id = _account AND p.account_id IS DISTINCT FROM _account;
  blockers := to_jsonb(array_remove(ARRAY[
    CASE WHEN (tot->>'count')::int = 0 THEN 'Aucune transaction importée' END,
    CASE WHEN (tot->>'open_count')::int > 0 THEN format('%s transaction(s) à rapprocher ou à examiner', tot->>'open_count') END,
    CASE WHEN jsonb_array_length(regs) > 0 THEN format('%s rapprochement(s) avec un paiement au compte non précisé ou différent', jsonb_array_length(regs)) END,
    CASE WHEN EXISTS (SELECT 1 FROM public.fin_bank_imports i WHERE i.account_id = _account AND NOT (i.complete AND coalesce((i.summary->'balance'->>'ok')::boolean, false)))
      THEN 'Relevé incomplet ou soldes d''ouverture/clôture absents ou non concordants' END
  ], NULL));
  full_ok := jsonb_array_length(blockers) = 0;
  RETURN jsonb_build_object('lines', lines, 'totals', tot, 'imports', imps, 'internal', internal, 'fully_reconciled', full_ok, 'blockers', blockers, 'regularize', regs, 'period_from', pf, 'period_to', pt);
END $function$;