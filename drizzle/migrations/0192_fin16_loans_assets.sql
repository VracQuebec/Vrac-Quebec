CREATE TABLE public.fin_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  acquired_on date NOT NULL,
  cost numeric(14,2) NOT NULL CHECK (cost > 0),
  salvage numeric(14,2) NOT NULL DEFAULT 0 CHECK (salvage >= 0),
  life_months int NOT NULL CHECK (life_months BETWEEN 1 AND 600),
  asset_gl uuid REFERENCES public.fin_gl_accounts(id),
  accum_gl uuid REFERENCES public.fin_gl_accounts(id),
  expense_gl uuid REFERENCES public.fin_gl_accounts(id),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (salvage < cost)
);
GRANT SELECT ON public.fin_assets TO authenticated;
GRANT ALL ON public.fin_assets TO service_role;
ALTER TABLE public.fin_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_assets_read ON public.fin_assets FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_asset_depr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.fin_assets(id),
  period text NOT NULL,
  amount numeric(14,2) NOT NULL,
  gl_entry_id uuid REFERENCES public.fin_gl_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period)
);
GRANT SELECT ON public.fin_asset_depr TO authenticated;
GRANT ALL ON public.fin_asset_depr TO service_role;
ALTER TABLE public.fin_asset_depr ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_asset_depr_read ON public.fin_asset_depr FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  lender text,
  principal numeric(14,2) NOT NULL CHECK (principal > 0),
  annual_rate numeric(8,5) CHECK (annual_rate >= 0 AND annual_rate < 100),
  start_on date NOT NULL,
  term_months int NOT NULL CHECK (term_months BETWEEN 1 AND 600),
  loan_gl uuid REFERENCES public.fin_gl_accounts(id),
  interest_gl uuid REFERENCES public.fin_gl_accounts(id),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
