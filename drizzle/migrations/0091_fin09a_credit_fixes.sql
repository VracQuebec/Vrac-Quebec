-- FIN-09A correctifs : helper interne, validation stricte des lignes, arrondis cumulatifs par ligne, révision/empreinte du brouillon.
ALTER TABLE public.fin_credit_notes ADD COLUMN IF NOT EXISTS rev integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.fin_credit_hash(_reason text, _items jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(coalesce(trim(_reason),'') || chr(30) || coalesce(_items::text,'null'))
$$;
REVOKE ALL ON FUNCTION public.fin_credit_hash(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_credit_compute(_invoice uuid, _items jsonb, _exclude uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; t jsonb; mode text; nl int; k int; ln jsonb;
  base_t numeric; base_z numeric; base_e numeric; g_inv numeric; q_inv numeric; gr numeric; qr numeric;
  c_t numeric; c_z numeric; c_e numeric; c_g numeric; c_q numeric;
  gross_t numeric := 0; gross_z numeric := 0; gross_e numeric := 0; run_t numeric := 0; run_z numeric := 0; run_e numeric := 0; prev numeric;
  lq numeric[] := '{}'; lp numeric[] := '{}'; ld numeric[] := '{}'; lg numeric[] := '{}'; ls numeric[] := '{}'; ltr text[] := '{}';
  n_t numeric := 0; n_z numeric := 0; n_e numeric := 0; n_g numeric; n_q numeric; adj numeric := 0;
  it jsonb; idx int; iv numeric; q numeric; done numeric; seen int[] := '{}'; g_part numeric; b_part numeric; naive numeric;
  outl jsonb := '[]'::jsonb; errs text[] := '{}'; v jsonb; key text;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'object' THEN RAISE EXCEPTION 'Contenu du crédit invalide' USING ERRCODE = '22023'; END IF;
  IF _items ? 'mode' AND jsonb_typeof(_items->'mode') <> 'string' THEN RAISE EXCEPTION 'Mode de crédit invalide' USING ERRCODE = '22023'; END IF;
  mode := coalesce(_items->>'mode','lines');
  IF mode NOT IN ('lines','amount','balance') THEN RAISE EXCEPTION 'Mode de crédit inconnu : %', mode USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR i.status <> 'emise' THEN RAISE EXCEPTION 'Note de crédit possible seulement sur une facture émise'; END IF;
  t := i.tax_snapshot;
  base_t := coalesce((t->>'taxable_base')::numeric,0); base_z := coalesce((t->>'zero_rated_base')::numeric,0); base_e := coalesce((t->>'exempt_base')::numeric,0);
  g_inv := coalesce((t->>'gst')::numeric,0); q_inv := coalesce((t->>'qst')::numeric,0);
  gr := coalesce((t->>'gst_rate')::numeric,0); qr := coalesce((t->>'qst_rate')::numeric,0);
  SELECT coalesce(sum(taxable_base),0), coalesce(sum(zero_rated_base),0), coalesce(sum(exempt_base),0), coalesce(sum(gst),0), coalesce(sum(qst),0)
    INTO c_t, c_z, c_e, c_g, c_q FROM fin_credit_notes WHERE invoice_id = _invoice AND status = 'emise' AND id IS DISTINCT FROM _exclude;

  nl := coalesce(jsonb_array_length(i.lines), 0);
  FOR k IN 1..nl LOOP
    ln := i.lines -> (k - 1);
    lq[k] := coalesce((ln->>'qty')::numeric,0); lp[k] := coalesce((ln->>'price')::numeric,0); ld[k] := coalesce((ln->>'disc_pct')::numeric,0);
    lg[k] := round(lq[k] * lp[k] * (1 - ld[k]/100), 2); ltr[k] := coalesce(ln->>'tax','a_determiner');
    IF ltr[k] = 'taxable' THEN gross_t := gross_t + lg[k]; ELSIF ltr[k] = 'detaxe' THEN gross_z := gross_z + lg[k]; ELSIF ltr[k] = 'exonere' THEN gross_e := gross_e + lg[k]; END IF;
  END LOOP;
  FOR k IN 1..nl LOOP
    IF ltr[k] = 'taxable' THEN prev := run_t; run_t := run_t + lg[k]; ls[k] := CASE WHEN gross_t = 0 THEN 0 ELSE round(run_t / gross_t * base_t, 2) - round(prev / gross_t * base_t, 2) END;
    ELSIF ltr[k] = 'detaxe' THEN prev := run_z; run_z := run_z + lg[k]; ls[k] := CASE WHEN gross_z = 0 THEN 0 ELSE round(run_z / gross_z * base_z, 2) - round(prev / gross_z * base_z, 2) END;
    ELSIF ltr[k] = 'exonere' THEN prev := run_e; run_e := run_e + lg[k]; ls[k] := CASE WHEN gross_e = 0 THEN 0 ELSE round(run_e / gross_e * base_e, 2) - round(prev / gross_e * base_e, 2) END;
    ELSE ls[k] := 0; END IF;
  END LOOP;

  IF mode = 'lines' THEN
    IF jsonb_typeof(coalesce(_items->'lines','[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Lignes de crédit invalides' USING ERRCODE = '22023'; END IF;
    FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_items->'lines','[]'::jsonb)) LOOP
      IF jsonb_typeof(it) <> 'object' OR jsonb_typeof(it->'i') IS DISTINCT FROM 'number' OR jsonb_typeof(it->'qty') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Ligne de crédit invalide : indice et quantité numériques requis' USING ERRCODE = '22023'; END IF;
      iv := (it->>'i')::numeric;
      IF iv <> trunc(iv) OR iv < 0 OR iv >= nl THEN RAISE EXCEPTION 'Indice de ligne invalide : %', it->>'i' USING ERRCODE = '22023'; END IF;
      idx := iv::int;
      IF idx = ANY(seen) THEN RAISE EXCEPTION 'Ligne % répétée dans la demande', idx + 1 USING ERRCODE = '22023'; END IF;
      seen := seen || idx;
      q := (it->>'qty')::numeric;
      IF q <= 0 THEN RAISE EXCEPTION 'Ligne % : quantité créditée positive requise', idx + 1 USING ERRCODE = '22023'; END IF;
      IF ltr[idx+1] NOT IN ('taxable','detaxe','exonere') THEN errs := errs || format('Ligne %s : traitement fiscal non résolu', idx + 1); CONTINUE; END IF;
      SELECT coalesce(sum((x->>'qty')::numeric),0) INTO done FROM fin_credit_notes cn, jsonb_array_elements(coalesce(cn.credit_snapshot->'lines','[]'::jsonb)) x
        WHERE cn.invoice_id = _invoice AND cn.status = 'emise' AND cn.id IS DISTINCT FROM _exclude AND (x->>'i')::int = idx;
      IF lq[idx+1] <= 0 OR q > lq[idx+1] - done THEN errs := errs || format('Ligne %s : quantité créditée %s > disponible %s', idx + 1, q, lq[idx+1] - done); CONTINUE; END IF;
      g_part := round((done + q) / lq[idx+1] * lg[idx+1], 2) - round(done / lq[idx+1] * lg[idx+1], 2);
      b_part := round((done + q) / lq[idx+1] * ls[idx+1], 2) - round(done / lq[idx+1] * ls[idx+1], 2);
      naive := round(q * lp[idx+1] * (1 - ld[idx+1]/100), 2); adj := adj + (g_part - naive);
      IF ltr[idx+1] = 'taxable' THEN n_t := n_t + b_part; ELSIF ltr[idx+1] = 'detaxe' THEN n_z := n_z + b_part; ELSE n_e := n_e + b_part; END IF;
      outl := outl || jsonb_build_object('i', idx, 'qty', q, 'desc', i.lines->idx->>'desc', 'unit', i.lines->idx->>'unit', 'price', lp[idx+1], 'disc_pct', ld[idx+1],
        'tax', ltr[idx+1], 'gross', g_part, 'base', b_part, 'rounding_adjustment', g_part - naive, 'line_available_qty', lq[idx+1] - done - q);
    END LOOP;
    IF n_t > base_t - c_t THEN errs := errs || format('Base taxable demandée %s > disponible %s (crédits par montant antérieurs) : utilisez « Solde exact restant » ou le mode montant', n_t, base_t - c_t); END IF;
    IF n_z > base_z - c_z THEN errs := errs || format('Base détaxée demandée %s > disponible %s : utilisez « Solde exact restant » ou le mode montant', n_z, base_z - c_z); END IF;
    IF n_e > base_e - c_e THEN errs := errs || format('Base exonérée demandée %s > disponible %s : utilisez « Solde exact restant » ou le mode montant', n_e, base_e - c_e); END IF;
  ELSIF mode = 'amount' THEN
    FOREACH key IN ARRAY ARRAY['taxable','zero_rated','exempt'] LOOP
      v := _items->key;
      IF v IS NOT NULL AND jsonb_typeof(v) NOT IN ('number','null') THEN RAISE EXCEPTION 'Montant % invalide', key USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND jsonb_typeof(v) = 'number' AND ((v#>>'{}')::numeric < 0 OR (v#>>'{}')::numeric <> round((v#>>'{}')::numeric, 2)) THEN
        RAISE EXCEPTION 'Montant % : positif, au cent près', key USING ERRCODE = '22023'; END IF;
    END LOOP;
    n_t := coalesce((_items->>'taxable')::numeric,0); n_z := coalesce((_items->>'zero_rated')::numeric,0); n_e := coalesce((_items->>'exempt')::numeric,0);
    IF n_t > base_t - c_t THEN errs := errs || format('Base taxable créditée %s > disponible %s', n_t, base_t - c_t); END IF;
    IF n_z > base_z - c_z THEN errs := errs || format('Base détaxée créditée %s > disponible %s', n_z, base_z - c_z); END IF;
    IF n_e > base_e - c_e THEN errs := errs || format('Base exonérée créditée %s > disponible %s', n_e, base_e - c_e); END IF;
  ELSE
    n_t := base_t - c_t; n_z := base_z - c_z; n_e := base_e - c_e;
  END IF;

  IF mode = 'balance' THEN n_g := g_inv - c_g; n_q := q_inv - c_q;
  ELSIF base_t = 0 THEN n_g := 0; n_q := 0;
  ELSE
    n_g := greatest(0, least(g_inv - c_g, round(least(c_t + n_t, base_t) / base_t * g_inv, 2) - c_g));
    n_q := greatest(0, least(q_inv - c_q, round(least(c_t + n_t, base_t) / base_t * q_inv, 2) - c_q));
  END IF;
  RETURN jsonb_build_object('mode', mode, 'lines', outl, 'taxable_base', n_t, 'zero_rated_base', n_z, 'exempt_base', n_e,
    'pre_tax', n_t + n_z + n_e, 'gst', n_g, 'qst', n_q, 'total', n_t + n_z + n_e + n_g + n_q, 'rounding_adjustment', adj,
    'gst_rate', gr, 'qst_rate', qr, 'gst_status', t->>'gst_status', 'qst_status', t->>'qst_status', 'computed_from', 'tax_snapshot facture',
    'available', jsonb_build_object('taxable_base', base_t - c_t, 'zero_rated_base', base_z - c_z, 'exempt_base', base_e - c_e, 'gst', g_inv - c_g, 'qst', q_inv - c_q,
      'total', (base_t - c_t) + (base_z - c_z) + (base_e - c_e) + (g_inv - c_g) + (q_inv - c_q)),
    'errors', to_jsonb(errs),
    'rounding', 'Ligne : part de base figée répartie cumulativement; crédit de quantité = arrondi du cumul après − arrondi du cumul avant (la dernière unité rend exactement le montant figé). Taxe = arrondi(base cumulée créditée ÷ base figée × taxe facturée) − taxe déjà créditée. Solde exact restant = résidus exacts.');
END $$;
REVOKE ALL ON FUNCTION public.fin_credit_compute(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_credit_save(_invoice uuid, _draft_key text, _reason text, _items jsonb, _base_rev integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i fin_invoices; c fin_credit_notes; v uuid; r jsonb; nr integer;
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
      IF c.reason = trim(_reason) AND c.items = _items THEN RETURN jsonb_build_object('id', c.id, 'status', c.status, 'rev', c.rev, 'replayed', true); END IF;
      RAISE EXCEPTION 'Note de crédit déjà émise : non modifiable' USING ERRCODE = 'P0409';
    END IF;
    IF _base_rev IS DISTINCT FROM c.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs (révision %) : rechargez-le avant de continuer', c.rev USING ERRCODE = 'P0409'; END IF;
    r := public.fin_credit_compute(_invoice, _items, c.id);
    UPDATE fin_credit_notes SET reason = trim(_reason), items = _items, rev = rev + 1, updated_at = now() WHERE id = c.id RETURNING rev INTO nr;
    RETURN jsonb_build_object('id', c.id, 'status', 'brouillon', 'rev', nr, 'hash', public.fin_credit_hash(_reason, _items), 'preview', r);
  END IF;
  IF _base_rev IS NOT NULL THEN RAISE EXCEPTION 'Brouillon introuvable (supprimé ou émis ailleurs)' USING ERRCODE = 'P0409'; END IF;
  r := public.fin_credit_compute(_invoice, _items, NULL);
  INSERT INTO fin_credit_notes(company_id, invoice_id, reason, items, draft_key, created_by, rev)
  VALUES (i.company_id, _invoice, trim(_reason), _items, _draft_key, auth.uid(), 1) RETURNING id INTO v;
  RETURN jsonb_build_object('id', v, 'status', 'brouillon', 'rev', 1, 'hash', public.fin_credit_hash(_reason, _items), 'preview', public.fin_credit_compute(_invoice, _items, v));
END $$;

CREATE OR REPLACE FUNCTION public.fin_credit_issue(_id uuid, _issue_key text, _expect_total numeric, _expect_rev integer, _expect_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv uuid; i fin_invoices; c fin_credit_notes; r jsonb; st fin_invoice_settings; n integer; num text; other uuid;
BEGIN
  SELECT invoice_id INTO inv FROM fin_credit_notes WHERE id = _id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Brouillon introuvable (supprimé ailleurs)' USING ERRCODE = 'P0409'; END IF;
  SELECT * INTO i FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO c FROM fin_credit_notes WHERE id = _id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Brouillon introuvable (supprimé ailleurs)' USING ERRCODE = 'P0409'; END IF;
  IF NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_issue_key,'') = '' THEN RAISE EXCEPTION 'Clé d''émission manquante'; END IF;
  SELECT id INTO other FROM fin_credit_notes WHERE company_id = c.company_id AND issue_key = _issue_key;
  IF other IS NOT NULL AND other <> _id THEN RAISE EXCEPTION 'Clé d''émission déjà utilisée pour une autre note de crédit' USING ERRCODE = 'P0409'; END IF;
  IF c.status = 'emise' THEN
    IF c.issue_key = _issue_key AND c.rev = _expect_rev AND public.fin_credit_hash(c.reason, c.items) = _expect_hash AND c.total = round(_expect_total,2) THEN
      RETURN jsonb_build_object('id', c.id, 'number', c.number, 'replayed', true, 'balance', public.fin_invoice_balance(inv));
    END IF;
    RAISE EXCEPTION 'Note de crédit déjà émise avec une autre requête' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM c.rev OR _expect_hash IS DISTINCT FROM public.fin_credit_hash(c.reason, c.items) THEN
    RAISE EXCEPTION 'Brouillon modifié depuis l''aperçu (révision %) : refaites l''aperçu', c.rev USING ERRCODE = 'P0409';
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

REVOKE ALL ON FUNCTION public.fin_credit_save(uuid,text,text,jsonb,integer), public.fin_credit_issue(uuid,text,numeric,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_credit_save(uuid,text,text,jsonb,integer), public.fin_credit_issue(uuid,text,numeric,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.fin_credit_save(uuid,text,text,jsonb), public.fin_credit_issue(uuid,text,numeric) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.fin_credit_save(uuid,text,text,jsonb) IS 'DEPRECATED: remplacée par fin_credit_save(..., _base_rev integer)';
COMMENT ON FUNCTION public.fin_credit_issue(uuid,text,numeric) IS 'DEPRECATED: remplacée par fin_credit_issue(..., _expect_rev integer, _expect_hash text)';