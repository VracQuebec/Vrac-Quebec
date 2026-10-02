-- Conversion d'une date source selon le format choisi (aucune devinette).
CREATE OR REPLACE FUNCTION public.fin_csv_date(_raw text, _fmt text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE t text := btrim(coalesce(_raw,'')); m text[]; y int; mo int; d int; a int; b int; v date;
BEGIN
  IF t = '' THEN RETURN jsonb_build_object('v', NULL); END IF;
  m := regexp_match(t, '^(\d{4})-(\d{1,2})-(\d{1,2})$');
  IF m IS NOT NULL THEN y := m[1]::int; mo := m[2]::int; d := m[3]::int;
  ELSE
    m := regexp_match(t, '^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$');
    IF m IS NULL THEN RETURN jsonb_build_object('err', 'Date illisible « ' || t || ' »'); END IF;
    a := m[1]::int; b := m[2]::int; y := m[3]::int;
    IF _fmt = 'dmy' THEN d := a; mo := b; ELSIF _fmt = 'mdy' THEN mo := a; d := b;
    ELSE RETURN jsonb_build_object('err', 'Date ambiguë « ' || t || ' » : format des dates non choisi'); END IF;
  END IF;
  BEGIN v := make_date(y, mo, d); EXCEPTION WHEN others THEN RETURN jsonb_build_object('err', 'Date invalide « ' || t || ' »'); END;
  RETURN jsonb_build_object('v', v::text);
END $$;

-- Reçus lus non transformés (visibles par l'utilisateur) correspondant à un document CSV.
CREATE OR REPLACE FUNCTION public.fin_csv_cap_matches(_company uuid, d jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH x AS (
    SELECT c.id, c.edits, c.extraction,
      (c.edits->>'supplier_id') = (d->'p'->>'supplier_id') AS sup_ok,
      lower(btrim(coalesce(c.edits->>'reference',''))) = lower(btrim(d->'p'->>'reference')) AND btrim(coalesce(c.edits->>'reference','')) <> '' AS ref_edit,
      coalesce(c.edits->>'kind', 'bill') = CASE WHEN d->>'kind' = 'credit' THEN 'credit' ELSE 'bill' END AS kind_ok,
      EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.extraction->'documents')='array' THEN c.extraction->'documents' ELSE '[]' END) e
              WHERE lower(btrim(coalesce(e->>'reference',''))) = lower(btrim(d->'p'->>'reference')) AND btrim(coalesce(e->>'reference','')) <> '') AS ref_ocr,
      nullif(c.edits->>'total','') IS NOT NULL AND replace(c.edits->>'total',',','.')::numeric = nullif(d->'p'->>'total','')::numeric AS tot_ok,
      btrim(coalesce(c.edits->>'reference','')) = '' AS no_ref
    FROM public.fin_doc_captures c
    WHERE c.company_id = _company AND c.status NOT IN ('traite','ecarte') AND c.exp_file_id IS NULL
      AND public.fin_can_write(_company) AND public.fin_cap_exp_ok(c.id))
  SELECT coalesce(jsonb_agg(jsonb_build_object('capture_id', id,
      'level', CASE WHEN sup_ok AND ref_edit AND kind_ok THEN 'certaine' ELSE 'possible' END,
      'why', CASE WHEN sup_ok AND ref_edit AND kind_ok THEN 'même fournisseur, numéro et type validés sur le reçu'
                  WHEN ref_edit OR ref_ocr THEN 'même numéro lu sur le reçu (fournisseur ou type non validé)'
                  ELSE 'même fournisseur validé et même total, reçu sans numéro' END)
      ORDER BY (sup_ok AND ref_edit AND kind_ok) DESC), '[]')
  FROM x WHERE (sup_ok AND ref_edit AND kind_ok) OR ref_edit OR ref_ocr OR (sup_ok AND tot_ok AND no_ref AND kind_ok) $$;

