-- FIN-12A1 — Échéances inconnues, crédits fournisseurs, trop-payés explicites.
-- Un crédit fournisseur n'est jamais un encaissement : il réduit le solde d'une facture confirmée
-- par une affectation (fin_supplier_credit_allocs), sans toucher au montant d'origine ni aux règlements.

ALTER TABLE public.fin_occurrences ADD COLUMN IF NOT EXISTS due_unknown boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.fin_occurrences.due_unknown IS 'FIN-12A1 : échéance fournisseur inconnue; due_date = repère technique, exclu des prévisions datées';
UPDATE public.fin_occurrences oc SET due_unknown = true FROM public.fin_supplier_bills b
 WHERE b.occurrence_id = oc.id AND b.status = 'confirmed' AND b.due_date IS NULL AND NOT b.replaced_estimate;

CREATE TABLE public.fin_supplier_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.ent_crm_clients(id),
  reference text,
  doc_date date,
  description text,
  subtotal numeric(14,2),
  gst numeric(14,2),
  qst numeric(14,2),
  total numeric(14,2),
  tax_status text NOT NULL DEFAULT 'a_completer' CHECK (tax_status IN ('detaillee','a_completer')),
  file_id uuid REFERENCES public.ent_crm_files(id),
  file_sha256 text,
  linked_bill_id uuid REFERENCES public.fin_supplier_bills(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','void')),
  dup_override_reason text,
  void_reason text,
  create_key text,
  confirm_key text,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz, confirmed_by uuid,
  voided_at timestamptz, voided_by uuid,
  CHECK (total IS NULL OR total >= 0),
  CHECK (status = 'draft' OR (total IS NOT NULL AND total > 0))
);
CREATE UNIQUE INDEX fin_scr_create_key ON public.fin_supplier_credits(company_id, create_key) WHERE create_key IS NOT NULL;
CREATE INDEX fin_scr_company ON public.fin_supplier_credits(company_id, supplier_id, status);
GRANT SELECT ON public.fin_supplier_credits TO authenticated;
GRANT ALL ON public.fin_supplier_credits TO service_role;
ALTER TABLE public.fin_supplier_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_scr_read ON public.fin_supplier_credits FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE TRIGGER fin_scr_stamp BEFORE INSERT OR UPDATE ON public.fin_supplier_credits FOR EACH ROW EXECUTE FUNCTION public.fin_sb_stamp();

CREATE TABLE public.fin_supplier_credit_allocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  credit_id uuid NOT NULL REFERENCES public.fin_supplier_credits(id),
  bill_id uuid NOT NULL REFERENCES public.fin_supplier_bills(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  idem_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz, reversed_by uuid, reverse_reason text
);
CREATE UNIQUE INDEX fin_scra_idem ON public.fin_supplier_credit_allocs(company_id, idem_key);
CREATE INDEX fin_scra_bill ON public.fin_supplier_credit_allocs(bill_id) WHERE reversed_at IS NULL;
CREATE INDEX fin_scra_credit ON public.fin_supplier_credit_allocs(credit_id) WHERE reversed_at IS NULL;
GRANT SELECT ON public.fin_supplier_credit_allocs TO authenticated;
GRANT ALL ON public.fin_supplier_credit_allocs TO service_role;
ALTER TABLE public.fin_supplier_credit_allocs ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_scra_read ON public.fin_supplier_credit_allocs FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE OR REPLACE FUNCTION public.fin_scra_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Affectation de crédit : suppression interdite (annulation motivée seulement)' USING ERRCODE='42501'; END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); NEW.reversed_at := NULL; RETURN NEW; END IF;
  IF OLD.reversed_at IS NOT NULL OR NEW.amount <> OLD.amount OR NEW.bill_id <> OLD.bill_id OR NEW.credit_id <> OLD.credit_id OR NEW.company_id <> OLD.company_id
     OR NEW.created_at <> OLD.created_at OR NEW.idem_key <> OLD.idem_key OR NEW.reversed_at IS NULL THEN
    RAISE EXCEPTION 'Affectation de crédit immuable (seule une annulation motivée est permise)' USING ERRCODE='42501'; END IF;
  NEW.reversed_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER fin_scra_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_supplier_credit_allocs FOR EACH ROW EXECUTE FUNCTION public.fin_scra_guard();

CREATE TABLE public.fin_supplier_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  credit_id uuid NOT NULL REFERENCES public.fin_supplier_credits(id),
  alloc_id uuid REFERENCES public.fin_supplier_credit_allocs(id),
  action text NOT NULL,
  reason text,
  detail jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_supplier_credit_events TO authenticated;
