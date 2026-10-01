-- FIN-11 (socle) : prestataire de paiement par entreprise — SIMULATION SEULEMENT, aucune connexion réelle.
CREATE TABLE public.fin_psp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform','company')),
  company_id uuid REFERENCES public.jsc_companies(id),
  provider text NOT NULL DEFAULT 'simulateur' CHECK (provider = 'simulateur'),
  mode text NOT NULL DEFAULT 'simulation' CHECK (mode = 'simulation'),
  status text NOT NULL DEFAULT 'non_connecte' CHECK (status = 'non_connecte'),
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency = 'CAD'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'platform') = (company_id IS NULL))
);
CREATE UNIQUE INDEX fin_psp_accounts_company_uq ON public.fin_psp_accounts(company_id, provider) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX fin_psp_accounts_platform_uq ON public.fin_psp_accounts(provider) WHERE scope = 'platform';
COMMENT ON TABLE public.fin_psp_accounts IS 'FIN-11 : compte marchand par entreprise (scope company) distinct du compte plateforme (scope platform). Mode simulation imposé par contrainte : aucune exécution réelle.';

CREATE TABLE public.fin_psp_sim_companies (company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id), added_at timestamptz NOT NULL DEFAULT now());
COMMENT ON TABLE public.fin_psp_sim_companies IS 'FIN-11 : entreprises TEST autorisées au simulateur (aucun accès client).';

CREATE TABLE public.fin_psp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  account_id uuid NOT NULL REFERENCES public.fin_psp_accounts(id),
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id),
  payment_ref text NOT NULL,
  currency text NOT NULL DEFAULT 'CAD',
  gross numeric(14,2) NOT NULL CHECK (gross > 0),
  fee numeric(14,2) CHECK (fee >= 0),
  net numeric(14,2) GENERATED ALWAYS AS (gross - fee) STORED,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','canceled')),
  receipt_id uuid UNIQUE REFERENCES public.fin_invoice_receipts(id),
  refunded numeric(14,2) NOT NULL DEFAULT 0,
  returned numeric(14,2) NOT NULL DEFAULT 0,
  disputed numeric(14,2) NOT NULL DEFAULT 0,
  paid_out numeric(14,2) NOT NULL DEFAULT 0,
  review text[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, payment_ref),
  CHECK (refunded + returned <= gross)
);
CREATE TABLE public.fin_psp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  account_id uuid NOT NULL REFERENCES public.fin_psp_accounts(id),
  transaction_id uuid REFERENCES public.fin_psp_transactions(id),
  event_id text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('applied','no_effect','stale','review')),
  note text,
  created_by uuid,
  UNIQUE (account_id, event_id)
);
CREATE TABLE public.fin_psp_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  transaction_id uuid NOT NULL REFERENCES public.fin_psp_transactions(id),
  event_row_id uuid NOT NULL REFERENCES public.fin_psp_events(id),
  kind text NOT NULL CHECK (kind IN ('refund','return','dispute_opened','dispute_won','dispute_lost','payout')),
  ref text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, kind, ref)
);

