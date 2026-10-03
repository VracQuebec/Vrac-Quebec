CREATE TABLE public.fin_tax_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'preparee' CHECK (status IN ('preparee','revue','declaree_hors_app','payee_hors_app','annulee')),
  snapshot jsonb NOT NULL,
  gst_net numeric(14,2) NOT NULL,
  qst_net numeric(14,2) NOT NULL,
  filed_on date, filed_ref text, paid_on date, paid_ref text,
  note text, cancel_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fin_tax_returns_one_active ON public.fin_tax_returns(company_id, period_from, period_to) WHERE status <> 'annulee';
GRANT SELECT ON public.fin_tax_returns TO authenticated;
GRANT ALL ON public.fin_tax_returns TO service_role;
ALTER TABLE public.fin_tax_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_tax_returns read" ON public.fin_tax_returns FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_tax_return_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.fin_tax_returns(id),
  company_id uuid NOT NULL,
  action text NOT NULL, detail jsonb, by_user uuid, at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_tax_return_events TO authenticated;
GRANT ALL ON public.fin_tax_return_events TO service_role;
ALTER TABLE public.fin_tax_return_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_tax_return_events read" ON public.fin_tax_return_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_tax_period_compute(_company uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb := '{}'; role text; acc uuid; amt numeric; n int; drafts int; missing text[] := '{}';
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN RAISE EXCEPTION 'Période invalide' USING ERRCODE='22023'; END IF;
  FOREACH role IN ARRAY ARRAY['gst_payable','qst_payable','gst_recoverable','qst_recoverable'] LOOP
    SELECT gl_account_id INTO acc FROM public.fin_gl_mappings WHERE company_id=_company AND fin_gl_mappings.role=role;
    IF acc IS NULL THEN missing := missing || role; r := r || jsonb_build_object(role, NULL); CONTINUE; END IF;
    SELECT coalesce(sum(CASE WHEN role LIKE '%payable' THEN l.credit-l.debit ELSE l.debit-l.credit END),0), count(DISTINCT e.id) INTO amt, n
      FROM public.fin_gl_lines l JOIN public.fin_gl_entries e ON e.id=l.entry_id
      WHERE l.company_id=_company AND l.gl_account_id=acc AND e.status='validated' AND e.entry_date BETWEEN _from AND _to;
    r := r || jsonb_build_object(role, jsonb_build_object('account_id', acc, 'amount', amt, 'entries', n));
  END LOOP;
  SELECT count(*) INTO drafts FROM public.fin_gl_entries WHERE company_id=_company AND status='draft' AND entry_date BETWEEN _from AND _to;
  RETURN jsonb_build_object('from', _from, 'to', _to, 'currency', 'CAD', 'lines', r, 'missing', to_jsonb(missing), 'drafts_in_period', drafts,
    'gst_net', CASE WHEN r->'gst_payable' = 'null' OR r->'gst_recoverable' = 'null' THEN NULL ELSE (r->'gst_payable'->>'amount')::numeric - (r->'gst_recoverable'->>'amount')::numeric END,
    'qst_net', CASE WHEN r->'qst_payable' = 'null' OR r->'qst_recoverable' = 'null' THEN NULL ELSE (r->'qst_payable'->>'amount')::numeric - (r->'qst_recoverable'->>'amount')::numeric END);
END $$;

CREATE OR REPLACE FUNCTION public.fin_tax_return_prepare(_company uuid, _from date, _to date, _due date, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c jsonb; id uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  c := public.fin_tax_period_compute(_company, _from, _to);
  IF jsonb_array_length(c->'missing') > 0 THEN RAISE EXCEPTION 'À compléter : associer les comptes de taxes (%)', c->>'missing' USING ERRCODE='22023'; END IF;
  IF (c->>'drafts_in_period')::int > 0 THEN RAISE EXCEPTION 'Des écritures en brouillon existent dans la période : valider ou abandonner d''abord' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_tax_returns WHERE company_id=_company AND status<>'annulee' AND period_from <= _to AND period_to >= _from) THEN
    RAISE EXCEPTION 'Une préparation chevauche déjà cette période' USING ERRCODE='P0409'; END IF;
  INSERT INTO public.fin_tax_returns(company_id, period_from, period_to, due_date, snapshot, gst_net, qst_net, note, created_by, updated_by)
    VALUES (_company, _from, _to, _due, c, (c->>'gst_net')::numeric, (c->>'qst_net')::numeric, nullif(trim(_note),''), auth.uid(), auth.uid()) RETURNING fin_tax_returns.id INTO id;
  INSERT INTO public.fin_tax_return_events(return_id, company_id, action, detail, by_user) VALUES (id, _company, 'preparee', c, auth.uid());
  RETURN id;
END $$;

CREATE OR REPLACE FUNCTION public.fin_tax_return_step(_id uuid, _action text, _date date, _ref text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.fin_tax_returns;
BEGIN
  SELECT * INTO t FROM public.fin_tax_returns WHERE id=_id FOR UPDATE;
  IF t.id IS NULL OR NOT public.fin_can_write(t.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _action='revue' AND t.status='preparee' THEN UPDATE public.fin_tax_returns SET status='revue' WHERE id=_id;
  ELSIF _action='declaree_hors_app' AND t.status IN ('preparee','revue') THEN
    IF _date IS NULL OR coalesce(trim(_ref),'')='' THEN RAISE EXCEPTION 'Date et numéro de confirmation requis' USING ERRCODE='22023'; END IF;
    UPDATE public.fin_tax_returns SET status='declaree_hors_app', filed_on=_date, filed_ref=trim(_ref) WHERE id=_id;
  ELSIF _action='payee_hors_app' AND t.status='declaree_hors_app' THEN
    IF _date IS NULL OR coalesce(trim(_ref),'')='' THEN RAISE EXCEPTION 'Date et référence du paiement requises' USING ERRCODE='22023'; END IF;
    UPDATE public.fin_tax_returns SET status='payee_hors_app', paid_on=_date, paid_ref=trim(_ref) WHERE id=_id;
  ELSIF _action='annulee' AND t.status IN ('preparee','revue') THEN
    IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis' USING ERRCODE='22023'; END IF;
    UPDATE public.fin_tax_returns SET status='annulee', cancel_reason=trim(_reason) WHERE id=_id;
  ELSE RAISE EXCEPTION 'Transition non permise depuis « % »', t.status USING ERRCODE='22023'; END IF;
  UPDATE public.fin_tax_returns SET updated_by=auth.uid(), updated_at=now() WHERE id=_id;
  INSERT INTO public.fin_tax_return_events(return_id, company_id, action, detail, by_user)
    VALUES (_id, t.company_id, _action, jsonb_build_object('date',_date,'ref',_ref,'reason',_reason), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.fin_tax_period_compute(uuid,date,date), public.fin_tax_return_prepare(uuid,date,date,date,text), public.fin_tax_return_step(uuid,text,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_tax_period_compute(uuid,date,date), public.fin_tax_return_prepare(uuid,date,date,date,text), public.fin_tax_return_step(uuid,text,date,text,text) TO authenticated, service_role;