GRANT SELECT ON public.fin_loans TO authenticated;
GRANT ALL ON public.fin_loans TO service_role;
ALTER TABLE public.fin_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_loans_read ON public.fin_loans FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.fin_loans(id),
  paid_on date NOT NULL,
  principal numeric(14,2) NOT NULL CHECK (principal >= 0),
  interest numeric(14,2) NOT NULL CHECK (interest >= 0),
  fin_account_id uuid NOT NULL REFERENCES public.fin_accounts(id),
  reference text,
  idem_key text NOT NULL,
  gl_entry_id uuid REFERENCES public.fin_gl_entries(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idem_key),
  CHECK (principal + interest > 0)
);
GRANT SELECT ON public.fin_loan_payments TO authenticated;
GRANT ALL ON public.fin_loan_payments TO service_role;
ALTER TABLE public.fin_loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_loan_payments_read ON public.fin_loan_payments FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_gl_owned(_company uuid, _gl uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _gl IS NULL OR EXISTS (SELECT 1 FROM fin_gl_accounts WHERE id = _gl AND company_id = _company) $$;

CREATE OR REPLACE FUNCTION public.fin_asset_save(_company uuid, _id uuid, _d jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid; posted int;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT (public.fin_gl_owned(_company, (_d->>'asset_gl')::uuid) AND public.fin_gl_owned(_company, (_d->>'accum_gl')::uuid) AND public.fin_gl_owned(_company, (_d->>'expense_gl')::uuid)) THEN RAISE EXCEPTION 'Compte comptable invalide' USING ERRCODE = '42501'; END IF;
  IF _id IS NULL THEN
    INSERT INTO fin_assets(company_id, name, acquired_on, cost, salvage, life_months, asset_gl, accum_gl, expense_gl, note)
    VALUES (_company, btrim(_d->>'name'), (_d->>'acquired_on')::date, (_d->>'cost')::numeric, coalesce((_d->>'salvage')::numeric, 0), (_d->>'life_months')::int, (_d->>'asset_gl')::uuid, (_d->>'accum_gl')::uuid, (_d->>'expense_gl')::uuid, _d->>'note') RETURNING id INTO nid;
    RETURN nid;
  END IF;
  SELECT count(*) INTO posted FROM fin_asset_depr WHERE asset_id = _id;
  IF posted > 0 THEN
    UPDATE fin_assets SET name = btrim(_d->>'name'), note = _d->>'note', accum_gl = coalesce(accum_gl, (_d->>'accum_gl')::uuid), expense_gl = coalesce(expense_gl, (_d->>'expense_gl')::uuid), asset_gl = coalesce(asset_gl, (_d->>'asset_gl')::uuid) WHERE id = _id AND company_id = _company;
  ELSE
    UPDATE fin_assets SET name = btrim(_d->>'name'), acquired_on = (_d->>'acquired_on')::date, cost = (_d->>'cost')::numeric, salvage = coalesce((_d->>'salvage')::numeric, 0), life_months = (_d->>'life_months')::int, asset_gl = (_d->>'asset_gl')::uuid, accum_gl = (_d->>'accum_gl')::uuid, expense_gl = (_d->>'expense_gl')::uuid, note = _d->>'note' WHERE id = _id AND company_id = _company;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Immobilisation introuvable' USING ERRCODE = '42501'; END IF;
  RETURN _id;
END $$;

-- Amortissement linéaire mensuel : (coût − valeur résiduelle) / durée, dernier mois = résidu exact.
CREATE OR REPLACE FUNCTION public.fin_asset_depr_post(_asset uuid, _period text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a fin_assets; m int; base numeric; per numeric; done numeric; amt numeric; d date; idx int; nid uuid; x fin_asset_depr; n int;
BEGIN
  SELECT * INTO a FROM fin_assets WHERE id = _asset;
  IF NOT FOUND OR NOT public.fin_can_write(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _period !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Période AAAA-MM requise' USING ERRCODE = '22023'; END IF;
  PERFORM public.fin_gl_lock(a.company_id);
  SELECT * INTO x FROM fin_asset_depr WHERE asset_id = _asset AND period = _period;
  IF FOUND THEN SELECT entry_no INTO n FROM fin_gl_entries WHERE id = x.gl_entry_id; RETURN jsonb_build_object('entry_no', n, 'amount', x.amount, 'replay', true); END IF;
  IF a.accum_gl IS NULL OR a.expense_gl IS NULL THEN RAISE EXCEPTION 'À compléter : comptes d''amortissement et de dépense requis' USING ERRCODE = 'P0410'; END IF;
  d := (_period || '-01')::date;
  idx := (extract(year FROM d) * 12 + extract(month FROM d))::int - (extract(year FROM a.acquired_on) * 12 + extract(month FROM a.acquired_on))::int + 1;
  IF idx < 1 OR idx > a.life_months THEN RAISE EXCEPTION 'Période hors de la durée d''amortissement' USING ERRCODE = 'P0410'; END IF;
  IF EXISTS (SELECT 1 FROM fin_asset_depr WHERE asset_id = _asset AND period < _period) IS FALSE AND idx > 1 THEN RAISE EXCEPTION 'Comptabilisez d''abord les mois précédents' USING ERRCODE = 'P0410'; END IF;
  IF (SELECT count(*) FROM fin_asset_depr WHERE asset_id = _asset) <> idx - 1 THEN RAISE EXCEPTION 'Comptabilisez les mois dans l''ordre, sans trou' USING ERRCODE = 'P0410'; END IF;
  base := a.cost - a.salvage; per := round(base / a.life_months, 2);
  SELECT coalesce(sum(amount), 0) INTO done FROM fin_asset_depr WHERE asset_id = _asset;
  amt := CASE WHEN idx = a.life_months THEN base - done ELSE least(per, base - done) END;
  IF amt <= 0 THEN RAISE EXCEPTION 'Immobilisation entièrement amortie' USING ERRCODE = 'P0410'; END IF;
  INSERT INTO fin_asset_depr(company_id, asset_id, period, amount) VALUES (a.company_id, _asset, _period, amt) RETURNING * INTO x;
  INSERT INTO fin_gl_entries(company_id, entry_no, entry_date, reference, description, origin, source_kind, source_id, source_purpose, source_label)
  VALUES (a.company_id, public.fin_gl_next_no(a.company_id), (d + interval '1 month - 1 day')::date, _period, 'Amortissement ' || a.name || ' — ' || _period, 'auto', 'depreciation', x.id, 'post', 'Amortissement') RETURNING id INTO nid;
  INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit) VALUES (nid, a.company_id, 1, a.expense_gl, amt, 0), (nid, a.company_id, 2, a.accum_gl, 0, amt);
  UPDATE fin_gl_entries SET status = 'validated', validated_at = now(), validated_by = auth.uid() WHERE id = nid;
  UPDATE fin_asset_depr SET gl_entry_id = nid WHERE id = x.id;
  SELECT entry_no INTO n FROM fin_gl_entries WHERE id = nid;
  RETURN jsonb_build_object('entry_no', n, 'amount', amt);
END $$;

CREATE OR REPLACE FUNCTION public.fin_loan_save(_company uuid, _id uuid, _d jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT (public.fin_gl_owned(_company, (_d->>'loan_gl')::uuid) AND public.fin_gl_owned(_company, (_d->>'interest_gl')::uuid)) THEN RAISE EXCEPTION 'Compte comptable invalide' USING ERRCODE = '42501'; END IF;
  IF _id IS NULL THEN
    INSERT INTO fin_loans(company_id, name, lender, principal, annual_rate, start_on, term_months, loan_gl, interest_gl, note)
    VALUES (_company, btrim(_d->>'name'), _d->>'lender', (_d->>'principal')::numeric, nullif(_d->>'annual_rate','')::numeric, (_d->>'start_on')::date, (_d->>'term_months')::int, (_d->>'loan_gl')::uuid, (_d->>'interest_gl')::uuid, _d->>'note') RETURNING id INTO nid;
    RETURN nid;
  END IF;
  IF EXISTS (SELECT 1 FROM fin_loan_payments WHERE loan_id = _id) THEN
    UPDATE fin_loans SET name = btrim(_d->>'name'), lender = _d->>'lender', note = _d->>'note', loan_gl = coalesce(loan_gl, (_d->>'loan_gl')::uuid), interest_gl = coalesce(interest_gl, (_d->>'interest_gl')::uuid) WHERE id = _id AND company_id = _company;
  ELSE
    UPDATE fin_loans SET name = btrim(_d->>'name'), lender = _d->>'lender', principal = (_d->>'principal')::numeric, annual_rate = nullif(_d->>'annual_rate','')::numeric, start_on = (_d->>'start_on')::date, term_months = (_d->>'term_months')::int, loan_gl = (_d->>'loan_gl')::uuid, interest_gl = (_d->>'interest_gl')::uuid, note = _d->>'note' WHERE id = _id AND company_id = _company;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prêt introuvable' USING ERRCODE = '42501'; END IF;
  RETURN _id;
END $$;

-- Paiement réel d'un prêt : ventilation capital/intérêts saisie depuis le relevé du prêteur (jamais devinée).
CREATE OR REPLACE FUNCTION public.fin_loan_pay(_loan uuid, _on date, _principal numeric, _interest numeric, _account uuid, _ref text, _key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l fin_loans; p fin_loan_payments; cash uuid; nid uuid; n int; paid numeric; i int := 0;
BEGIN
  SELECT * INTO l FROM fin_loans WHERE id = _loan;
  IF NOT FOUND OR NOT public.fin_can_write(l.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de demande requise' USING ERRCODE = '22023'; END IF;
  PERFORM public.fin_gl_lock(l.company_id);
  SELECT * INTO p FROM fin_loan_payments WHERE company_id = l.company_id AND idem_key = _key;
  IF FOUND THEN SELECT entry_no INTO n FROM fin_gl_entries WHERE id = p.gl_entry_id; RETURN jsonb_build_object('entry_no', n, 'replay', true); END IF;
  IF _on IS NULL OR _on > current_date THEN RAISE EXCEPTION 'Date réelle requise' USING ERRCODE = '22023'; END IF;
  IF coalesce(_principal,0) < 0 OR coalesce(_interest,0) < 0 OR coalesce(_principal,0) + coalesce(_interest,0) <= 0 OR _principal <> round(_principal,2) OR _interest <> round(_interest,2) THEN RAISE EXCEPTION 'Montants invalides' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(principal),0) INTO paid FROM fin_loan_payments WHERE loan_id = _loan;
  IF paid + _principal > l.principal THEN RAISE EXCEPTION 'Le capital remboursé dépasserait le capital du prêt' USING ERRCODE = 'P0410'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fin_accounts WHERE id = _account AND company_id = l.company_id) THEN RAISE EXCEPTION 'Compte financier invalide' USING ERRCODE = '42501'; END IF;
  SELECT gl_account_id INTO cash FROM fin_gl_account_links WHERE fin_account_id = _account;
  IF cash IS NULL OR l.loan_gl IS NULL OR (_interest > 0 AND l.interest_gl IS NULL) THEN RAISE EXCEPTION 'À compléter : comptes comptables du prêt, des intérêts et du compte payeur requis' USING ERRCODE = 'P0410'; END IF;
  INSERT INTO fin_loan_payments(company_id, loan_id, paid_on, principal, interest, fin_account_id, reference, idem_key) VALUES (l.company_id, _loan, _on, _principal, _interest, _account, nullif(btrim(coalesce(_ref,'')),''), _key) RETURNING * INTO p;
  INSERT INTO fin_gl_entries(company_id, entry_no, entry_date, reference, description, origin, source_kind, source_id, source_purpose, source_label)
  VALUES (l.company_id, public.fin_gl_next_no(l.company_id), _on, p.reference, 'Paiement de prêt ' || l.name, 'auto', 'loan_payment', p.id, 'post', 'Paiement de prêt') RETURNING id INTO nid;
  IF _principal > 0 THEN i := i + 1; INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit) VALUES (nid, l.company_id, i, l.loan_gl, _principal, 0); END IF;
  IF _interest > 0 THEN i := i + 1; INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit) VALUES (nid, l.company_id, i, l.interest_gl, _interest, 0); END IF;
  INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit) VALUES (nid, l.company_id, i + 1, cash, 0, _principal + _interest);
  UPDATE fin_gl_entries SET status = 'validated', validated_at = now(), validated_by = auth.uid() WHERE id = nid;
  UPDATE fin_loan_payments SET gl_entry_id = nid WHERE id = p.id;
  SELECT entry_no INTO n FROM fin_gl_entries WHERE id = nid;
  RETURN jsonb_build_object('entry_no', n);
END $$;

REVOKE ALL ON FUNCTION public.fin_gl_owned(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_asset_save(uuid, uuid, jsonb), public.fin_asset_depr_post(uuid, text), public.fin_loan_save(uuid, uuid, jsonb), public.fin_loan_pay(uuid, date, numeric, numeric, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_asset_save(uuid, uuid, jsonb), public.fin_asset_depr_post(uuid, text), public.fin_loan_save(uuid, uuid, jsonb), public.fin_loan_pay(uuid, date, numeric, numeric, uuid, text, text) TO authenticated;