GRANT SELECT ON public.fin_psp_accounts, public.fin_psp_transactions, public.fin_psp_events, public.fin_psp_adjustments TO authenticated;
GRANT ALL ON public.fin_psp_accounts, public.fin_psp_sim_companies, public.fin_psp_transactions, public.fin_psp_events, public.fin_psp_adjustments TO service_role;
ALTER TABLE public.fin_psp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_psp_sim_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_psp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_psp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_psp_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psp acc read" ON public.fin_psp_accounts FOR SELECT TO authenticated USING (company_id IS NOT NULL AND public.fin_can_read(company_id));
CREATE POLICY "psp tx read" ON public.fin_psp_transactions FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "psp ev read" ON public.fin_psp_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "psp adj read" ON public.fin_psp_adjustments FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_psp_ingest(_account uuid, _ev jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a fin_psp_accounts; t fin_psp_transactions; i fin_invoices; e fin_psp_events; ev_id text := nullif(trim(_ev->>'event_id'),'');
  typ text := _ev->>'type'; pref text := nullif(trim(_ev->>'payment_ref'),''); aref text := nullif(trim(_ev->>'adjustment_ref'),'');
  amt numeric; v_fee numeric; cur text := coalesce(_ev->>'currency',''); occ timestamptz; h text; outc text := 'applied'; note text; r jsonb; avail numeric; v uuid; adj_kind text;
BEGIN
  SELECT * INTO a FROM fin_psp_accounts WHERE id = _account;
  IF a.id IS NULL OR a.scope <> 'company' OR a.mode <> 'simulation' THEN RAISE EXCEPTION 'Compte marchand invalide'; END IF;
  IF ev_id IS NULL OR pref IS NULL THEN RAISE EXCEPTION 'Identifiant d''événement et référence de paiement requis'; END IF;
  IF typ IS NULL OR typ NOT IN ('payment.pending','payment.succeeded','payment.failed','payment.canceled','fee.known','refund.succeeded','payment.returned','dispute.opened','dispute.closed','payout.paid') THEN RAISE EXCEPTION 'Type d''événement inconnu'; END IF;
  BEGIN amt := round((_ev->>'amount')::numeric, 2); v_fee := round((_ev->>'fee')::numeric, 2); occ := (_ev->>'occurred_at')::timestamptz;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'Valeur numérique ou date invalide'; END;
  IF occ IS NULL THEN RAISE EXCEPTION 'Date de l''événement requise'; END IF;
  h := md5(_ev::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('fin_psp:' || _account || ':' || pref, 0));
  SELECT * INTO e FROM fin_psp_events WHERE account_id = _account AND event_id = ev_id;
  IF e.id IS NOT NULL THEN
    IF e.payload_hash = h THEN RETURN jsonb_build_object('event', e.id, 'outcome', e.outcome, 'duplicate', true, 'note', e.note); END IF;
    RAISE EXCEPTION 'Même identifiant d''événement avec un contenu différent : à examiner' USING ERRCODE = 'P0409';
  END IF;
  SELECT * INTO t FROM fin_psp_transactions WHERE account_id = _account AND payment_ref = pref FOR UPDATE;

  IF typ LIKE 'payment.%' AND typ <> 'payment.returned' THEN
    IF t.id IS NULL THEN
      BEGIN SELECT * INTO i FROM fin_invoices WHERE id = nullif(_ev->>'invoice_id','')::uuid FOR UPDATE; EXCEPTION WHEN invalid_text_representation THEN i := NULL; END;
      IF i.id IS NULL OR i.company_id <> a.company_id THEN outc := 'review'; note := 'Facture absente ou d''une autre entreprise : aucun effet';
      ELSIF NOT coalesce(i.is_test,false) THEN outc := 'review'; note := 'Simulation réservée aux factures TEST : aucun effet';
      ELSIF i.status <> 'emise' THEN outc := 'review'; note := 'Facture non émise : aucun effet';
      ELSIF cur <> 'CAD' THEN outc := 'review'; note := 'Devise incorrecte (CAD attendu) : aucun effet';
      ELSIF amt IS NULL OR amt <= 0 THEN outc := 'review'; note := 'Montant invalide : aucun effet';
      ELSE
        INSERT INTO fin_psp_transactions(company_id, account_id, invoice_id, payment_ref, currency, gross, occurred_at)
        VALUES (a.company_id, _account, i.id, pref, 'CAD', amt, occ) RETURNING * INTO t;
      END IF;
    ELSE
      SELECT * INTO i FROM fin_invoices WHERE id = t.invoice_id FOR UPDATE;
      IF nullif(_ev->>'invoice_id','') IS NOT NULL AND (_ev->>'invoice_id') <> t.invoice_id::text THEN outc := 'review'; note := 'Facture différente de la transaction : aucun effet';
      ELSIF cur <> t.currency THEN outc := 'review'; note := 'Devise différente de la transaction : aucun effet';
      ELSIF amt IS DISTINCT FROM t.gross THEN outc := 'review'; note := 'Montant différent de la transaction : aucun effet';
      END IF;
    END IF;
    IF outc = 'applied' THEN
      IF typ = 'payment.pending' THEN
        IF t.status <> 'pending' THEN outc := 'stale'; note := 'Événement « en cours » reçu après un état final : ignoré'; END IF;
      ELSIF typ = 'payment.succeeded' THEN
        IF t.status = 'succeeded' THEN outc := 'no_effect'; note := 'Paiement déjà confirmé : aucun deuxième règlement';
        ELSIF t.status IN ('failed','canceled') THEN outc := 'review'; note := 'Confirmation reçue après échec/annulation : à examiner, aucun règlement';
        ELSE
          r := fin_invoice_balance(t.invoice_id);
          IF t.gross > (r->>'rest')::numeric THEN outc := 'review'; note := 'Montant supérieur au solde de la facture : à examiner, aucun règlement';
          ELSE
            r := fin_invoice_receipt_add(t.invoice_id, t.gross, (occ AT TIME ZONE 'America/Toronto')::date, 'prestataire_simulation', NULL, 'PSP-SIM ' || pref, 'fin_psp:' || t.id);
            UPDATE fin_psp_transactions SET status = 'succeeded', receipt_id = (r->>'id')::uuid,
              fee = CASE WHEN v_fee IS NOT NULL AND v_fee <= t.gross THEN v_fee ELSE fin_psp_transactions.fee END, updated_at = now() WHERE id = t.id;
            IF v_fee IS NOT NULL AND v_fee > t.gross THEN note := 'Frais supérieurs au brut ignorés'; END IF;
          END IF;
        END IF;
      ELSE
        IF t.status = 'pending' THEN UPDATE fin_psp_transactions SET status = CASE typ WHEN 'payment.failed' THEN 'failed' ELSE 'canceled' END, updated_at = now() WHERE id = t.id;
        ELSIF t.status = 'succeeded' THEN outc := 'review'; note := 'Échec/annulation reçu après confirmation : à examiner, règlement conservé';
        ELSE outc := 'no_effect'; note := 'État final déjà enregistré'; END IF;
      END IF;
    END IF;
  ELSE
    IF t.id IS NULL THEN outc := 'review'; note := 'Transaction inconnue : aucun effet';
    ELSIF typ = 'fee.known' THEN
      IF v_fee IS NULL OR v_fee > t.gross THEN outc := 'review'; note := 'Frais invalides : aucun effet';
      ELSIF t.fee IS NOT NULL AND t.fee <> v_fee THEN outc := 'review'; note := 'Frais différents des frais déjà connus : à examiner';
      ELSIF t.fee = v_fee THEN outc := 'no_effect'; note := 'Frais déjà connus';
      ELSE UPDATE fin_psp_transactions SET fee = v_fee, updated_at = now() WHERE id = t.id; END IF;
    ELSIF t.status <> 'succeeded' THEN outc := 'review'; note := 'Ajustement sur un paiement non confirmé : aucun effet';
    ELSIF aref IS NULL OR amt IS NULL OR amt <= 0 THEN outc := 'review'; note := 'Référence ou montant d''ajustement invalide : aucun effet';
    ELSIF cur <> t.currency THEN outc := 'review'; note := 'Devise incorrecte : aucun effet';
    ELSE
      adj_kind := CASE typ WHEN 'refund.succeeded' THEN 'refund' WHEN 'payment.returned' THEN 'return' WHEN 'dispute.opened' THEN 'dispute_opened' WHEN 'payout.paid' THEN 'payout'
        ELSE CASE _ev->>'result' WHEN 'won' THEN 'dispute_won' WHEN 'lost' THEN 'dispute_lost' END END;
      avail := t.gross - t.refunded - t.returned;
      IF adj_kind IS NULL THEN outc := 'review'; note := 'Issue de litige inconnue : aucun effet';
      ELSIF EXISTS (SELECT 1 FROM fin_psp_adjustments x WHERE x.transaction_id = t.id AND x.kind = adj_kind AND x.ref = aref) THEN
        IF EXISTS (SELECT 1 FROM fin_psp_adjustments x WHERE x.transaction_id = t.id AND x.kind = adj_kind AND x.ref = aref AND x.amount = amt) THEN outc := 'no_effect'; note := 'Ajustement déjà enregistré : aucun doublon';
        ELSE outc := 'review'; note := 'Même référence d''ajustement, montant différent : à examiner'; END IF;
        adj_kind := NULL;
      ELSIF adj_kind = 'refund' AND amt > avail THEN outc := 'review'; note := 'Remboursement supérieur au montant disponible : refusé';
      ELSIF adj_kind = 'return' AND (amt <> t.gross OR t.refunded > 0 OR t.returned > 0) THEN outc := 'review'; note := 'Retour partiel ou après remboursement : à examiner, aucun effet';
      ELSIF adj_kind = 'dispute_opened' AND (amt > avail OR t.disputed > 0) THEN outc := 'review'; note := 'Litige incohérent : à examiner';
      ELSIF adj_kind IN ('dispute_won','dispute_lost') AND t.disputed = 0 THEN outc := 'review'; note := 'Clôture d''un litige non ouvert : à examiner';
      ELSIF adj_kind = 'payout' AND (t.fee IS NULL OR amt > t.net - t.paid_out) THEN outc := 'review'; note := 'Versement sans frais connus ou supérieur au net : à examiner';
      END IF;
      IF outc = 'applied' THEN
        IF adj_kind = 'refund' THEN
          UPDATE fin_psp_transactions SET refunded = refunded + amt, review = array_append(review, 'Remboursement ' || aref || ' : argent rendu, solde de facture inchangé — décider avoir ou autre traitement'), updated_at = now() WHERE id = t.id;
          note := 'Remboursement enregistré; aucun avoir ni créance créé : à examiner';
        ELSIF adj_kind = 'return' THEN
          PERFORM fin_invoice_receipt_void(t.receipt_id, 'Paiement retourné par le prestataire (simulation) ' || aref);
          UPDATE fin_psp_transactions SET returned = amt, updated_at = now() WHERE id = t.id;
          note := 'Paiement retourné : règlement annulé par le moteur existant, solde rétabli';
        ELSIF adj_kind = 'dispute_opened' THEN
          UPDATE fin_psp_transactions SET disputed = amt, review = array_append(review, 'Litige ' || aref || ' ouvert : solde inchangé'), updated_at = now() WHERE id = t.id;
          note := 'Litige ouvert : aucune modification automatique du solde';
        ELSIF adj_kind = 'dispute_won' THEN
          UPDATE fin_psp_transactions SET disputed = 0, updated_at = now() WHERE id = t.id; note := 'Litige gagné';
        ELSIF adj_kind = 'dispute_lost' THEN
          UPDATE fin_psp_transactions SET review = array_append(review, 'Litige ' || aref || ' perdu : décision manuelle requise'), updated_at = now() WHERE id = t.id;
          note := 'Litige perdu : à examiner, solde inchangé';
        ELSE
          UPDATE fin_psp_transactions SET paid_out = paid_out + amt, updated_at = now() WHERE id = t.id;
          note := 'Versement du net : aucune vente ni règlement supplémentaire';
        END IF;
      ELSE
        adj_kind := NULL;
      END IF;
    END IF;
  END IF;

  INSERT INTO fin_psp_events(company_id, account_id, transaction_id, event_id, type, payload, payload_hash, occurred_at, outcome, note, created_by)
  VALUES (a.company_id, _account, t.id, ev_id, typ, _ev, h, occ, outc, note, auth.uid()) RETURNING id INTO v;
  IF outc = 'applied' AND adj_kind IS NOT NULL THEN
    INSERT INTO fin_psp_adjustments(company_id, transaction_id, event_row_id, kind, ref, amount) VALUES (a.company_id, t.id, v, adj_kind, aref, amt);
  END IF;
  IF outc = 'review' AND t.id IS NOT NULL THEN UPDATE fin_psp_transactions SET review = array_append(review, note), updated_at = now() WHERE id = t.id; END IF;
  RETURN jsonb_build_object('event', v, 'outcome', outc, 'duplicate', false, 'note', note, 'transaction', t.id);
END $$;
REVOKE ALL ON FUNCTION public.fin_psp_ingest(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_psp_sim_event(_company uuid, _ev jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fin_psp_sim_companies WHERE company_id = _company) THEN RAISE EXCEPTION 'Simulation réservée aux entreprises TEST' USING ERRCODE = '42501'; END IF;
  SELECT id INTO acc FROM fin_psp_accounts WHERE company_id = _company AND provider = 'simulateur';
  IF acc IS NULL THEN
    INSERT INTO fin_psp_accounts(scope, company_id) VALUES ('company', _company) ON CONFLICT DO NOTHING;
    SELECT id INTO acc FROM fin_psp_accounts WHERE company_id = _company AND provider = 'simulateur';
  END IF;
  RETURN public.fin_psp_ingest(acc, _ev);
END $$;
REVOKE ALL ON FUNCTION public.fin_psp_sim_event(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_psp_sim_event(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_psp_overview(_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('connected', false, 'mode', 'simulation', 'real_enabled', false,
    'sim_allowed', EXISTS (SELECT 1 FROM fin_psp_sim_companies WHERE company_id = _company) AND public.fin_can_write(_company),
    'transactions', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'payment_ref', t.payment_ref, 'invoice_id', t.invoice_id, 'invoice_number', i.number,
        'currency', t.currency, 'gross', t.gross, 'fee', t.fee, 'net', t.net, 'status', t.status, 'receipt_id', t.receipt_id,
        'receipt_voided', (SELECT r.voided_at IS NOT NULL FROM fin_invoice_receipts r WHERE r.id = t.receipt_id),
        'refunded', t.refunded, 'returned', t.returned, 'disputed', t.disputed, 'paid_out', t.paid_out, 'review', to_jsonb(t.review), 'occurred_at', t.occurred_at,
        'events', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'event_id', e.event_id, 'type', e.type, 'outcome', e.outcome, 'note', e.note, 'occurred_at', e.occurred_at, 'received_at', e.received_at, 'amount', e.payload->>'amount', 'fee', e.payload->>'fee') ORDER BY e.received_at) FROM fin_psp_events e WHERE e.transaction_id = t.id), '[]'::jsonb))
      ORDER BY t.created_at DESC) FROM fin_psp_transactions t JOIN fin_invoices i ON i.id = t.invoice_id WHERE t.company_id = _company), '[]'::jsonb),
    'orphans', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'event_id', e.event_id, 'type', e.type, 'outcome', e.outcome, 'note', e.note, 'received_at', e.received_at) ORDER BY e.received_at DESC)
      FROM fin_psp_events e WHERE e.company_id = _company AND e.transaction_id IS NULL), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.fin_psp_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_psp_overview(uuid) TO authenticated;