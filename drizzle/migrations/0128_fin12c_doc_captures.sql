CREATE TABLE public.fin_doc_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  file_id uuid NOT NULL REFERENCES public.ent_crm_files(id),
  file_sha256 text CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'ajoute' CHECK (status IN ('ajoute','lecture','a_verifier','echec','traite','ecarte')),
  extraction jsonb,
  extracted_at timestamptz,
  extract_error text,
  extract_count integer NOT NULL DEFAULT 0,
  edits jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  dismiss_reason text,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fin_cap_file ON public.fin_doc_captures(company_id, file_id);
CREATE INDEX fin_cap_company ON public.fin_doc_captures(company_id, created_at DESC);
GRANT SELECT ON public.fin_doc_captures TO authenticated;
GRANT ALL ON public.fin_doc_captures TO service_role;
ALTER TABLE public.fin_doc_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.fin_doc_captures FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_doc_capture_events (
  id bigserial PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES public.fin_doc_captures(id),
  company_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  detail jsonb,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_doc_capture_events TO authenticated;
GRANT ALL ON public.fin_doc_capture_events TO service_role;
GRANT USAGE ON SEQUENCE public.fin_doc_capture_events_id_seq TO service_role;
ALTER TABLE public.fin_doc_capture_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.fin_doc_capture_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE OR REPLACE FUNCTION public.fin_cape_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Journal en ajout seulement'; END $$;
CREATE TRIGGER fin_cape_no_change BEFORE UPDATE OR DELETE ON public.fin_doc_capture_events FOR EACH ROW EXECUTE FUNCTION public.fin_cape_append_only();

CREATE OR REPLACE FUNCTION public.fin_cap_log(_c public.fin_doc_captures, _a text, _r text, _d jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fin_doc_capture_events(capture_id, company_id, action, reason, detail) VALUES (_c.id, _c.company_id, _a, _r, _d);
$$;
REVOKE ALL ON FUNCTION public.fin_cap_log(public.fin_doc_captures, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_cap_register(_company uuid, _file uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures; f public.ent_crm_files;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO f FROM public.ent_crm_files WHERE id = _file AND company_id = _company AND archived_at IS NULL;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Pièce hors de cette entreprise' USING ERRCODE='42501'; END IF;
  INSERT INTO public.fin_doc_captures(company_id, file_id) VALUES (_company, _file)
  ON CONFLICT (company_id, file_id) DO NOTHING RETURNING * INTO c;
  IF c.id IS NULL THEN
    SELECT * INTO c FROM public.fin_doc_captures WHERE company_id = _company AND file_id = _file;
    RETURN jsonb_build_object('id', c.id, 'replay', true);
  END IF;
  PERFORM public.fin_cap_log(c, 'add', NULL, jsonb_build_object('file', f.file_name));
  RETURN jsonb_build_object('id', c.id);
END $$;

CREATE OR REPLACE FUNCTION public.fin_cap_detail(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures; f public.ent_crm_files; same jsonb;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id;
  IF c.id IS NULL OR NOT public.fin_can_read(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO f FROM public.ent_crm_files WHERE id = c.file_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'results', o.results, 'created_at', o.created_at)), '[]') INTO same
    FROM public.fin_doc_captures o WHERE o.company_id = c.company_id AND o.id <> c.id AND c.file_sha256 IS NOT NULL AND o.file_sha256 = c.file_sha256;
  RETURN to_jsonb(c) || jsonb_build_object('file', jsonb_build_object('id', f.id, 'name', f.file_name, 'mime', f.mime_type, 'size', f.size_bytes, 'storage_path', f.storage_path),
    'can_write', public.fin_can_write(c.company_id), 'same_file', same);
END $$;

CREATE OR REPLACE FUNCTION public.fin_cap_set_extraction(_id uuid, _sha text, _ok boolean, _extraction jsonb, _error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Capture introuvable'; END IF;
  UPDATE public.fin_doc_captures SET file_sha256 = coalesce(_sha, file_sha256),
    extraction = CASE WHEN _ok THEN _extraction ELSE extraction END,
    extracted_at = CASE WHEN _ok THEN now() ELSE extracted_at END,
    extract_error = CASE WHEN _ok THEN NULL ELSE _error END,
    extract_count = extract_count + 1,
    status = CASE WHEN status IN ('traite','ecarte') THEN status WHEN _ok THEN 'a_verifier' ELSE 'echec' END,
    rev = rev + 1, updated_at = now()
  WHERE id = _id RETURNING * INTO c;
  INSERT INTO public.fin_doc_capture_events(capture_id, company_id, action, reason, detail, actor)
  VALUES (c.id, c.company_id, CASE WHEN _ok THEN 'extract_ok' ELSE 'extract_fail' END, _error, NULL, NULL);
END $$;
REVOKE ALL ON FUNCTION public.fin_cap_set_extraction(uuid, text, boolean, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_cap_set_extraction(uuid, text, boolean, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fin_cap_begin_extract(_id uuid, _force boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF c.status = 'lecture' AND c.updated_at > now() - interval '3 minutes' THEN RETURN 'busy'; END IF;
  IF c.extraction IS NOT NULL AND NOT coalesce(_force, false) THEN RETURN 'cached'; END IF;
  UPDATE public.fin_doc_captures SET status = 'lecture', updated_at = now() WHERE id = _id;
  PERFORM public.fin_cap_log(c, 'extract_start', NULL, jsonb_build_object('force', coalesce(_force,false)));
  RETURN 'go';
END $$;

CREATE OR REPLACE FUNCTION public.fin_cap_save_edits(_id uuid, _edits jsonb, _rev integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _rev IS DISTINCT FROM c.rev THEN RAISE EXCEPTION 'Conflit : document modifié ailleurs. Rechargez.' USING ERRCODE='P0409'; END IF;
  IF jsonb_typeof(_edits) <> 'object' OR length(_edits::text) > 50000 THEN RAISE EXCEPTION 'Saisie invalide'; END IF;
  UPDATE public.fin_doc_captures SET edits = _edits, rev = rev + 1, updated_at = now() WHERE id = _id RETURNING * INTO c;
  RETURN jsonb_build_object('rev', c.rev);
END $$;

CREATE OR REPLACE FUNCTION public.fin_cap_create(_id uuid, _kind text, _index integer, _p jsonb, _dup_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures; r jsonb; p jsonb; d jsonb; k text; n integer;
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
  IF _kind = 'bill' THEN
    d := public.fin_bill_dups(c.company_id, NULL, p);
    IF jsonb_array_length(d->'exact') > 0 AND nullif(btrim(coalesce(_dup_reason,'')),'') IS NULL THEN
      RAISE EXCEPTION 'Document déjà enregistré : ouvrez-le ou joignez-y la pièce (exception motivée possible)' USING ERRCODE='P0409'; END IF;
    r := public.fin_bill_save(c.company_id, NULL, p, NULL, k);
  ELSE
    r := public.fin_scr_save(c.company_id, NULL, p, NULL, k);
  END IF;
  r := jsonb_build_object('kind', _kind, 'id', r->>'id', 'index', _index, 'key', k, 'at', now());
  UPDATE public.fin_doc_captures SET results = results || jsonb_build_array(r), status = 'traite', rev = rev + 1, updated_at = now() WHERE id = _id;
  PERFORM public.fin_cap_log(c, 'create_' || _kind, nullif(btrim(coalesce(_dup_reason,'')),''), r);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fin_cap_attach(_id uuid, _bill uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures; b public.fin_supplier_bills; r jsonb; k text;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _bill AND company_id = c.company_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Facture hors de cette entreprise' USING ERRCODE='42501'; END IF;
  k := 'att:' || _bill::text;
  SELECT x INTO r FROM jsonb_array_elements(c.results) x WHERE x->>'key' = k;
  IF r IS NOT NULL THEN RETURN r || jsonb_build_object('replay', true); END IF;
  r := jsonb_build_object('kind', 'attached', 'id', _bill, 'key', k, 'at', now());
  UPDATE public.fin_doc_captures SET results = results || jsonb_build_array(r), status = 'traite', rev = rev + 1, updated_at = now() WHERE id = _id;
  PERFORM public.fin_cap_log(c, 'attach', NULL, r);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fin_cap_dismiss(_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Motif requis'; END IF;
  UPDATE public.fin_doc_captures SET status = 'ecarte', dismiss_reason = _reason, rev = rev + 1, updated_at = now() WHERE id = _id;
  PERFORM public.fin_cap_log(c, 'dismiss', _reason, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.fin_cap_for_bill(_bill uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.fin_supplier_bills; o jsonb;
BEGIN
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _bill;
  IF b.id IS NULL OR NOT public.fin_can_read(b.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('capture_id', c.id, 'file_id', c.file_id, 'name', f.file_name, 'kind', x->>'kind', 'at', x->>'at')), '[]') INTO o
  FROM public.fin_doc_captures c JOIN public.ent_crm_files f ON f.id = c.file_id CROSS JOIN LATERAL jsonb_array_elements(c.results) x
  WHERE c.company_id = b.company_id AND x->>'id' = _bill::text;
  RETURN o;
END $$;

REVOKE ALL ON FUNCTION public.fin_cap_register(uuid,uuid), public.fin_cap_detail(uuid), public.fin_cap_begin_extract(uuid,boolean), public.fin_cap_save_edits(uuid,jsonb,integer),
  public.fin_cap_create(uuid,text,integer,jsonb,text), public.fin_cap_attach(uuid,uuid), public.fin_cap_dismiss(uuid,text), public.fin_cap_for_bill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cap_register(uuid,uuid), public.fin_cap_detail(uuid), public.fin_cap_begin_extract(uuid,boolean), public.fin_cap_save_edits(uuid,jsonb,integer),
  public.fin_cap_create(uuid,text,integer,jsonb,text), public.fin_cap_attach(uuid,uuid), public.fin_cap_dismiss(uuid,text), public.fin_cap_for_bill(uuid) TO authenticated, service_role;