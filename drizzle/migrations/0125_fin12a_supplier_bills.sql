-- FIN-12A — Fournisseurs, factures d'achat et justificatifs.
-- Fournisseur = fiche ent_crm_clients existante + profil d'achat (aucun doublon d'identité).
-- Facture fournisseur = document; la dette reste UNE occurrence fin_occurrences (aucun 2e registre).
-- Règlements = fin_payments / fin_allocations existants.

CREATE TABLE public.fin_supplier_profiles (
  client_id uuid PRIMARY KEY REFERENCES public.ent_crm_clients(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  account_ref text,
  payment_terms text,
  internal_notes text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_supplier_profiles TO authenticated;
GRANT ALL ON public.fin_supplier_profiles TO service_role;
ALTER TABLE public.fin_supplier_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_sup_read ON public.fin_supplier_profiles FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_supplier_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.ent_crm_clients(id),
  doc_type text NOT NULL DEFAULT 'facture' CHECK (doc_type IN ('facture')),
  reference text,
  doc_date date,
  due_date date,
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency = 'CAD'),
  description text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_id uuid,
  truck_id uuid,
  project_id uuid,
  subtotal numeric(14,2),
  gst numeric(14,2),
  qst numeric(14,2),
  total numeric(14,2),
  tax_status text NOT NULL DEFAULT 'a_completer' CHECK (tax_status IN ('detaillee','a_completer')),
  file_id uuid REFERENCES public.ent_crm_files(id),
  file_sha256 text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','void')),
  obligation_id uuid REFERENCES public.fin_obligations(id),
  occurrence_id uuid REFERENCES public.fin_occurrences(id),
  replaced_estimate boolean NOT NULL DEFAULT false,
  estimate_amount numeric(14,2),
  estimate_quality text,
  dup_override_reason text,
  void_reason text,
  create_key text,
  confirm_key text,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  CHECK (total IS NULL OR total >= 0),
  CHECK (status = 'draft' OR (total IS NOT NULL AND occurrence_id IS NOT NULL AND supplier_id IS NOT NULL))
);
CREATE UNIQUE INDEX fin_sb_create_key ON public.fin_supplier_bills(company_id, create_key) WHERE create_key IS NOT NULL;
CREATE UNIQUE INDEX fin_sb_occ_confirmed ON public.fin_supplier_bills(occurrence_id) WHERE status = 'confirmed';
CREATE INDEX fin_sb_company ON public.fin_supplier_bills(company_id, supplier_id, status);
CREATE INDEX fin_sb_sha ON public.fin_supplier_bills(company_id, file_sha256) WHERE file_sha256 IS NOT NULL;
GRANT SELECT ON public.fin_supplier_bills TO authenticated;
GRANT ALL ON public.fin_supplier_bills TO service_role;
ALTER TABLE public.fin_supplier_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_sb_read ON public.fin_supplier_bills FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_supplier_bill_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bill_id uuid NOT NULL REFERENCES public.fin_supplier_bills(id),
  action text NOT NULL,
  reason text,
  detail jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_supplier_bill_events TO authenticated;
GRANT ALL ON public.fin_supplier_bill_events TO service_role;
ALTER TABLE public.fin_supplier_bill_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_sbe_read ON public.fin_supplier_bill_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE OR REPLACE FUNCTION public.fin_sbe_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Journal en ajout seulement' USING ERRCODE='42501'; END $$;
CREATE TRIGGER fin_sbe_no_change BEFORE UPDATE OR DELETE ON public.fin_supplier_bill_events FOR EACH ROW EXECUTE FUNCTION public.fin_sbe_append_only();

CREATE OR REPLACE FUNCTION public.fin_sb_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); NEW.updated_at := now();
  ELSE NEW.created_at := OLD.created_at; NEW.updated_at := now(); NEW.company_id := OLD.company_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_sb_stamp BEFORE INSERT OR UPDATE ON public.fin_supplier_bills FOR EACH ROW EXECUTE FUNCTION public.fin_sb_stamp();
CREATE TRIGGER fin_sp_stamp BEFORE INSERT OR UPDATE ON public.fin_supplier_profiles FOR EACH ROW EXECUTE FUNCTION public.fin_sb_stamp();

