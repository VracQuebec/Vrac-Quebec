CREATE TABLE public.fin_invoice_settings (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT 'F-' CHECK (length(prefix) <= 12),
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  logo_path text,
  brand_color text CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  footer text CHECK (footer IS NULL OR length(footer) <= 600),
  default_terms text,
  template_key text NOT NULL DEFAULT 'standard',
  custom_template_ref text,
  template_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.fin_invoice_settings.custom_template_ref IS 'Emplacement réservé : modèle sur mesure par entreprise (aucun éditeur ni tarif en FIN-08)';
GRANT SELECT, INSERT, UPDATE ON public.fin_invoice_settings TO authenticated;
GRANT ALL ON public.fin_invoice_settings TO service_role;
ALTER TABLE public.fin_invoice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.fin_invoice_settings FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "i" ON public.fin_invoice_settings FOR INSERT TO authenticated WITH CHECK (public.fin_can_write(company_id));
CREATE POLICY "u" ON public.fin_invoice_settings FOR UPDATE TO authenticated USING (public.fin_can_write(company_id)) WITH CHECK (public.fin_can_write(company_id));

CREATE TABLE public.fin_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emise')),
  number text, seq integer,
  client_id uuid REFERENCES public.ent_crm_clients(id),
  client_name text, client_address text, client_email text, client_phone text,
  project_id uuid REFERENCES public.ent_crm_projects(id),
  quote_id uuid REFERENCES public.ent_crm_quotes(id),
  issue_date date, due_date date, terms text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  prices_include_tax boolean NOT NULL DEFAULT false,
  tax_snapshot jsonb, subtotal numeric, total numeric,
  seller_snapshot jsonb, client_snapshot jsonb, template_snapshot jsonb,
  is_test boolean NOT NULL DEFAULT false,
  private_note text,
  expected_inflow_id uuid REFERENCES public.fin_expected_inflows(id),
  credit_of uuid REFERENCES public.fin_invoices(id),
  pdf_path text,
  issued_at timestamptz, issued_by uuid,
  sent_at timestamptz, sent_note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.fin_invoices.credit_of IS 'Lien réservé aux futures notes de crédit (FIN-09+)';
COMMENT ON COLUMN public.fin_invoices.private_note IS 'Note interne : jamais affichée dans le document client';
CREATE UNIQUE INDEX fin_invoices_number_uq ON public.fin_invoices(company_id, number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX fin_invoices_quote_uq ON public.fin_invoices(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX fin_invoices_company_idx ON public.fin_invoices(company_id, status, issue_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_invoices TO authenticated;
GRANT ALL ON public.fin_invoices TO service_role;
ALTER TABLE public.fin_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.fin_invoices FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "i" ON public.fin_invoices FOR INSERT TO authenticated WITH CHECK (public.fin_can_write(company_id) AND status = 'brouillon');
CREATE POLICY "u" ON public.fin_invoices FOR UPDATE TO authenticated USING (public.fin_can_write(company_id)) WITH CHECK (public.fin_can_write(company_id));
CREATE POLICY "d" ON public.fin_invoices FOR DELETE TO authenticated USING (public.fin_can_write(company_id) AND status = 'brouillon');

ALTER TABLE public.fin_expected_inflows ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.fin_invoices(id);
CREATE UNIQUE INDEX IF NOT EXISTS fin_expected_inflows_invoice_uq ON public.fin_expected_inflows(invoice_id) WHERE invoice_id IS NOT NULL;

-- Garde : brouillon recalculé côté serveur ; facture émise figée
CREATE OR REPLACE FUNCTION public.fin_invoice_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s ent_crm_settings; r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'brouillon' THEN RAISE EXCEPTION 'Facture émise : suppression impossible (une note de crédit sera requise)'; END IF;
    RETURN OLD;
  END IF;
  IF current_setting('fin.invoice_issue', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.company_id IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.company_id ELSE NEW.company_id END) THEN RAISE EXCEPTION 'Entreprise non modifiable'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'emise' THEN
    IF (to_jsonb(NEW) - 'sent_at' - 'sent_note' - 'pdf_path' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'sent_at' - 'sent_note' - 'pdf_path' - 'updated_at') THEN
      RAISE EXCEPTION 'Facture émise : non modifiable (une note de crédit sera requise)';
    END IF;
    IF OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path THEN RAISE EXCEPTION 'PDF figé'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'brouillon' THEN RAISE EXCEPTION 'Émission : utilisez l''action « Émettre »'; END IF;
  NEW.number := NULL; NEW.seq := NULL; NEW.seller_snapshot := NULL; NEW.client_snapshot := NULL; NEW.template_snapshot := NULL;
  NEW.issued_at := NULL; NEW.issued_by := NULL; NEW.sent_at := NULL; NEW.pdf_path := NULL; NEW.expected_inflow_id := NULL;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id = NEW.client_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Client d''une autre entreprise'; END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_projects WHERE id = NEW.project_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Chantier d''une autre entreprise'; END IF;
  IF NEW.quote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_quotes WHERE id = NEW.quote_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Soumission d''une autre entreprise'; END IF;
  SELECT * INTO s FROM ent_crm_settings WHERE company_id = NEW.company_id;
  r := public.fin_tax_compute(NEW.lines, NEW.prices_include_tax, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), coalesce(NEW.issue_date, (now() AT TIME ZONE 'America/Toronto')::date));
  NEW.tax_snapshot := r || jsonb_build_object('final', false);
  NEW.subtotal := coalesce((r->>'pre_tax')::numeric, (r->>'subtotal')::numeric - (r->>'discount')::numeric);
  NEW.total := (r->>'total')::numeric;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fin_invoice_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_invoices FOR EACH ROW EXECUTE FUNCTION public.fin_invoice_guard();

-- Entrée attendue liée : montant piloté par la facture, encaissements conservés
CREATE OR REPLACE FUNCTION public.fin_inflow_invoice_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('fin.invoice_issue', true) = 'on' THEN RETURN NEW; END IF;
  IF OLD.invoice_id IS NOT NULL AND (NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.certainty IS DISTINCT FROM OLD.certainty OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Entrée liée à une facture émise : montant fixé par la facture';
  END IF;
  IF OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Liaison à une facture : par l''émission seulement'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fin_inflow_invoice_guard BEFORE UPDATE ON public.fin_expected_inflows FOR EACH ROW EXECUTE FUNCTION public.fin_inflow_invoice_guard();

-- Conversion d'une soumission acceptée (idempotente, une seule facture par soumission)
CREATE OR REPLACE FUNCTION public.fin_invoice_from_quote(_quote_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; c ent_crm_clients; v uuid;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote_id;
  IF q.id IS NULL OR NOT public.fin_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF q.status <> 'acceptee' THEN RAISE EXCEPTION 'Seule une soumission acceptée peut être facturée'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_inv_quote:' || _quote_id::text));
  SELECT id INTO v FROM fin_invoices WHERE quote_id = _quote_id;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT * INTO c FROM ent_crm_clients WHERE id = q.client_id;
  INSERT INTO fin_invoices (company_id, quote_id, client_id, client_name, client_email, client_phone, client_address, lines, prices_include_tax, terms, created_by)
  VALUES (q.company_id, q.id, q.client_id, c.name, c.email, c.phone, NULL, q.lines, q.prices_include_tax, q.conditions, auth.uid())
  RETURNING id INTO v;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_invoice_from_quote(uuid) TO authenticated;

-- Émission : numéro unique attribué sous verrou, figé, idempotent
CREATE OR REPLACE FUNCTION public.fin_invoice_issue(_id uuid, _replace_inflow uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; s ent_crm_settings; st fin_invoice_settings; co jsc_companies; r jsonb; n integer; num text; inf uuid; today date := (now() AT TIME ZONE 'America/Toronto')::date; d date;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _id FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF i.status = 'emise' THEN RETURN jsonb_build_object('id', i.id, 'number', i.number, 'already', true); END IF;
  IF coalesce(i.client_name,'') = '' THEN RAISE EXCEPTION 'Client requis : nom du client à compléter'; END IF;
  IF jsonb_array_length(i.lines) = 0 THEN RAISE EXCEPTION 'Ajoutez au moins une ligne'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(i.lines) l WHERE coalesce(l->>'qty','') = '' OR coalesce(l->>'price','') = '') THEN RAISE EXCEPTION 'Ligne sans quantité ou prix'; END IF;
  d := coalesce(i.issue_date, today);
  SELECT * INTO s FROM ent_crm_settings WHERE company_id = i.company_id;
  r := public.fin_tax_compute(i.lines, i.prices_include_tax, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), d);
  IF NOT (r->>'resolved')::boolean THEN
    RAISE EXCEPTION 'Taxes à déterminer : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; ');
  END IF;
  INSERT INTO fin_invoice_settings(company_id) VALUES (i.company_id) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM fin_invoice_settings WHERE company_id = i.company_id FOR UPDATE;
  n := st.next_number; num := st.prefix || lpad(n::text, 5, '0');
  WHILE EXISTS (SELECT 1 FROM fin_invoices WHERE company_id = i.company_id AND number = num) LOOP n := n + 1; num := st.prefix || lpad(n::text, 5, '0'); END LOOP;
  UPDATE fin_invoice_settings SET next_number = n + 1 WHERE company_id = i.company_id;
  SELECT * INTO co FROM jsc_companies WHERE id = i.company_id;
  PERFORM set_config('fin.invoice_issue', 'on', true);
  IF _replace_inflow IS NOT NULL THEN
    UPDATE fin_expected_inflows SET invoice_id = i.id, amount = (r->>'total')::numeric, certainty = 'certain', kind = 'revenue',
      expected_on = coalesce(i.due_date, d), counterparty = i.client_name, updated_at = now()
    WHERE id = _replace_inflow AND company_id = i.company_id AND invoice_id IS NULL AND archived_at IS NULL RETURNING id INTO inf;
    IF inf IS NULL THEN RAISE EXCEPTION 'Prévision à remplacer introuvable ou déjà liée'; END IF;
  ELSE
    INSERT INTO fin_expected_inflows (company_id, amount, received, expected_on, counterparty, certainty, kind, note, invoice_id)
    VALUES (i.company_id, (r->>'total')::numeric, 0, coalesce(i.due_date, d), i.client_name, 'certain', 'revenue', 'Facture ' || num, i.id) RETURNING id INTO inf;
  END IF;
  UPDATE fin_invoices SET status = 'emise', number = num, seq = n, issue_date = d, issued_at = now(), issued_by = auth.uid(),
    tax_snapshot = r || jsonb_build_object('final', true),
    subtotal = (r->>'pre_tax')::numeric, total = (r->>'total')::numeric, expected_inflow_id = inf,
    seller_snapshot = jsonb_build_object('name', co.name, 'legal_name', co.legal_name, 'address', co.address, 'phone', co.phone, 'email', co.email,
      'gst_number', CASE WHEN s.gst_status='inscrit' THEN s.gst_number END, 'qst_number', CASE WHEN s.qst_status='inscrit' THEN s.qst_number END),
    client_snapshot = jsonb_build_object('name', i.client_name, 'address', i.client_address, 'email', i.client_email, 'phone', i.client_phone),
    template_snapshot = jsonb_build_object('key', st.template_key, 'version', st.template_version, 'logo_path', st.logo_path, 'color', st.brand_color, 'footer', st.footer, 'custom_ref', st.custom_template_ref),
    updated_at = now()
  WHERE id = i.id;
  RETURN jsonb_build_object('id', i.id, 'number', num, 'already', false);
END $$;
GRANT EXECUTE ON FUNCTION public.fin_invoice_issue(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_invoice_mark_sent(_id uuid, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _id;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF i.status <> 'emise' THEN RAISE EXCEPTION 'Émettez d''abord la facture'; END IF;
  UPDATE fin_invoices SET sent_at = coalesce(sent_at, now()), sent_note = left(_note, 300) WHERE id = _id;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_invoice_mark_sent(uuid, text) TO authenticated;

-- Stockage privé : logos et PDF par entreprise (premier dossier = entreprise)
CREATE POLICY "fin_inv_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fin-invoices' AND public.fin_can_read(((storage.foldername(name))[1])::uuid));
CREATE POLICY "fin_inv_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fin-invoices' AND public.fin_can_write(((storage.foldername(name))[1])::uuid));