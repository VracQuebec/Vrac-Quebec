ALTER TABLE public.fin_invoice_settings ADD COLUMN IF NOT EXISTS credit_prefix text NOT NULL DEFAULT 'NC-' CHECK (length(credit_prefix) <= 12);
ALTER TABLE public.fin_invoice_settings ADD COLUMN IF NOT EXISTS credit_next_number integer NOT NULL DEFAULT 1 CHECK (credit_next_number >= 1);

CREATE TABLE public.fin_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id),
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emise')),
  number text, seq integer,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  items jsonb NOT NULL DEFAULT '{"mode":"lines","lines":[]}'::jsonb,
  draft_key text NOT NULL,
  issue_key text,
  credit_snapshot jsonb,
  taxable_base numeric(14,2), zero_rated_base numeric(14,2), exempt_base numeric(14,2), gst numeric(14,2), qst numeric(14,2), total numeric(14,2),
  seller_snapshot jsonb, client_snapshot jsonb, invoice_snapshot jsonb, template_snapshot jsonb,
  pdf_path text,
  issued_at timestamptz, issued_by uuid,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, draft_key)
);
CREATE UNIQUE INDEX fin_credit_notes_number_uq ON public.fin_credit_notes(company_id, number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX fin_credit_notes_issue_uq ON public.fin_credit_notes(company_id, issue_key) WHERE issue_key IS NOT NULL;
CREATE INDEX fin_credit_notes_inv ON public.fin_credit_notes(invoice_id);
COMMENT ON TABLE public.fin_credit_notes IS 'FIN-09A : notes de crédit liées à une facture émise; écritures par RPC fin_credit_* seulement; émise = non modifiable, non supprimable';
GRANT SELECT ON public.fin_credit_notes TO authenticated;
GRANT ALL ON public.fin_credit_notes TO service_role;
ALTER TABLE public.fin_credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin credit read" ON public.fin_credit_notes FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

-- Calcul exact d'un avoir depuis l'instantané fiscal de la facture (jamais le profil actuel).
CREATE OR REPLACE FUNCTION public.fin_credit_compute(_invoice uuid, _items jsonb, _exclude uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; t jsonb; mode text := coalesce(_items->>'mode','lines');
  base_t numeric; base_z numeric; base_e numeric; g_inv numeric; q_inv numeric; gr numeric; qr numeric;
  c_t numeric; c_z numeric; c_e numeric; c_g numeric; c_q numeric;
  gross_t numeric := 0; gross_z numeric := 0; gross_e numeric := 0;
  sel_t numeric := 0; sel_z numeric := 0; sel_e numeric := 0;
  n_t numeric; n_z numeric; n_e numeric; n_g numeric; n_q numeric;
  ln jsonb; it jsonb; idx int; q numeric; lq numeric; lg numeric; tr text; done numeric; outl jsonb := '[]'::jsonb; errs text[] := '{}';
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR i.status <> 'emise' THEN RAISE EXCEPTION 'Note de crédit possible seulement sur une facture émise'; END IF;
  t := i.tax_snapshot;
  base_t := coalesce((t->>'taxable_base')::numeric,0); base_z := coalesce((t->>'zero_rated_base')::numeric,0); base_e := coalesce((t->>'exempt_base')::numeric,0);
  g_inv := coalesce((t->>'gst')::numeric,0); q_inv := coalesce((t->>'qst')::numeric,0);
  gr := coalesce((t->>'gst_rate')::numeric,0); qr := coalesce((t->>'qst_rate')::numeric,0);
  SELECT coalesce(sum(taxable_base),0), coalesce(sum(zero_rated_base),0), coalesce(sum(exempt_base),0), coalesce(sum(gst),0), coalesce(sum(qst),0)
    INTO c_t, c_z, c_e, c_g, c_q FROM fin_credit_notes WHERE invoice_id = _invoice AND status = 'emise' AND id IS DISTINCT FROM _exclude;

  IF mode = 'lines' THEN
    FOR ln, idx IN SELECT e, (o - 1)::int FROM jsonb_array_elements(i.lines) WITH ORDINALITY x(e, o) LOOP
      lg := round(coalesce((ln->>'qty')::numeric,0) * coalesce((ln->>'price')::numeric,0) * (1 - coalesce((ln->>'disc_pct')::numeric,0)/100), 2);
      tr := coalesce(ln->>'tax','a_determiner');
      IF tr = 'taxable' THEN gross_t := gross_t + lg; ELSIF tr = 'detaxe' THEN gross_z := gross_z + lg; ELSIF tr = 'exonere' THEN gross_e := gross_e + lg; END IF;
    END LOOP;
    FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_items->'lines','[]'::jsonb)) LOOP
      idx := (it->>'i')::int; q := coalesce((it->>'qty')::numeric,0);
      IF q <= 0 THEN CONTINUE; END IF;
      ln := i.lines -> idx;
      IF ln IS NULL THEN errs := errs || ('Ligne ' || idx || ' inconnue'); CONTINUE; END IF;
      lq := coalesce((ln->>'qty')::numeric,0);
      SELECT coalesce(sum((x->>'qty')::numeric),0) INTO done FROM fin_credit_notes cn, jsonb_array_elements(coalesce(cn.credit_snapshot->'lines','[]'::jsonb)) x
        WHERE cn.invoice_id = _invoice AND cn.status = 'emise' AND cn.id IS DISTINCT FROM _exclude AND (x->>'i')::int = idx;
      IF q > lq - done THEN errs := errs || format('Ligne %s : quantité créditée %s > disponible %s', idx + 1, q, lq - done); CONTINUE; END IF;
      lg := round(q * coalesce((ln->>'price')::numeric,0) * (1 - coalesce((ln->>'disc_pct')::numeric,0)/100), 2);
      IF q = lq THEN lg := round(lq * coalesce((ln->>'price')::numeric,0) * (1 - coalesce((ln->>'disc_pct')::numeric,0)/100), 2); END IF;
      tr := coalesce(ln->>'tax','a_determiner');
      IF tr = 'taxable' THEN sel_t := sel_t + lg; ELSIF tr = 'detaxe' THEN sel_z := sel_z + lg; ELSIF tr = 'exonere' THEN sel_e := sel_e + lg; END IF;
      outl := outl || jsonb_build_object('i', idx, 'qty', q, 'desc', ln->>'desc', 'unit', ln->>'unit', 'price', (ln->>'price')::numeric, 'disc_pct', (ln->>'disc_pct')::numeric, 'tax', tr, 'gross', lg);
    END LOOP;
    -- Conversion du montant de lignes (convention de prix de la facture) vers la base hors taxes figée.
    n_t := CASE WHEN gross_t = 0 THEN 0 WHEN sel_t = gross_t THEN base_t ELSE round(sel_t / gross_t * base_t, 2) END;
    n_z := CASE WHEN gross_z = 0 THEN 0 WHEN sel_z = gross_z THEN base_z ELSE round(sel_z / gross_z * base_z, 2) END;
    n_e := CASE WHEN gross_e = 0 THEN 0 WHEN sel_e = gross_e THEN base_e ELSE round(sel_e / gross_e * base_e, 2) END;
  ELSE
    n_t := round(coalesce((_items->>'taxable')::numeric,0),2); n_z := round(coalesce((_items->>'zero_rated')::numeric,0),2); n_e := round(coalesce((_items->>'exempt')::numeric,0),2);
    IF n_t < 0 OR n_z < 0 OR n_e < 0 THEN errs := errs || 'Montants négatifs refusés'::text; END IF;
  END IF;

  -- Résidu exact : ramené au disponible, jamais au-delà.
  IF n_t > base_t - c_t THEN IF mode = 'lines' THEN n_t := base_t - c_t; ELSE errs := errs || format('Base taxable créditée %s > disponible %s', n_t, base_t - c_t); END IF; END IF;
  IF n_z > base_z - c_z THEN IF mode = 'lines' THEN n_z := base_z - c_z; ELSE errs := errs || format('Base détaxée créditée %s > disponible %s', n_z, base_z - c_z); END IF; END IF;
  IF n_e > base_e - c_e THEN IF mode = 'lines' THEN n_e := base_e - c_e; ELSE errs := errs || format('Base exonérée créditée %s > disponible %s', n_e, base_e - c_e); END IF; END IF;
  IF n_t = base_t - c_t THEN n_g := g_inv - c_g; n_q := q_inv - c_q;
  ELSE
    n_g := least(CASE WHEN g_inv = 0 THEN 0 ELSE round(n_t * gr, 2) END, g_inv - c_g);
    n_q := least(CASE WHEN q_inv = 0 THEN 0 ELSE round(n_t * qr, 2) END, q_inv - c_q);
  END IF;
  RETURN jsonb_build_object('mode', mode, 'lines', outl, 'taxable_base', n_t, 'zero_rated_base', n_z, 'exempt_base', n_e,
    'pre_tax', n_t + n_z + n_e, 'gst', n_g, 'qst', n_q, 'total', n_t + n_z + n_e + n_g + n_q,
    'gst_rate', gr, 'qst_rate', qr, 'gst_status', t->>'gst_status', 'qst_status', t->>'qst_status', 'computed_from', 'tax_snapshot facture',
    'available', jsonb_build_object('taxable_base', base_t - c_t, 'zero_rated_base', base_z - c_z, 'exempt_base', base_e - c_e, 'gst', g_inv - c_g, 'qst', q_inv - c_q,
      'total', (base_t - c_t) + (base_z - c_z) + (base_e - c_e) + (g_inv - c_g) + (q_inv - c_q)),
    'errors', to_jsonb(errs),
    'rounding', 'Base = montant des lignes × base figée ÷ montant des lignes du même traitement, arrondi au cent; taxe = base × taux de la facture arrondie au cent (demi éloigné de zéro), plafonnée au résidu; crédit du solde complet = résidu exact');