CREATE OR REPLACE FUNCTION public.fin_sb_log(_b public.fin_supplier_bills, _action text, _reason text, _detail jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fin_supplier_bill_events(company_id, bill_id, action, reason, detail, actor_id)
  VALUES (_b.company_id, _b.id, _action, _reason, _detail, auth.uid());
$$;
REVOKE ALL ON FUNCTION public.fin_sb_log(public.fin_supplier_bills, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_supplier_save(_company uuid, _client uuid, _p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid := _client;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF cid IS NULL THEN
    IF coalesce(btrim(_p->>'name'),'') = '' THEN RAISE EXCEPTION 'Nom du fournisseur requis'; END IF;
    INSERT INTO public.ent_crm_clients(company_id, kind, name, phone, email, address, city, created_by)
    VALUES (_company, 'entreprise', btrim(_p->>'name'), nullif(btrim(_p->>'phone'),''), nullif(btrim(_p->>'email'),''), nullif(btrim(_p->>'address'),''), nullif(btrim(_p->>'city'),''), auth.uid())
    RETURNING id INTO cid;
  ELSE
    PERFORM 1 FROM public.ent_crm_clients WHERE id = cid AND company_id = _company FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fiche hors de cette entreprise' USING ERRCODE='42501'; END IF;
    IF _p ? 'name' THEN
      IF coalesce(btrim(_p->>'name'),'') = '' THEN RAISE EXCEPTION 'Nom du fournisseur requis'; END IF;
      UPDATE public.ent_crm_clients SET name = btrim(_p->>'name'), phone = nullif(btrim(_p->>'phone'),''), email = nullif(btrim(_p->>'email'),''),
        address = nullif(btrim(_p->>'address'),''), city = nullif(btrim(_p->>'city'),''), updated_at = now()
      WHERE id = cid AND jsc_client_id IS NULL;
    END IF;
  END IF;
  INSERT INTO public.fin_supplier_profiles(client_id, company_id, account_ref, payment_terms, internal_notes, created_by)
  VALUES (cid, _company, nullif(btrim(_p->>'account_ref'),''), nullif(btrim(_p->>'payment_terms'),''), nullif(btrim(_p->>'internal_notes'),''), auth.uid())
  ON CONFLICT (client_id) DO UPDATE SET
    account_ref = CASE WHEN _p ? 'account_ref' THEN EXCLUDED.account_ref ELSE fin_supplier_profiles.account_ref END,
    payment_terms = CASE WHEN _p ? 'payment_terms' THEN EXCLUDED.payment_terms ELSE fin_supplier_profiles.payment_terms END,
    internal_notes = CASE WHEN _p ? 'internal_notes' THEN EXCLUDED.internal_notes ELSE fin_supplier_profiles.internal_notes END,
    archived_at = CASE WHEN _p ? 'archived' THEN (CASE WHEN (_p->>'archived')::boolean THEN coalesce(fin_supplier_profiles.archived_at, now()) END) ELSE fin_supplier_profiles.archived_at END;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.fin_sb_check(_company uuid, _p jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _p->>'supplier_id' IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_supplier_profiles WHERE client_id = (_p->>'supplier_id')::uuid AND company_id = _company) THEN
    RAISE EXCEPTION 'Fournisseur hors de cette entreprise' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_check_links(_company, jsonb_strip_nulls(jsonb_build_object('category_id', _p->>'category_id', 'truck_id', _p->>'truck_id', 'project_id', _p->>'project_id', 'document_id', _p->>'file_id')));
  IF coalesce(_p->>'currency','CAD') <> 'CAD' THEN RAISE EXCEPTION 'Devise non prise en charge (CAD seulement)'; END IF;
  IF coalesce(nullif(_p->>'total','')::numeric, 0) < 0 OR coalesce(nullif(_p->>'subtotal','')::numeric,0) < 0 OR coalesce(nullif(_p->>'gst','')::numeric,0) < 0 OR coalesce(nullif(_p->>'qst','')::numeric,0) < 0 THEN
    RAISE EXCEPTION 'Montant négatif refusé'; END IF;
  IF _p->>'file_sha256' IS NOT NULL AND (_p->>'file_sha256') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Empreinte de fichier invalide'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fin_sb_check(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_bill_save(_company uuid, _id uuid, _p jsonb, _base_rev integer, _create_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.fin_supplier_bills; ts text;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_sb_check(_company, _p);
  ts := CASE WHEN nullif(_p->>'gst','') IS NOT NULL AND nullif(_p->>'qst','') IS NOT NULL AND nullif(_p->>'subtotal','') IS NOT NULL THEN 'detaillee' ELSE 'a_completer' END;
  IF _id IS NULL THEN
    IF _create_key IS NOT NULL THEN
      SELECT * INTO b FROM public.fin_supplier_bills WHERE company_id = _company AND create_key = _create_key;
      IF b.id IS NOT NULL THEN RETURN jsonb_build_object('id', b.id, 'rev', b.rev, 'replay', true); END IF;
    END IF;
    INSERT INTO public.fin_supplier_bills(company_id, supplier_id, reference, doc_date, due_date, currency, description, lines, category_id, truck_id, project_id,
      subtotal, gst, qst, total, tax_status, file_id, file_sha256, create_key, created_by)
    VALUES (_company, (_p->>'supplier_id')::uuid, nullif(btrim(_p->>'reference'),''), nullif(_p->>'doc_date','')::date, nullif(_p->>'due_date','')::date, 'CAD',
      nullif(btrim(_p->>'description'),''), coalesce(_p->'lines','[]'::jsonb), nullif(_p->>'category_id','')::uuid, nullif(_p->>'truck_id','')::uuid, nullif(_p->>'project_id','')::uuid,
      nullif(_p->>'subtotal','')::numeric, nullif(_p->>'gst','')::numeric, nullif(_p->>'qst','')::numeric, nullif(_p->>'total','')::numeric, ts,
      nullif(_p->>'file_id','')::uuid, nullif(_p->>'file_sha256',''), _create_key, auth.uid())
    ON CONFLICT (company_id, create_key) WHERE create_key IS NOT NULL DO NOTHING
    RETURNING * INTO b;
    IF b.id IS NULL THEN
      SELECT * INTO b FROM public.fin_supplier_bills WHERE company_id = _company AND create_key = _create_key;
      RETURN jsonb_build_object('id', b.id, 'rev', b.rev, 'replay', true);
    END IF;
    PERFORM public.fin_sb_log(b, 'draft_create', NULL, NULL);
    RETURN jsonb_build_object('id', b.id, 'rev', b.rev);
  END IF;
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _id AND company_id = _company FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Facture introuvable' USING ERRCODE='42501'; END IF;
  IF b.status <> 'draft' THEN RAISE EXCEPTION 'Facture confirmée : utilisez l''annulation motivée puis une nouvelle saisie' USING ERRCODE='P0409'; END IF;
  IF _base_rev IS DISTINCT FROM b.rev THEN RAISE EXCEPTION 'Conflit : ce brouillon a été modifié ailleurs. Rechargez.' USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_supplier_bills SET supplier_id = (_p->>'supplier_id')::uuid, reference = nullif(btrim(_p->>'reference'),''), doc_date = nullif(_p->>'doc_date','')::date,
    due_date = nullif(_p->>'due_date','')::date, description = nullif(btrim(_p->>'description'),''), lines = coalesce(_p->'lines','[]'::jsonb),
    category_id = nullif(_p->>'category_id','')::uuid, truck_id = nullif(_p->>'truck_id','')::uuid, project_id = nullif(_p->>'project_id','')::uuid,
    subtotal = nullif(_p->>'subtotal','')::numeric, gst = nullif(_p->>'gst','')::numeric, qst = nullif(_p->>'qst','')::numeric, total = nullif(_p->>'total','')::numeric,
    tax_status = ts, file_id = nullif(_p->>'file_id','')::uuid, file_sha256 = nullif(_p->>'file_sha256',''), rev = rev + 1
  WHERE id = _id RETURNING * INTO b;
  RETURN jsonb_build_object('id', b.id, 'rev', b.rev);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bill_dups(_company uuid, _id uuid, _p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ex jsonb; pr jsonb; sup uuid := nullif(_p->>'supplier_id','')::uuid; ref text := lower(nullif(btrim(_p->>'reference'),''));
  sha text := nullif(_p->>'file_sha256',''); fid uuid := nullif(_p->>'file_id','')::uuid; tot numeric := nullif(_p->>'total','')::numeric; dd date := nullif(_p->>'doc_date','')::date;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'reference', b.reference, 'status', b.status, 'total', b.total, 'doc_date', b.doc_date,
      'why', CASE WHEN b.supplier_id = sup AND lower(b.reference) = ref THEN 'reference' ELSE 'fichier' END)), '[]') INTO ex
  FROM public.fin_supplier_bills b
  WHERE b.company_id = _company AND b.id IS DISTINCT FROM _id AND b.status <> 'void'
    AND ((sup IS NOT NULL AND ref IS NOT NULL AND b.supplier_id = sup AND lower(b.reference) = ref AND b.doc_type = coalesce(_p->>'doc_type','facture'))
      OR (sha IS NOT NULL AND b.file_sha256 = sha) OR (fid IS NOT NULL AND b.file_id = fid));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'reference', b.reference, 'status', b.status, 'total', b.total, 'doc_date', b.doc_date,
      'why', CASE WHEN b.supplier_id = sup THEN 'même fournisseur, montant et date proches' ELSE 'même référence, autre fournisseur' END)), '[]') INTO pr
  FROM public.fin_supplier_bills b
  WHERE b.company_id = _company AND b.id IS DISTINCT FROM _id AND b.status <> 'void'
    AND NOT (sup IS NOT NULL AND ref IS NOT NULL AND b.supplier_id = sup AND coalesce(lower(b.reference) = ref, false))
    AND NOT coalesce(sha IS NOT NULL AND b.file_sha256 = sha, false) AND NOT coalesce(fid IS NOT NULL AND b.file_id = fid, false)
    AND ((b.supplier_id = sup AND tot IS NOT NULL AND b.total = tot AND dd IS NOT NULL AND b.doc_date BETWEEN dd - 7 AND dd + 7)
      OR (ref IS NOT NULL AND lower(b.reference) = ref AND b.supplier_id <> sup));
  RETURN jsonb_build_object('exact', ex, 'probable', pr);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bill_preview(_id uuid, _occ uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.fin_supplier_bills; oc public.fin_occurrences; paid numeric := 0; ob public.fin_obligations; taken uuid;
BEGIN
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _id;
  IF b.id IS NULL OR NOT public.fin_can_read(b.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _occ IS NULL THEN
    RETURN jsonb_build_object('mode','new','estimate',NULL,'real',b.total,'diff',NULL,'paid',0,'rest',b.total,'overpaid',0);
  END IF;
  SELECT * INTO oc FROM public.fin_occurrences WHERE id = _occ AND company_id = b.company_id;
  IF oc.id IS NULL THEN RAISE EXCEPTION 'Échéance hors de cette entreprise' USING ERRCODE='42501'; END IF;
  SELECT * INTO ob FROM public.fin_obligations WHERE id = oc.obligation_id;
  SELECT id INTO taken FROM public.fin_supplier_bills WHERE occurrence_id = _occ AND status = 'confirmed' AND id <> _id;
  paid := public.fin_occ_paid(_occ);
  RETURN jsonb_build_object('mode','replace','occ_id',oc.id,'label',ob.label,'due_date',oc.due_date,'status',oc.status,'taken_by',taken,
    'estimate',oc.amount,'estimate_quality',oc.amount_quality,'real',b.total,'diff',CASE WHEN oc.amount IS NULL OR b.total IS NULL THEN NULL ELSE b.total - oc.amount END,
    'paid',paid,'rest',greatest(coalesce(b.total,0) - paid,0),'overpaid',greatest(paid - coalesce(b.total,0),0),
    'payee_match', ob.payee_client_id IS NULL OR ob.payee_client_id = b.supplier_id);
END $$;

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
      RAISE EXCEPTION 'Trop-payé : % $ déjà réglés sur cette échéance pour une facture de % $. Retirez d''abord l''affectation excédentaire (elle deviendra un reliquat visible du règlement).', paid, b.total USING ERRCODE='P0409';
    END IF;
    UPDATE public.fin_occurrences SET amount = b.total, amount_quality = 'confirmed', amount_override = true, updated_at = now() WHERE id = _occ;
    PERFORM public.fin_log(b.company_id, oc.obligation_id, _occ, 'bill_replace', 'Facture fournisseur '||b.reference,
      jsonb_build_object('amount', oc.amount, 'quality', oc.amount_quality), jsonb_build_object('amount', b.total, 'quality', 'confirmed', 'bill_id', b.id));
    UPDATE public.fin_supplier_bills SET status = 'confirmed', occurrence_id = _occ, obligation_id = oc.obligation_id, replaced_estimate = true,
      estimate_amount = oc.amount, estimate_quality = oc.amount_quality, confirm_key = _key, dup_override_reason = nullif(btrim(_dup_reason),''),
      confirmed_at = now(), confirmed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO b;
  ELSE
    anc := coalesce(b.due_date, b.doc_date);
    SELECT name INTO sup FROM public.ent_crm_clients WHERE id = b.supplier_id;
    oid := public.fin_save_obligation(b.company_id, NULL, jsonb_strip_nulls(jsonb_build_object('label', 'Facture '||sup||' '||b.reference, 'payee_client_id', b.supplier_id,
      'category_id', b.category_id, 'truck_id', b.truck_id, 'project_id', b.project_id, 'document_id', b.file_id, 'frequency', 'once', 'anchor_date', anc,
      'amount', b.total, 'amount_quality', 'confirmed', 'nature', 'dette', 'contract_ref', b.reference)));
    UPDATE public.fin_obligations SET source_document_id = b.id WHERE id = oid;
    PERFORM public.fin_ensure_occurrences(b.company_id, anc, anc);
    SELECT * INTO oc FROM public.fin_occurrences WHERE obligation_id = oid AND status = 'active' ORDER BY due_date LIMIT 1;
    IF oc.id IS NULL THEN RAISE EXCEPTION 'Échéance non générée'; END IF;
    UPDATE public.fin_supplier_bills SET status = 'confirmed', occurrence_id = oc.id, obligation_id = oid, replaced_estimate = false, confirm_key = _key,
      dup_override_reason = nullif(btrim(_dup_reason),''), confirmed_at = now(), confirmed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO b;
  END IF;
  PERFORM public.fin_sb_log(b, 'confirm', b.dup_override_reason, jsonb_build_object('occurrence_id', b.occurrence_id, 'replaced', b.replaced_estimate,
    'estimate', b.estimate_amount, 'total', b.total, 'dups', d));
  RETURN jsonb_build_object('id', b.id, 'occurrence_id', b.occurrence_id, 'obligation_id', b.obligation_id);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bill_void(_id uuid, _expect_rev integer, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.fin_supplier_bills; paid numeric;
BEGIN
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _id FOR UPDATE;
  IF b.id IS NULL OR NOT public.fin_can_correct(b.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF _expect_rev IS DISTINCT FROM b.rev THEN RAISE EXCEPTION 'Conflit : rechargez la facture' USING ERRCODE='P0409'; END IF;
  IF b.status = 'void' THEN RAISE EXCEPTION 'Déjà annulée' USING ERRCODE='P0409'; END IF;
  IF b.status = 'confirmed' THEN
    PERFORM 1 FROM public.fin_occurrences WHERE id = b.occurrence_id FOR UPDATE;
    paid := public.fin_occ_paid(b.occurrence_id);
    IF b.replaced_estimate THEN
      UPDATE public.fin_occurrences SET amount = b.estimate_amount, amount_quality = b.estimate_quality, updated_at = now() WHERE id = b.occurrence_id;
      PERFORM public.fin_log(b.company_id, b.obligation_id, b.occurrence_id, 'bill_void', _reason, jsonb_build_object('amount', b.total), jsonb_build_object('amount', b.estimate_amount, 'quality', b.estimate_quality));
    ELSE
      IF paid > 0 THEN RAISE EXCEPTION 'Règlements affectés (% $) : retirez d''abord ces affectations', paid USING ERRCODE='P0409'; END IF;
      PERFORM public.fin_cancel_occurrence(b.occurrence_id, 'Facture fournisseur annulée : '||_reason);
    END IF;
  END IF;
  UPDATE public.fin_supplier_bills SET status = 'void', void_reason = btrim(_reason), voided_at = now(), voided_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO b;
  PERFORM public.fin_sb_log(b, 'void', _reason, NULL);
  RETURN jsonb_build_object('id', b.id, 'status', b.status);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bills_overview(_company uuid, _f jsonb, _limit integer, _offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; tot jsonb; n int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  WITH base AS (
    SELECT b.id, b.supplier_id, c.name AS supplier, b.reference, b.doc_date, b.due_date, b.status, b.total, p.paid,
      CASE WHEN b.status = 'confirmed' THEN greatest(b.total - p.paid, 0) END AS rest, CASE WHEN b.status = 'confirmed' THEN greatest(p.paid - b.total, 0) END AS overpaid,
      b.tax_status, b.replaced_estimate AS replaced, b.estimate_amount AS estimate, b.occurrence_id, b.file_id, b.created_at, b.updated_at
    FROM public.fin_supplier_bills b JOIN public.ent_crm_clients c ON c.id = b.supplier_id
    CROSS JOIN LATERAL (SELECT CASE WHEN b.occurrence_id IS NOT NULL THEN public.fin_occ_paid(b.occurrence_id) ELSE 0 END AS paid) p
    WHERE b.company_id = _company
      AND (nullif(_f->>'supplier_id','') IS NULL OR b.supplier_id = (_f->>'supplier_id')::uuid)
      AND (CASE coalesce(_f->>'status','active') WHEN 'all' THEN true WHEN 'active' THEN b.status <> 'void' ELSE b.status = _f->>'status' END)
      AND (nullif(_f->>'q','') IS NULL OR c.name ILIKE '%'||(_f->>'q')||'%' OR b.reference ILIKE '%'||(_f->>'q')||'%')
  ), agg AS (
    SELECT count(*)::int AS n, jsonb_build_object('count', count(*),
      'confirmed_total', coalesce(sum(total) FILTER (WHERE status='confirmed'),0),
      'paid', coalesce(sum(paid) FILTER (WHERE status='confirmed'),0),
      'rest', coalesce(sum(rest) FILTER (WHERE status='confirmed'),0),
      'rest_due_known', coalesce(sum(rest) FILTER (WHERE status='confirmed' AND due_date IS NOT NULL),0),
      'rest_due_unknown', coalesce(sum(rest) FILTER (WHERE status='confirmed' AND due_date IS NULL),0),
      'overpaid', coalesce(sum(overpaid) FILTER (WHERE status='confirmed'),0),
      'drafts', count(*) FILTER (WHERE status='draft'),
      'tax_incomplete', count(*) FILTER (WHERE status<>'void' AND tax_status='a_completer')) AS t FROM base
  ), pg AS (SELECT * FROM base ORDER BY created_at DESC, id LIMIT greatest(least(coalesce(_limit,25),200),1) OFFSET greatest(coalesce(_offset,0),0))
  SELECT agg.n, agg.t, (SELECT coalesce(jsonb_agg(to_jsonb(pg) ORDER BY pg.created_at DESC, pg.id), '[]') FROM pg) INTO n, tot, res FROM agg;
  RETURN jsonb_build_object('rows', res, 'totals', tot, 'total', n);
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
    'created_at', p.created_at, 'updated_at', p.updated_at, 'payments', pays, 'credits_supported', false);
END $$;

REVOKE ALL ON FUNCTION public.fin_supplier_save(uuid,uuid,jsonb), public.fin_bill_save(uuid,uuid,jsonb,integer,text), public.fin_bill_dups(uuid,uuid,jsonb),
  public.fin_bill_preview(uuid,uuid), public.fin_bill_confirm(uuid,uuid,integer,text,text), public.fin_bill_void(uuid,integer,text),
  public.fin_bills_overview(uuid,jsonb,integer,integer), public.fin_supplier_detail(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_supplier_save(uuid,uuid,jsonb), public.fin_bill_save(uuid,uuid,jsonb,integer,text), public.fin_bill_dups(uuid,uuid,jsonb),
  public.fin_bill_preview(uuid,uuid), public.fin_bill_confirm(uuid,uuid,integer,text,text), public.fin_bill_void(uuid,integer,text),
  public.fin_bills_overview(uuid,jsonb,integer,integer), public.fin_supplier_detail(uuid,uuid) TO authenticated;