CREATE OR REPLACE FUNCTION public.fin_csv_doc_problem(_company uuid, d jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p jsonb := d->'p'; src jsonb := coalesce(d->'src','{}'); s numeric; g numeric; q numeric; t numeric; ls numeric; n int; dt jsonb; pd numeric; bal numeric;
BEGIN
  IF d->>'kind' IN ('releve','statement') OR norm_kind_releve(src->>'type') THEN RETURN 'Relevé fournisseur : jamais importé comme facture'; END IF;
  IF d->>'kind' NOT IN ('facture','credit') THEN RETURN 'Type de document non pris en charge'; END IF;
  IF nullif(btrim(p->>'reference'),'') IS NULL THEN RETURN 'Numéro de document manquant'; END IF;
  IF p->>'supplier_id' IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_supplier_profiles WHERE client_id = (p->>'supplier_id')::uuid AND company_id = _company) THEN RETURN 'Fournisseur hors de cette entreprise'; END IF;
  IF coalesce(p->>'currency','CAD') <> 'CAD' THEN RETURN 'Devise non prise en charge (CAD seulement)'; END IF;
  -- Dates : reconverties depuis la valeur source et le format choisi ; la valeur reçue doit correspondre.
  dt := public.fin_csv_date(coalesce(src->>'doc_date', p->>'doc_date'), src->>'date_fmt');
  IF dt ? 'err' THEN RETURN dt->>'err'; END IF;
  IF dt->>'v' IS NULL THEN RETURN 'Date du document manquante'; END IF;
  IF dt->>'v' IS DISTINCT FROM nullif(p->>'doc_date','') THEN RETURN 'Date du document : conversion incohérente avec la valeur source'; END IF;
  dt := public.fin_csv_date(coalesce(src->>'due_date', p->>'due_date'), src->>'date_fmt');
  IF dt ? 'err' THEN RETURN 'Échéance : ' || (dt->>'err'); END IF;
  IF dt->>'v' IS DISTINCT FROM nullif(p->>'due_date','') THEN RETURN 'Échéance : conversion incohérente avec la valeur source'; END IF;
  t := nullif(p->>'total','')::numeric; s := nullif(p->>'subtotal','')::numeric; g := nullif(p->>'gst','')::numeric; q := nullif(p->>'qst','')::numeric;
  IF t IS NULL OR t <= 0 THEN RETURN 'Total du document manquant ou nul'; END IF;
  pd := nullif(p->>'paid','')::numeric; bal := nullif(p->>'balance','')::numeric;
  IF coalesce(pd,0) <> 0 THEN RETURN 'Paiement déjà effectué indiqué : l''import ne crée aucun règlement (saisie par le parcours existant)'; END IF;
  IF bal IS NOT NULL AND abs(bal - t) > 0.005 THEN RETURN 'Solde restant différent du total : historique de paiement non pris en charge'; END IF;
  IF coalesce(s,0) < 0 OR coalesce(g,0) < 0 OR coalesce(q,0) < 0 THEN RETURN 'Montant négatif refusé'; END IF;
  IF s IS NOT NULL AND g IS NOT NULL AND q IS NOT NULL AND abs(s + g + q - t) > 0.01 THEN RETURN 'Montant incohérent : sous-total + taxes ≠ total'; END IF;
  SELECT count(*), sum((l->>'amount')::numeric) INTO n, ls FROM jsonb_array_elements(coalesce(p->'lines','[]')) l WHERE nullif(l->>'amount','') IS NOT NULL;
  IF n > 0 AND s IS NOT NULL AND abs(ls - s) > 0.01 THEN RETURN 'Montant incohérent : somme des lignes ≠ sous-total'; END IF;
  IF n > 0 AND s IS NULL AND g IS NOT NULL AND q IS NOT NULL AND abs(ls + g + q - t) > 0.01 THEN RETURN 'Montant incohérent : lignes + taxes ≠ total'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.norm_kind_releve(_t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(lower(translate(_t, 'éèêÉ', 'eeee')) ~ '(releve|statement)', false) $$;

CREATE OR REPLACE FUNCTION public.fin_csv_check(_company uuid, _docs jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d jsonb; out jsonb := '[]'; pb text; ex jsonb; cm jsonb;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF jsonb_array_length(_docs) > 500 THEN RAISE EXCEPTION 'Maximum 500 documents par import'; END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(_docs) LOOP
    pb := public.fin_csv_doc_problem(_company, d);
    ex := CASE WHEN pb IS NULL THEN public.fin_csv_existing(_company, d) END;
    cm := CASE WHEN pb IS NULL AND ex IS NULL THEN public.fin_csv_cap_matches(_company, d) ELSE '[]' END;
    out := out || jsonb_build_object('key', d->>'key', 'problem', pb, 'captures', cm,
      'outcome', CASE WHEN pb IS NOT NULL THEN 'refuse' WHEN ex IS NULL THEN 'nouveau' WHEN (ex->>'same')::boolean THEN 'deja_present' ELSE 'conflit' END, 'existing', ex);
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.fin_csv_commit(_company uuid, _request_key text, _file_name text, _file_sha text, _settings jsonb, _docs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    res_kind := d->'resolution'->>'kind';  -- 'attach' (capture_id) | 'distinct'
    pb := public.fin_csv_doc_problem(_company, d);
    dk := 'csv:' || (d->>'kind') || ':' || coalesce(d->'p'->>'supplier_id','') || ':' || lower(btrim(coalesce(d->'p'->>'reference','')));
    IF pb IS NULL THEN
      IF res_kind = 'attach' THEN
        att := nullif(d->'resolution'->>'capture_id','')::uuid;
        SELECT * INTO capr FROM public.fin_doc_captures WHERE id = att AND company_id = _company FOR UPDATE;  -- même ordre que fin_cap_create : reçu puis verrou document
        IF capr.id IS NULL OR NOT public.fin_cap_exp_ok(att) OR capr.exp_file_id IS NOT NULL THEN pb := 'Reçu à rattacher introuvable'; END IF;
      END IF;
    END IF;
    IF pb IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || dk, 0));
      ex := public.fin_csv_existing(_company, d);
      IF ex IS NULL THEN cm := public.fin_csv_cap_matches(_company, d); END IF;
      IF ex IS NULL AND jsonb_array_length(cm) > 0 THEN
        IF res_kind = 'attach' THEN
          IF d->>'kind' <> 'facture' THEN pb := 'Rattachement d''un reçu : factures seulement';
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
      ELSE r := public.fin_scr_save(_company, NULL, d->'p', NULL, dk); cid := (r->>'id')::uuid; END IF;
      oc := CASE WHEN (r->>'replay')::boolean THEN 'deja_present' ELSE 'cree' END;
      pb := CASE WHEN att IS NOT NULL THEN 'Reçu rattaché au brouillon' WHEN res_kind = 'distinct' THEN 'Créé comme document distinct du reçu lu (choix explicite)' END;
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
END $$;

-- Sens inverse : reçu → facture/crédit, même verrou que l'import CSV et contrôle des doublons certains.
CREATE OR REPLACE FUNCTION public.fin_cap_create(_id uuid, _kind text, _index integer, _p jsonb, _dup_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.fin_doc_captures; r jsonb; p jsonb; d jsonb; k text; n integer; ref text; sup text;
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
  IF _kind = 'bill' THEN
    d := public.fin_bill_dups(c.company_id, NULL, p);
    IF jsonb_array_length(d->'exact') > 0 AND nullif(btrim(coalesce(_dup_reason,'')),'') IS NULL THEN
      RAISE EXCEPTION 'Document déjà enregistré : ouvrez-le ou joignez-y la pièce (exception motivée possible)' USING ERRCODE='P0409'; END IF;
    r := public.fin_bill_save(c.company_id, NULL, p, NULL, k);
  ELSE
    IF ref <> '' AND EXISTS (SELECT 1 FROM public.fin_supplier_credits x WHERE x.company_id = c.company_id AND x.status <> 'void' AND x.supplier_id::text = sup AND lower(btrim(x.reference)) = ref)
       AND nullif(btrim(coalesce(_dup_reason,'')),'') IS NULL THEN
      RAISE EXCEPTION 'Note de crédit déjà enregistrée pour ce fournisseur et ce numéro (exception motivée possible)' USING ERRCODE='P0409'; END IF;
    r := public.fin_scr_save(c.company_id, NULL, p, NULL, k);
  END IF;
  r := jsonb_build_object('kind', _kind, 'id', r->>'id', 'index', _index, 'key', k, 'at', now());
  UPDATE public.fin_doc_captures SET results = results || jsonb_build_array(r), status = 'traite', rev = rev + 1, updated_at = now() WHERE id = _id;
  PERFORM public.fin_cap_log(c, 'create_' || _kind, nullif(btrim(coalesce(_dup_reason,'')),''), r);
  RETURN r;
END $function$;

REVOKE ALL ON FUNCTION public.fin_csv_cap_matches(uuid,jsonb), public.fin_csv_date(text,text) FROM PUBLIC, anon, authenticated;