END $$;
REVOKE ALL ON FUNCTION public.fin_credit_compute(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_credit_compute(uuid, jsonb, uuid) TO authenticated;

-- Source commune du solde : brut figé − avoirs émis − (déclarations antérieures + encaissements actifs), plancher zéro.
CREATE OR REPLACE FUNCTION public.fin_invoice_balance(_invoice uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; leg numeric := 0; s numeric; cr numeric; net numeric; col numeric;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  SELECT coalesce(legacy_received,0) INTO leg FROM fin_expected_inflows WHERE id = i.expected_inflow_id;
  SELECT coalesce(sum(amount),0) INTO s FROM fin_invoice_receipts WHERE invoice_id = _invoice AND voided_at IS NULL;
  SELECT coalesce(sum(total),0) INTO cr FROM fin_credit_notes WHERE invoice_id = _invoice AND status = 'emise';
  net := greatest(0, coalesce(i.total,0) - cr); col := coalesce(leg,0) + s;
  RETURN jsonb_build_object('total', i.total, 'credits', cr, 'net', net, 'legacy', coalesce(leg,0), 'receipts', s,
    'collected', col, 'received', least(net, col), 'rest', greatest(0, net - col), 'unallocated', greatest(0, col - net),
    'paid', i.total IS NOT NULL AND col > 0 AND col >= net, 'settled_by_credit', cr > 0 AND net - col <= 0 AND col < coalesce(i.total,0));
END $$;
REVOKE ALL ON FUNCTION public.fin_invoice_balance(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_invoice_receipts_sync(_invoice uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; b jsonb;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  b := public.fin_invoice_balance(_invoice);
  PERFORM set_config('fin.receipt','on',true);
  UPDATE fin_expected_inflows SET amount = (b->>'net')::numeric, received = (b->>'received')::numeric, updated_at = now() WHERE id = i.expected_inflow_id;
  PERFORM set_config('fin.receipt','',true);
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.fin_invoice_receipts_sync(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_invoice_receipt_summary(_invoice uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR NOT public.fin_can_read(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN public.fin_invoice_balance(_invoice);
END $$;

-- Brouillon d'avoir (création idempotente par clé de brouillon; modifiable tant que non émis).
CREATE OR REPLACE FUNCTION public.fin_credit_save(_invoice uuid, _draft_key text, _reason text, _items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; c fin_credit_notes; v uuid;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF i.status <> 'emise' THEN RAISE EXCEPTION 'Note de crédit possible seulement sur une facture émise'; END IF;
  IF coalesce(_draft_key,'') = '' THEN RAISE EXCEPTION 'Clé de brouillon manquante'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  SELECT * INTO c FROM fin_credit_notes WHERE company_id = i.company_id AND draft_key = _draft_key FOR UPDATE;
  IF c.id IS NOT NULL THEN
    IF c.invoice_id <> _invoice THEN RAISE EXCEPTION 'Clé de brouillon déjà utilisée pour une autre facture' USING ERRCODE = 'P0409'; END IF;
    IF c.status = 'emise' THEN
      IF c.reason = trim(_reason) AND c.items = _items THEN RETURN jsonb_build_object('id', c.id, 'status', c.status, 'replayed', true); END IF;
      RAISE EXCEPTION 'Note de crédit déjà émise : non modifiable' USING ERRCODE = 'P0409';
    END IF;
    UPDATE fin_credit_notes SET reason = trim(_reason), items = _items, updated_at = now() WHERE id = c.id;
    RETURN jsonb_build_object('id', c.id, 'status', 'brouillon', 'preview', public.fin_credit_compute(_invoice, _items, c.id));
  END IF;
  INSERT INTO fin_credit_notes(company_id, invoice_id, reason, items, draft_key, created_by)
  VALUES (i.company_id, _invoice, trim(_reason), _items, _draft_key, auth.uid()) RETURNING id INTO v;
  RETURN jsonb_build_object('id', v, 'status', 'brouillon', 'preview', public.fin_credit_compute(_invoice, _items, v));
END $$;

CREATE OR REPLACE FUNCTION public.fin_credit_discard(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv uuid; c fin_credit_notes;
BEGIN
  SELECT invoice_id INTO inv FROM fin_credit_notes WHERE id = _id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO c FROM fin_credit_notes WHERE id = _id FOR UPDATE;
  IF NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF c.status <> 'brouillon' THEN RAISE EXCEPTION 'Note de crédit émise : suppression impossible'; END IF;
  DELETE FROM fin_credit_notes WHERE id = _id;
END $$;

-- Émission : verrou facture puis avoir puis réglages (même ordre que fin_invoice_issue / receipt_add / receipt_void).
CREATE OR REPLACE FUNCTION public.fin_credit_issue(_id uuid, _issue_key text, _expect_total numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv uuid; i fin_invoices; c fin_credit_notes; r jsonb; st fin_invoice_settings; n integer; num text; other uuid;
BEGIN
  SELECT invoice_id INTO inv FROM fin_credit_notes WHERE id = _id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO i FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO c FROM fin_credit_notes WHERE id = _id FOR UPDATE;
  IF NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_issue_key,'') = '' THEN RAISE EXCEPTION 'Clé d''émission manquante'; END IF;
  SELECT id INTO other FROM fin_credit_notes WHERE company_id = c.company_id AND issue_key = _issue_key;
  IF other IS NOT NULL AND other <> _id THEN RAISE EXCEPTION 'Clé d''émission déjà utilisée pour une autre note de crédit' USING ERRCODE = 'P0409'; END IF;
  IF c.status = 'emise' THEN
    IF c.issue_key = _issue_key AND c.total = round(_expect_total,2) THEN
      RETURN jsonb_build_object('id', c.id, 'number', c.number, 'replayed', true) || jsonb_build_object('balance', public.fin_invoice_balance(inv));
    END IF;
    RAISE EXCEPTION 'Note de crédit déjà émise avec une autre requête' USING ERRCODE = 'P0409';
  END IF;
  r := public.fin_credit_compute(inv, c.items, c.id);
  IF jsonb_array_length(r->'errors') > 0 THEN RAISE EXCEPTION 'Crédit refusé : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'errors')), ' ; '); END IF;
  IF (r->>'total')::numeric <= 0 THEN RAISE EXCEPTION 'Crédit nul : rien à créditer (disponible %)', r->'available'->>'total'; END IF;
  IF _expect_total IS NULL OR (r->>'total')::numeric <> round(_expect_total,2) THEN
    RAISE EXCEPTION 'Disponible modifié depuis l''aperçu : nouveau montant %, revoyez l''aperçu', r->>'total' USING ERRCODE = 'P0409';
  END IF;
  INSERT INTO fin_invoice_settings(company_id) VALUES (c.company_id) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM fin_invoice_settings WHERE company_id = c.company_id FOR UPDATE;
  n := st.credit_next_number; num := st.credit_prefix || lpad(n::text, 5, '0');
  WHILE EXISTS (SELECT 1 FROM fin_credit_notes WHERE company_id = c.company_id AND number = num) LOOP n := n + 1; num := st.credit_prefix || lpad(n::text, 5, '0'); END LOOP;
  UPDATE fin_invoice_settings SET credit_next_number = n + 1 WHERE company_id = c.company_id;
  UPDATE fin_credit_notes SET status = 'emise', number = num, seq = n, issue_key = _issue_key, issued_at = now(), issued_by = auth.uid(),
    credit_snapshot = r, taxable_base = (r->>'taxable_base')::numeric, zero_rated_base = (r->>'zero_rated_base')::numeric, exempt_base = (r->>'exempt_base')::numeric,
    gst = (r->>'gst')::numeric, qst = (r->>'qst')::numeric, total = (r->>'total')::numeric,
    seller_snapshot = i.seller_snapshot, client_snapshot = i.client_snapshot,
    invoice_snapshot = jsonb_build_object('id', i.id, 'number', i.number, 'issue_date', i.issue_date, 'total', i.total, 'gst', i.tax_snapshot->'gst', 'qst', i.tax_snapshot->'qst', 'prices_include_tax', i.prices_include_tax),
    template_snapshot = jsonb_build_object('key', st.template_key, 'version', st.template_version, 'logo_path', st.logo_path, 'color', st.brand_color, 'footer', st.footer),
    updated_at = now()
  WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'number', num, 'replayed', false, 'balance', public.fin_invoice_receipts_sync(inv));
END $$;

CREATE OR REPLACE FUNCTION public.fin_credit_set_pdf(_id uuid, _path text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c fin_credit_notes;
BEGIN
  SELECT * INTO c FROM fin_credit_notes WHERE id = _id;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF c.status <> 'emise' THEN RAISE EXCEPTION 'Émettez d''abord la note de crédit'; END IF;
  IF _path IS NULL OR _path NOT LIKE c.company_id::text || '/credit/' || c.id::text || '-%' THEN RAISE EXCEPTION 'Chemin refusé'; END IF;
  UPDATE fin_credit_notes SET pdf_path = _path WHERE id = _id AND pdf_path IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.fin_credit_save(uuid,text,text,jsonb), public.fin_credit_discard(uuid), public.fin_credit_issue(uuid,text,numeric), public.fin_credit_set_pdf(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_credit_save(uuid,text,text,jsonb), public.fin_credit_discard(uuid), public.fin_credit_issue(uuid,text,numeric), public.fin_credit_set_pdf(uuid,text) TO authenticated;