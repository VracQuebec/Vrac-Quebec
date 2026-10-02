CREATE TABLE public.fin_csv_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  file_name text NOT NULL, file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  request_key text NOT NULL, settings jsonb NOT NULL DEFAULT '{}',
  summary jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, request_key)
);
CREATE TABLE public.fin_csv_import_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.fin_csv_imports(id),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  doc_kind text NOT NULL CHECK (doc_kind IN ('facture','credit')),
  supplier_id uuid, reference text, doc_key text NOT NULL, content_hash text,
  source_rows int[] NOT NULL DEFAULT '{}', payload jsonb NOT NULL DEFAULT '{}',
  outcome text NOT NULL CHECK (outcome IN ('cree','deja_present','conflit','refuse')),
  reason text, bill_id uuid REFERENCES public.fin_supplier_bills(id), credit_id uuid REFERENCES public.fin_supplier_credits(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fin_csv_import_docs(import_id);
GRANT SELECT ON public.fin_csv_imports, public.fin_csv_import_docs TO authenticated;
GRANT ALL ON public.fin_csv_imports, public.fin_csv_import_docs TO service_role;
ALTER TABLE public.fin_csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_csv_import_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.fin_csv_imports FOR SELECT TO authenticated USING (public.fin_can_write(company_id));
CREATE POLICY r ON public.fin_csv_import_docs FOR SELECT TO authenticated USING (public.fin_can_write(company_id));

-- Validation d'un document (aucune écriture). Retourne NULL si valide, sinon le motif.
CREATE OR REPLACE FUNCTION public.fin_csv_doc_problem(_company uuid, d jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p jsonb := d->'p'; s numeric; g numeric; q numeric; t numeric; ls numeric; n int;
BEGIN
  IF d->>'kind' NOT IN ('facture','credit') THEN RETURN 'Type de document non pris en charge'; END IF;
  IF nullif(btrim(p->>'reference'),'') IS NULL THEN RETURN 'Numéro de document manquant'; END IF;
  IF p->>'supplier_id' IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_supplier_profiles WHERE client_id = (p->>'supplier_id')::uuid AND company_id = _company) THEN RETURN 'Fournisseur hors de cette entreprise'; END IF;
  IF coalesce(p->>'currency','CAD') <> 'CAD' THEN RETURN 'Devise non prise en charge (CAD seulement)'; END IF;
  IF nullif(p->>'doc_date','') IS NULL THEN RETURN 'Date du document manquante'; END IF;
  t := nullif(p->>'total','')::numeric; s := nullif(p->>'subtotal','')::numeric; g := nullif(p->>'gst','')::numeric; q := nullif(p->>'qst','')::numeric;
  IF t IS NULL OR t <= 0 THEN RETURN 'Total du document manquant ou nul'; END IF;
  IF coalesce(s,0) < 0 OR coalesce(g,0) < 0 OR coalesce(q,0) < 0 THEN RETURN 'Montant négatif refusé'; END IF;
  IF s IS NOT NULL AND g IS NOT NULL AND q IS NOT NULL AND abs(s + g + q - t) > 0.01 THEN RETURN 'Montant incohérent : sous-total + taxes ≠ total'; END IF;
  SELECT count(*), sum((l->>'amount')::numeric) INTO n, ls FROM jsonb_array_elements(coalesce(p->'lines','[]')) l WHERE nullif(l->>'amount','') IS NOT NULL;
  IF n > 0 AND s IS NOT NULL AND abs(ls - s) > 0.01 THEN RETURN 'Montant incohérent : somme des lignes ≠ sous-total'; END IF;
  IF n > 0 AND s IS NULL AND g IS NOT NULL AND q IS NOT NULL AND abs(ls + g + q - t) > 0.01 THEN RETURN 'Montant incohérent : lignes + taxes ≠ total'; END IF;
  RETURN NULL;
END $$;

-- Recherche d'un document existant (factures et crédits, saisie manuelle, OCR ou import).
CREATE OR REPLACE FUNCTION public.fin_csv_existing(_company uuid, d jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN d->>'kind' = 'facture' THEN
    (SELECT jsonb_build_object('id', b.id, 'total', b.total, 'status', b.status, 'same', b.total = nullif(d->'p'->>'total','')::numeric)
     FROM public.fin_supplier_bills b WHERE b.company_id = _company AND b.status <> 'void' AND b.supplier_id = (d->'p'->>'supplier_id')::uuid
       AND lower(btrim(b.reference)) = lower(btrim(d->'p'->>'reference')) ORDER BY b.created_at LIMIT 1)
  ELSE
    (SELECT jsonb_build_object('id', c.id, 'total', c.total, 'status', c.status, 'same', c.total = nullif(d->'p'->>'total','')::numeric)
     FROM public.fin_supplier_credits c WHERE c.company_id = _company AND c.status <> 'void' AND c.supplier_id = (d->'p'->>'supplier_id')::uuid
       AND lower(btrim(c.reference)) = lower(btrim(d->'p'->>'reference')) ORDER BY c.created_at LIMIT 1)
  END $$;

-- Aperçu serveur : aucune écriture.
CREATE OR REPLACE FUNCTION public.fin_csv_check(_company uuid, _docs jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d jsonb; out jsonb := '[]'; pb text; ex jsonb;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF jsonb_array_length(_docs) > 500 THEN RAISE EXCEPTION 'Maximum 500 documents par import'; END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(_docs) LOOP
    pb := public.fin_csv_doc_problem(_company, d);
    ex := CASE WHEN pb IS NULL THEN public.fin_csv_existing(_company, d) END;
    out := out || jsonb_build_object('key', d->>'key', 'problem', pb,
      'outcome', CASE WHEN pb IS NOT NULL THEN 'refuse' WHEN ex IS NULL THEN 'nouveau' WHEN (ex->>'same')::boolean THEN 'deja_present' ELSE 'conflit' END, 'existing', ex);
  END LOOP;
  RETURN out;
END $$;

-- Import : crée uniquement des brouillons par les RPC existantes, clé déterministe par document.
CREATE OR REPLACE FUNCTION public.fin_csv_commit(_company uuid, _request_key text, _file_name text, _file_sha text, _settings jsonb, _docs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE imp public.fin_csv_imports; d jsonb; pb text; ex jsonb; dk text; r jsonb; oc text; bid uuid; cid uuid; res jsonb := '[]'; cnt jsonb;
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
    bid := NULL; cid := NULL; ex := NULL;
    pb := public.fin_csv_doc_problem(_company, d);
    dk := 'csv:' || (d->>'kind') || ':' || coalesce(d->'p'->>'supplier_id','') || ':' || lower(btrim(coalesce(d->'p'->>'reference','')));
    IF pb IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || dk, 0));
      ex := public.fin_csv_existing(_company, d);
    END IF;
    IF pb IS NOT NULL THEN oc := 'refuse';
    ELSIF ex IS NOT NULL THEN oc := CASE WHEN (ex->>'same')::boolean THEN 'deja_present' ELSE 'conflit' END;
      IF d->>'kind' = 'facture' THEN bid := (ex->>'id')::uuid; ELSE cid := (ex->>'id')::uuid; END IF;
      pb := CASE WHEN oc = 'conflit' THEN 'Même fournisseur et numéro, montant différent (existant ' || coalesce(ex->>'total','?') || ' $) : à examiner, rien n''est écrasé' ELSE 'Document déjà enregistré' END;
    ELSE
      IF d->>'kind' = 'facture' THEN r := public.fin_bill_save(_company, NULL, d->'p', NULL, dk); bid := (r->>'id')::uuid;
        PERFORM public.fin_sb_log(b, 'csv_import', NULL, jsonb_build_object('import_id', imp.id, 'rows', d->'rows')) FROM public.fin_supplier_bills b WHERE b.id = bid;
      ELSE r := public.fin_scr_save(_company, NULL, d->'p', NULL, dk); cid := (r->>'id')::uuid; END IF;
      oc := CASE WHEN (r->>'replay')::boolean THEN 'deja_present' ELSE 'cree' END;
    END IF;
    INSERT INTO public.fin_csv_import_docs(import_id, company_id, doc_kind, supplier_id, reference, doc_key, content_hash, source_rows, payload, outcome, reason, bill_id, credit_id)
    VALUES (imp.id, _company, CASE WHEN d->>'kind' IN ('facture','credit') THEN d->>'kind' ELSE 'facture' END, nullif(d->'p'->>'supplier_id','')::uuid, d->'p'->>'reference', dk, d->>'hash',
      coalesce((SELECT array_agg(x::int) FROM jsonb_array_elements_text(d->'rows') x), '{}'), d->'p', oc, pb, bid, cid);
    res := res || jsonb_build_object('key', d->>'key', 'outcome', oc, 'reason', pb, 'bill_id', bid, 'credit_id', cid);
  END LOOP;
  SELECT jsonb_build_object('cree', count(*) FILTER (WHERE x->>'outcome'='cree'), 'deja_present', count(*) FILTER (WHERE x->>'outcome'='deja_present'),
    'conflit', count(*) FILTER (WHERE x->>'outcome'='conflit'), 'refuse', count(*) FILTER (WHERE x->>'outcome'='refuse')) INTO cnt FROM jsonb_array_elements(res) x;
  UPDATE public.fin_csv_imports SET summary = jsonb_build_object('counts', cnt, 'docs', res) WHERE id = imp.id;
  RETURN jsonb_build_object('import_id', imp.id, 'counts', cnt, 'docs', res);
END $$;
REVOKE ALL ON FUNCTION public.fin_csv_doc_problem(uuid,jsonb), public.fin_csv_existing(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_csv_check(uuid,jsonb), public.fin_csv_commit(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_csv_check(uuid,jsonb), public.fin_csv_commit(uuid,text,text,text,jsonb,jsonb) TO authenticated;