GRANT ALL ON public.fin_supplier_credit_events TO service_role;
ALTER TABLE public.fin_supplier_credit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_scre_read ON public.fin_supplier_credit_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE TRIGGER fin_scre_no_change BEFORE UPDATE OR DELETE ON public.fin_supplier_credit_events FOR EACH ROW EXECUTE FUNCTION public.fin_sbe_append_only();

CREATE OR REPLACE FUNCTION public.fin_scr_log(_c public.fin_supplier_credits, _alloc uuid, _action text, _reason text, _detail jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fin_supplier_credit_events(company_id, credit_id, alloc_id, action, reason, detail, actor_id)
  VALUES (_c.company_id, _c.id, _alloc, _action, _reason, _detail, auth.uid());
$$;
REVOKE ALL ON FUNCTION public.fin_scr_log(public.fin_supplier_credits, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_occ_credited(_occ uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(a.amount),0) FROM public.fin_supplier_credit_allocs a
  JOIN public.fin_supplier_bills b ON b.id = a.bill_id AND b.status = 'confirmed'
  WHERE b.occurrence_id = _occ AND a.reversed_at IS NULL $$;
CREATE OR REPLACE FUNCTION public.fin_bill_credited(_bill uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(amount),0) FROM public.fin_supplier_credit_allocs WHERE bill_id = _bill AND reversed_at IS NULL $$;
CREATE OR REPLACE FUNCTION public.fin_credit_allocated(_credit uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(amount),0) FROM public.fin_supplier_credit_allocs WHERE credit_id = _credit AND reversed_at IS NULL $$;
REVOKE ALL ON FUNCTION public.fin_occ_credited(uuid), public.fin_bill_credited(uuid), public.fin_credit_allocated(uuid) FROM PUBLIC, anon, authenticated;

-- Soldes partout = montant − règlements − crédits affectés; échéances inconnues hors des périodes datées.
CREATE OR REPLACE FUNCTION pg_temp.fin12a1_patch(_fn text, _pairs text[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s text; i int; n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO s FROM pg_proc p WHERE p.proname = _fn AND p.pronamespace = 'public'::regnamespace;
  IF s IS NULL THEN RAISE EXCEPTION 'FIN-12A1 : fonction % absente', _fn; END IF;
  FOR i IN 1 .. array_length(_pairs,1) BY 2 LOOP
    n := (length(s) - length(replace(s, _pairs[i], ''))) / length(_pairs[i]);
    IF n < 1 THEN RAISE EXCEPTION 'FIN-12A1 : ancre introuvable dans % : %', _fn, _pairs[i]; END IF;
    s := replace(s, _pairs[i], _pairs[i+1]);
  END LOOP;
  EXECUTE s;
END $$;
SELECT pg_temp.fin12a1_patch('fin_select', ARRAY[
  'reversed_at IS NULL) pd', 'reversed_at IS NULL) pd CROSS JOIN LATERAL (SELECT public.fin_occ_credited(oc.id) AS cr) cd',
  'greatest(oc.amount - pd.paid, 0)', 'greatest(oc.amount - pd.paid - cd.cr, 0)',
  'WHEN pd.paid >= oc.amount THEN ''reglee'' WHEN pd.paid > 0 THEN', 'WHEN pd.paid + cd.cr >= oc.amount THEN ''reglee'' WHEN pd.paid + cd.cr > 0 THEN',
  'AND (CASE WHEN _base=''planned'' THEN oc.planned_date ELSE oc.due_date END) BETWEEN _from AND _to',
  'AND (CASE WHEN coalesce(_f->>''due_unknown'','''')=''only'' THEN oc.due_unknown ELSE (CASE WHEN _base=''planned'' THEN oc.planned_date ELSE oc.due_date END) BETWEEN _from AND _to AND (NOT oc.due_unknown OR coalesce(_f->>''due_unknown'','''')=''all'') END)']);
SELECT pg_temp.fin12a1_patch('fin_period_totals', ARRAY[
  'DECLARE r jsonb; d jsonb; u jsonb;', 'DECLARE r jsonb; d jsonb; u jsonb; k jsonb;',
  'RETURN r || d || u;', 'SELECT jsonb_build_object(''due_unknown_remaining'', coalesce(sum(balance) FILTER (WHERE status=''active'' AND settle IN (''non_reglee'',''partielle'',''a_confirmer'')),0), ''due_unknown_count'', count(*) FILTER (WHERE status=''active'' AND settle IN (''non_reglee'',''partielle'',''a_confirmer''))) INTO k FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,''{}''::jsonb) || ''{"due_unknown":"only"}''::jsonb); RETURN r || d || u || k;']);
SELECT pg_temp.fin12a1_patch('fin__alloc', ARRAY['bal := r.amount - paid;', 'bal := r.amount - paid - public.fin_occ_credited(r.id);']);
SELECT pg_temp.fin12a1_patch('fin_occ_guard', ARRAY[
  'IF paid > 0 AND (NEW.amount_quality=''unknown'' OR NEW.amount < paid) THEN', 'paid := paid + public.fin_occ_credited(OLD.id); IF paid > 0 AND (NEW.amount_quality=''unknown'' OR NEW.amount < paid) THEN']);
SELECT pg_temp.fin12a1_patch('fin_open_for_payee', ARRAY['public.fin_occ_paid(oc.id)', '(public.fin_occ_paid(oc.id) + public.fin_occ_credited(oc.id))']);
SELECT pg_temp.fin12a1_patch('fin_occurrence_detail', ARRAY['''{"status":"all"}''::jsonb) s WHERE s.id=_occ', '''{"status":"all","due_unknown":"all"}''::jsonb) s WHERE s.id=_occ']);

CREATE OR REPLACE FUNCTION public.fin_bill_confirm(_id uuid, _occ uuid, _expect_rev integer, _key text, _dup_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.fin_supplier_bills; oc public.fin_occurrences; ob public.fin_obligations; d jsonb; paid numeric; oid uuid; anc date; sup text;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de confirmation requise'; END IF;
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _id FOR UPDATE;
  IF b.id IS NULL OR NOT public.fin_can_write(b.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF b.status = 'confirmed' THEN
    IF b.confirm_key = _key THEN RETURN jsonb_build_object('id', b.id, 'occurrence_id', b.occurrence_id, 'obligation_id', b.obligation_id, 'replay', true); END IF;
    RAISE EXCEPTION 'Facture déjà confirmée' USING ERRCODE='P0409';
  END IF;
  IF b.status <> 'draft' THEN RAISE EXCEPTION 'Facture annulée' USING ERRCODE='P0409'; END IF;
  IF _expect_rev IS DISTINCT FROM b.rev THEN RAISE EXCEPTION 'Conflit : le brouillon a changé. Rechargez avant de confirmer.' USING ERRCODE='P0409'; END IF;
  IF b.total IS NULL THEN RAISE EXCEPTION 'Total du document requis pour confirmer'; END IF;
  IF b.reference IS NULL OR b.doc_date IS NULL THEN RAISE EXCEPTION 'Référence et date du document requises pour confirmer'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_sb:'||b.company_id||':'||b.supplier_id));
  d := public.fin_bill_dups(b.company_id, b.id, to_jsonb(b));
  IF jsonb_array_length(d->'exact') > 0 AND coalesce(btrim(_dup_reason),'') = '' THEN
    RAISE EXCEPTION 'Doublon : un document identique est déjà enregistré (%). Ouvrez-le, ou indiquez le motif de l''exception.', d->'exact'->0->>'reference' USING ERRCODE='P0410';
  END IF;
  IF _occ IS NOT NULL THEN
    SELECT * INTO oc FROM public.fin_occurrences WHERE id = _occ AND company_id = b.company_id FOR UPDATE;
    IF oc.id IS NULL THEN RAISE EXCEPTION 'Échéance hors de cette entreprise' USING ERRCODE='42501'; END IF;
    IF oc.status <> 'active' THEN RAISE EXCEPTION 'Échéance annulée : choisissez une autre estimation' USING ERRCODE='P0409'; END IF;
    IF EXISTS (SELECT 1 FROM public.fin_supplier_bills WHERE occurrence_id = _occ AND status = 'confirmed') THEN
      RAISE EXCEPTION 'Cette échéance est déjà remplacée par une autre facture' USING ERRCODE='P0409'; END IF;
    SELECT * INTO ob FROM public.fin_obligations WHERE id = oc.obligation_id;
    IF ob.payee_client_id IS NOT NULL AND ob.payee_client_id <> b.supplier_id THEN RAISE EXCEPTION 'Échéance d''un autre fournisseur' USING ERRCODE='P0409'; END IF;
    paid := public.fin_occ_paid(_occ);
    IF paid > b.total THEN
      RAISE EXCEPTION 'Trop-payé : % $ déjà réglés sur cette échéance pour une facture de % $. Le trop-payé n''est pas encore traité automatiquement : ouvrez le règlement, retirez l''affectation excédentaire (le versement reste intact, l''excédent devient un reliquat visible à réaffecter), puis confirmez de nouveau. Rien n''a été modifié.', paid, b.total USING ERRCODE='P0409';
    END IF;
    UPDATE public.fin_occurrences SET amount = b.total, amount_quality = 'confirmed', amount_override = true,
      due_unknown = (b.due_date IS NULL AND oc.due_unknown), updated_at = now() WHERE id = _occ;
    PERFORM public.fin_log(b.company_id, oc.obligation_id, _occ, 'bill_replace', 'Facture fournisseur '||b.reference,
      jsonb_build_object('amount', oc.amount, 'quality', oc.amount_quality), jsonb_build_object('amount', b.total, 'quality', 'confirmed', 'bill_id', b.id));
    UPDATE public.fin_supplier_bills SET status = 'confirmed', occurrence_id = _occ, obligation_id = oc.obligation_id, replaced_estimate = true,
      estimate_amount = oc.amount, estimate_quality = oc.amount_quality, confirm_key = _key, dup_override_reason = nullif(btrim(_dup_reason),''),
      confirmed_at = now(), confirmed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO b;
  ELSE
    anc := coalesce(b.due_date, b.doc_date); -- repère technique seulement si échéance inconnue (due_unknown = true)
    SELECT name INTO sup FROM public.ent_crm_clients WHERE id = b.supplier_id;
    oid := public.fin_save_obligation(b.company_id, NULL, jsonb_strip_nulls(jsonb_build_object('label', 'Facture '||sup||' '||b.reference, 'payee_client_id', b.supplier_id,
      'category_id', b.category_id, 'truck_id', b.truck_id, 'project_id', b.project_id, 'document_id', b.file_id, 'frequency', 'once', 'anchor_date', anc,
      'amount', b.total, 'amount_quality', 'confirmed', 'nature', 'dette', 'contract_ref', b.reference)));
    UPDATE public.fin_obligations SET source_document_id = b.id WHERE id = oid;
    PERFORM public.fin_ensure_occurrences(b.company_id, anc, anc);
    SELECT * INTO oc FROM public.fin_occurrences WHERE obligation_id = oid AND status = 'active' ORDER BY due_date LIMIT 1;
    IF oc.id IS NULL THEN RAISE EXCEPTION 'Échéance non générée'; END IF;
    UPDATE public.fin_occurrences SET due_unknown = (b.due_date IS NULL) WHERE id = oc.id;
    UPDATE public.fin_supplier_bills SET status = 'confirmed', occurrence_id = oc.id, obligation_id = oid, replaced_estimate = false, confirm_key = _key,
      dup_override_reason = nullif(btrim(_dup_reason),''), confirmed_at = now(), confirmed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO b;
  END IF;
  PERFORM public.fin_sb_log(b, 'confirm', b.dup_override_reason, jsonb_build_object('occurrence_id', b.occurrence_id, 'replaced', b.replaced_estimate,
    'estimate', b.estimate_amount, 'total', b.total, 'due_unknown', b.due_date IS NULL, 'dups', d));
  RETURN jsonb_build_object('id', b.id, 'occurrence_id', b.occurrence_id, 'obligation_id', b.obligation_id);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bill_void(_id uuid, _expect_rev integer, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.fin_supplier_bills; paid numeric; cr numeric;
BEGIN
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _id FOR UPDATE;
  IF b.id IS NULL OR NOT public.fin_can_correct(b.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF _expect_rev IS DISTINCT FROM b.rev THEN RAISE EXCEPTION 'Conflit : rechargez la facture' USING ERRCODE='P0409'; END IF;
  IF b.status = 'void' THEN RAISE EXCEPTION 'Déjà annulée' USING ERRCODE='P0409'; END IF;
  IF b.status = 'confirmed' THEN
    PERFORM 1 FROM public.fin_occurrences WHERE id = b.occurrence_id FOR UPDATE;
    cr := public.fin_bill_credited(b.id);
    IF cr > 0 THEN RAISE EXCEPTION 'Crédits fournisseurs affectés (% $) : annulez d''abord ces affectations (le crédit redevient disponible), puis annulez la facture.', cr USING ERRCODE='P0409'; END IF;
    paid := public.fin_occ_paid(b.occurrence_id);
    IF b.replaced_estimate THEN
      UPDATE public.fin_occurrences SET amount = b.estimate_amount, amount_quality = b.estimate_quality, updated_at = now() WHERE id = b.occurrence_id;
      PERFORM public.fin_log(b.company_id, b.obligation_id, b.occurrence_id, 'bill_void', _reason, jsonb_build_object('amount', b.total), jsonb_build_object('amount', b.estimate_amount, 'quality', b.estimate_quality, 'paid_kept', paid));
    ELSE
      IF paid > 0 THEN RAISE EXCEPTION 'Règlements affectés (% $) à cette facture : ouvrez le règlement et retirez l''affectation (le versement reste intact et devient un reliquat à réaffecter à la nouvelle facture), puis annulez.', paid USING ERRCODE='P0409'; END IF;
      PERFORM public.fin_cancel_occurrence(b.occurrence_id, 'Facture fournisseur annulée : '||_reason);
    END IF;
  END IF;
  UPDATE public.fin_supplier_bills SET status = 'void', void_reason = btrim(_reason), voided_at = now(), voided_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO b;
  PERFORM public.fin_sb_log(b, 'void', _reason, jsonb_build_object('paid_kept_on_occurrence', coalesce(paid,0)));
  RETURN jsonb_build_object('id', b.id, 'status', b.status, 'paid_kept', coalesce(paid,0));
END $$;

CREATE OR REPLACE FUNCTION public.fin_bills_overview(_company uuid, _f jsonb, _limit integer, _offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; tot jsonb; n int; cr jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  WITH base AS (
    SELECT b.id, b.supplier_id, c.name AS supplier, b.reference, b.doc_date, b.due_date, b.status, b.total, p.paid, p.credited,
      CASE WHEN b.status = 'confirmed' THEN greatest(b.total - p.paid - p.credited, 0) END AS rest,
      CASE WHEN b.status = 'confirmed' THEN greatest(p.paid + p.credited - b.total, 0) END AS overpaid,
      coalesce(oc.due_unknown, b.due_date IS NULL) AS due_unknown, CASE WHEN oc.due_unknown THEN NULL ELSE oc.due_date END AS occ_due,
      b.tax_status, b.replaced_estimate AS replaced, b.estimate_amount AS estimate, b.occurrence_id, b.file_id, b.created_at, b.updated_at
    FROM public.fin_supplier_bills b JOIN public.ent_crm_clients c ON c.id = b.supplier_id
    LEFT JOIN public.fin_occurrences oc ON oc.id = b.occurrence_id
    CROSS JOIN LATERAL (SELECT CASE WHEN b.occurrence_id IS NOT NULL THEN public.fin_occ_paid(b.occurrence_id) ELSE 0 END AS paid,
                               CASE WHEN b.status = 'confirmed' THEN public.fin_bill_credited(b.id) ELSE 0 END AS credited) p
    WHERE b.company_id = _company
      AND (nullif(_f->>'supplier_id','') IS NULL OR b.supplier_id = (_f->>'supplier_id')::uuid)
      AND (CASE coalesce(_f->>'status','active') WHEN 'all' THEN true WHEN 'active' THEN b.status <> 'void' ELSE b.status = _f->>'status' END)
      AND (nullif(_f->>'q','') IS NULL OR c.name ILIKE '%'||(_f->>'q')||'%' OR b.reference ILIKE '%'||(_f->>'q')||'%')
  ), agg AS (
    SELECT count(*)::int AS n, jsonb_build_object('count', count(*),
      'confirmed_total', coalesce(sum(total) FILTER (WHERE status='confirmed'),0),
      'paid', coalesce(sum(paid) FILTER (WHERE status='confirmed'),0),
      'credited', coalesce(sum(credited) FILTER (WHERE status='confirmed'),0),
      'rest', coalesce(sum(rest) FILTER (WHERE status='confirmed'),0),
      'rest_due_known', coalesce(sum(rest) FILTER (WHERE status='confirmed' AND NOT due_unknown),0),
      'rest_due_unknown', coalesce(sum(rest) FILTER (WHERE status='confirmed' AND due_unknown),0),
      'overpaid', coalesce(sum(overpaid) FILTER (WHERE status='confirmed'),0),
      'drafts', count(*) FILTER (WHERE status='draft'),
      'tax_incomplete', count(*) FILTER (WHERE status<>'void' AND tax_status='a_completer')) AS t FROM base
  ), pg AS (SELECT * FROM base ORDER BY created_at DESC, id LIMIT greatest(least(coalesce(_limit,25),200),1) OFFSET greatest(coalesce(_offset,0),0))
  SELECT agg.n, agg.t, (SELECT coalesce(jsonb_agg(to_jsonb(pg) ORDER BY pg.created_at DESC, pg.id), '[]') FROM pg) INTO n, tot, res FROM agg;
  SELECT jsonb_build_object('credit_confirmed', coalesce(sum(s.total),0), 'credit_available', coalesce(sum(s.total - public.fin_credit_allocated(s.id)),0), 'credit_count', count(*))
    INTO cr FROM public.fin_supplier_credits s
   WHERE s.company_id = _company AND s.status = 'confirmed' AND (nullif(_f->>'supplier_id','') IS NULL OR s.supplier_id = (_f->>'supplier_id')::uuid);
  RETURN jsonb_build_object('rows', res, 'totals', tot || cr, 'total', n);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bill_position(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.fin_supplier_bills; paid numeric := 0; cr numeric := 0; du boolean;
BEGIN
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _id;
  IF b.id IS NULL OR NOT public.fin_can_read(b.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF b.status = 'confirmed' THEN paid := public.fin_occ_paid(b.occurrence_id); cr := public.fin_bill_credited(b.id);
    SELECT due_unknown INTO du FROM public.fin_occurrences WHERE id = b.occurrence_id; END IF;
  RETURN jsonb_build_object('total', b.total, 'credited', cr, 'paid', paid,
    'rest', CASE WHEN b.status='confirmed' THEN greatest(b.total - paid - cr, 0) END,
    'overpaid', CASE WHEN b.status='confirmed' THEN greatest(paid + cr - b.total, 0) END, 'due_unknown', coalesce(du, b.due_date IS NULL),
    'allocs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'credit_id', a.credit_id, 'reference', s.reference, 'amount', a.amount, 'created_at', a.created_at,
        'reversed_at', a.reversed_at, 'reverse_reason', a.reverse_reason) ORDER BY a.created_at), '[]')
       FROM public.fin_supplier_credit_allocs a JOIN public.fin_supplier_credits s ON s.id = a.credit_id WHERE a.bill_id = b.id));
END $$;

CREATE OR REPLACE FUNCTION public.fin_scr_save(_company uuid, _id uuid, _p jsonb, _base_rev integer, _create_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_supplier_credits; ts text; lb uuid := nullif(_p->>'linked_bill_id','')::uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_sb_check(_company, _p);
  IF lb IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_supplier_bills WHERE id = lb AND company_id = _company AND supplier_id = (_p->>'supplier_id')::uuid) THEN
    RAISE EXCEPTION 'Facture liée : même fournisseur et même entreprise requis' USING ERRCODE='42501'; END IF;
  ts := CASE WHEN nullif(_p->>'gst','') IS NOT NULL AND nullif(_p->>'qst','') IS NOT NULL AND nullif(_p->>'subtotal','') IS NOT NULL THEN 'detaillee' ELSE 'a_completer' END;
  IF _id IS NULL THEN
    IF _create_key IS NOT NULL THEN
      SELECT * INTO c FROM public.fin_supplier_credits WHERE company_id = _company AND create_key = _create_key;
      IF c.id IS NOT NULL THEN RETURN jsonb_build_object('id', c.id, 'rev', c.rev, 'replay', true); END IF;
    END IF;
    INSERT INTO public.fin_supplier_credits(company_id, supplier_id, reference, doc_date, description, subtotal, gst, qst, total, tax_status, file_id, file_sha256, linked_bill_id, create_key, created_by)
    VALUES (_company, (_p->>'supplier_id')::uuid, nullif(btrim(_p->>'reference'),''), nullif(_p->>'doc_date','')::date, nullif(btrim(_p->>'description'),''),
      nullif(_p->>'subtotal','')::numeric, nullif(_p->>'gst','')::numeric, nullif(_p->>'qst','')::numeric, nullif(_p->>'total','')::numeric, ts,
      nullif(_p->>'file_id','')::uuid, nullif(_p->>'file_sha256',''), lb, _create_key, auth.uid())
    ON CONFLICT (company_id, create_key) WHERE create_key IS NOT NULL DO NOTHING RETURNING * INTO c;
    IF c.id IS NULL THEN
      SELECT * INTO c FROM public.fin_supplier_credits WHERE company_id = _company AND create_key = _create_key;
      RETURN jsonb_build_object('id', c.id, 'rev', c.rev, 'replay', true);
    END IF;
    PERFORM public.fin_scr_log(c, NULL, 'draft_create', NULL, NULL);
    RETURN jsonb_build_object('id', c.id, 'rev', c.rev);
  END IF;
  SELECT * INTO c FROM public.fin_supplier_credits WHERE id = _id AND company_id = _company FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Crédit introuvable' USING ERRCODE='42501'; END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'Crédit confirmé : utilisez l''annulation motivée' USING ERRCODE='P0409'; END IF;
  IF _base_rev IS DISTINCT FROM c.rev THEN RAISE EXCEPTION 'Conflit : ce brouillon a été modifié ailleurs. Rechargez.' USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_supplier_credits SET supplier_id = (_p->>'supplier_id')::uuid, reference = nullif(btrim(_p->>'reference'),''), doc_date = nullif(_p->>'doc_date','')::date,
    description = nullif(btrim(_p->>'description'),''), subtotal = nullif(_p->>'subtotal','')::numeric, gst = nullif(_p->>'gst','')::numeric, qst = nullif(_p->>'qst','')::numeric,
    total = nullif(_p->>'total','')::numeric, tax_status = ts, file_id = nullif(_p->>'file_id','')::uuid, file_sha256 = nullif(_p->>'file_sha256',''), linked_bill_id = lb, rev = rev + 1
  WHERE id = _id RETURNING * INTO c;
  RETURN jsonb_build_object('id', c.id, 'rev', c.rev);
END $$;

CREATE OR REPLACE FUNCTION public.fin_scr_confirm(_id uuid, _expect_rev integer, _key text, _dup_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_supplier_credits; ex jsonb;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de confirmation requise'; END IF;
  SELECT * INTO c FROM public.fin_supplier_credits WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF c.status = 'confirmed' THEN
    IF c.confirm_key = _key THEN RETURN jsonb_build_object('id', c.id, 'replay', true); END IF;
    RAISE EXCEPTION 'Crédit déjà confirmé' USING ERRCODE='P0409'; END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'Crédit annulé' USING ERRCODE='P0409'; END IF;
  IF _expect_rev IS DISTINCT FROM c.rev THEN RAISE EXCEPTION 'Conflit : le brouillon a changé. Rechargez.' USING ERRCODE='P0409'; END IF;
  IF c.total IS NULL OR c.total <= 0 THEN RAISE EXCEPTION 'Montant total du crédit requis (supérieur à 0) pour confirmer'; END IF;
  IF c.reference IS NULL OR c.doc_date IS NULL THEN RAISE EXCEPTION 'Numéro et date de la note de crédit requis pour confirmer'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_sb:'||c.company_id||':'||c.supplier_id));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'reference', x.reference)), '[]') INTO ex FROM public.fin_supplier_credits x
   WHERE x.company_id = c.company_id AND x.id <> c.id AND x.status = 'confirmed'
     AND ((x.supplier_id = c.supplier_id AND lower(x.reference) = lower(c.reference)) OR (c.file_sha256 IS NOT NULL AND x.file_sha256 = c.file_sha256));
  IF jsonb_array_length(ex) > 0 AND coalesce(btrim(_dup_reason),'') = '' THEN
    RAISE EXCEPTION 'Doublon : note de crédit déjà enregistrée (%). Ouvrez-la, ou indiquez le motif de l''exception.', ex->0->>'reference' USING ERRCODE='P0410'; END IF;
  UPDATE public.fin_supplier_credits SET status = 'confirmed', confirm_key = _key, dup_override_reason = nullif(btrim(_dup_reason),''),
    confirmed_at = now(), confirmed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO c;
  PERFORM public.fin_scr_log(c, NULL, 'confirm', c.dup_override_reason, jsonb_build_object('total', c.total, 'dups', ex));
  RETURN jsonb_build_object('id', c.id);
END $$;

CREATE OR REPLACE FUNCTION public.fin_scr_alloc(_credit uuid, _bill uuid, _amount numeric, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  avail := c.total - public.fin_credit_allocated(c.id);
  bal := b.total - public.fin_occ_paid(b.occurrence_id) - public.fin_bill_credited(b.id);
  IF avail <= 0 THEN RAISE EXCEPTION 'Crédit entièrement affecté (disponible 0 $)' USING ERRCODE='P0409'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.fin_scr_alloc_void(_alloc uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.fin_supplier_credit_allocs; c public.fin_supplier_credits; b public.fin_supplier_bills;
BEGIN
  SELECT * INTO a FROM public.fin_supplier_credit_allocs WHERE id = _alloc;
  IF a.id IS NULL OR NOT public.fin_can_correct(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  SELECT * INTO c FROM public.fin_supplier_credits WHERE id = a.credit_id FOR UPDATE;
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = a.bill_id FOR UPDATE;
  SELECT * INTO a FROM public.fin_supplier_credit_allocs WHERE id = _alloc FOR UPDATE;
  IF a.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Affectation déjà annulée' USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_supplier_credit_allocs SET reversed_at = now(), reversed_by = auth.uid(), reverse_reason = btrim(_reason) WHERE id = _alloc RETURNING * INTO a;
  PERFORM public.fin_scr_log(c, a.id, 'allocate_void', _reason, jsonb_build_object('bill_id', b.id, 'amount', a.amount));
  PERFORM public.fin_sb_log(b, 'credit_allocate_void', _reason, jsonb_build_object('credit_id', c.id, 'amount', a.amount));
  RETURN jsonb_build_object('id', a.id, 'amount', a.amount);
END $$;

CREATE OR REPLACE FUNCTION public.fin_scr_void(_id uuid, _expect_rev integer, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_supplier_credits; al numeric;
BEGIN
  SELECT * INTO c FROM public.fin_supplier_credits WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_correct(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF _expect_rev IS DISTINCT FROM c.rev THEN RAISE EXCEPTION 'Conflit : rechargez le crédit' USING ERRCODE='P0409'; END IF;
  IF c.status = 'void' THEN RAISE EXCEPTION 'Déjà annulé' USING ERRCODE='P0409'; END IF;
  al := public.fin_credit_allocated(c.id);
  IF al > 0 THEN RAISE EXCEPTION 'Affectations actives (% $) : annulez-les d''abord', al USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_supplier_credits SET status = 'void', void_reason = btrim(_reason), voided_at = now(), voided_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO c;
  PERFORM public.fin_scr_log(c, NULL, 'void', _reason, NULL);
  RETURN jsonb_build_object('id', c.id, 'status', c.status);
END $$;

CREATE OR REPLACE FUNCTION public.fin_scr_list(_company uuid, _supplier uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'supplier_id', s.supplier_id, 'supplier', cl.name, 'reference', s.reference, 'doc_date', s.doc_date,
      'status', s.status, 'total', s.total, 'tax_status', s.tax_status, 'linked_bill_id', s.linked_bill_id, 'file_id', s.file_id,
      'allocated', CASE WHEN s.status='confirmed' THEN public.fin_credit_allocated(s.id) ELSE 0 END,
      'available', CASE WHEN s.status='confirmed' THEN s.total - public.fin_credit_allocated(s.id) END,
      'created_at', s.created_at) ORDER BY s.created_at DESC), '[]')
    FROM public.fin_supplier_credits s JOIN public.ent_crm_clients cl ON cl.id = s.supplier_id
    WHERE s.company_id = _company AND (_supplier IS NULL OR s.supplier_id = _supplier));
END $$;

CREATE OR REPLACE FUNCTION public.fin_supplier_detail(_company uuid, _supplier uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.ent_crm_clients; p public.fin_supplier_profiles; pays jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.ent_crm_clients WHERE id = _supplier AND company_id = _company;
  SELECT * INTO p FROM public.fin_supplier_profiles WHERE client_id = _supplier AND company_id = _company;
  IF c.id IS NULL OR p.client_id IS NULL THEN RAISE EXCEPTION 'Fournisseur introuvable' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'paid_on', x.paid_on, 'amount', x.amount, 'status', x.status, 'method', x.method, 'reference', x.reference) ORDER BY x.paid_on DESC), '[]') INTO pays
  FROM (SELECT * FROM public.fin_payments WHERE company_id = _company AND payee_key = 'c:'||_supplier ORDER BY paid_on DESC LIMIT 100) x;
  RETURN jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email, 'address', c.address, 'city', c.city, 'synced', c.jsc_client_id IS NOT NULL,
    'account_ref', p.account_ref, 'payment_terms', p.payment_terms, 'internal_notes', p.internal_notes, 'archived_at', p.archived_at,
    'created_at', p.created_at, 'updated_at', p.updated_at, 'payments', pays, 'credits_supported', true, 'credits', public.fin_scr_list(_company, _supplier));
END $$;

REVOKE ALL ON FUNCTION public.fin_bill_position(uuid), public.fin_scr_save(uuid,uuid,jsonb,integer,text), public.fin_scr_confirm(uuid,integer,text,text),
  public.fin_scr_alloc(uuid,uuid,numeric,text), public.fin_scr_alloc_void(uuid,text), public.fin_scr_void(uuid,integer,text), public.fin_scr_list(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_bill_position(uuid), public.fin_scr_save(uuid,uuid,jsonb,integer,text), public.fin_scr_confirm(uuid,integer,text,text),
  public.fin_scr_alloc(uuid,uuid,numeric,text), public.fin_scr_alloc_void(uuid,text), public.fin_scr_void(uuid,integer,text), public.fin_scr_list(uuid,uuid) TO authenticated;
