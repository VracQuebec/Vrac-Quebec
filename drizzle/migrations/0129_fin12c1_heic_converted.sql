ALTER TABLE public.fin_doc_captures ADD COLUMN IF NOT EXISTS converted_file_id uuid REFERENCES public.ent_crm_files(id);

CREATE OR REPLACE FUNCTION public.fin_cap_set_converted(_id uuid, _file uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures; o public.ent_crm_files; f public.ent_crm_files;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO o FROM public.ent_crm_files WHERE id = c.file_id;
  IF o.mime_type <> 'image/heic' THEN RAISE EXCEPTION 'Conversion réservée aux photos HEIC'; END IF;
  SELECT * INTO f FROM public.ent_crm_files WHERE id = _file AND company_id = c.company_id AND archived_at IS NULL;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Pièce hors de cette entreprise' USING ERRCODE='42501'; END IF;
  IF f.mime_type <> 'image/jpeg' OR coalesce(f.size_bytes,0) > 20*1024*1024 OR f.storage_path NOT LIKE 'company/' || c.company_id || '/%' THEN RAISE EXCEPTION 'Conversion invalide (JPEG ≤ 20 Mo attendu)'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_doc_captures WHERE file_id = _file) THEN RAISE EXCEPTION 'Cette pièce est déjà un document distinct'; END IF;
  IF c.converted_file_id = _file THEN RETURN jsonb_build_object('replay', true); END IF;
  UPDATE public.fin_doc_captures SET converted_file_id = _file, status = CASE WHEN status = 'echec' THEN 'ajoute' ELSE status END, extract_error = CASE WHEN status = 'echec' THEN NULL ELSE extract_error END, rev = rev + 1, updated_at = now() WHERE id = _id RETURNING * INTO c;
  PERFORM public.fin_cap_log(c, 'convert', NULL, jsonb_build_object('file', f.file_name, 'size', f.size_bytes));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.fin_cap_set_converted(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cap_set_converted(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_cap_detail(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fin_doc_captures; f public.ent_crm_files; v public.ent_crm_files; same jsonb;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id;
  IF c.id IS NULL OR NOT public.fin_can_read(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO f FROM public.ent_crm_files WHERE id = c.file_id;
  IF c.converted_file_id IS NOT NULL THEN SELECT * INTO v FROM public.ent_crm_files WHERE id = c.converted_file_id; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'results', o.results, 'created_at', o.created_at)), '[]') INTO same
    FROM public.fin_doc_captures o WHERE o.company_id = c.company_id AND o.id <> c.id AND c.file_sha256 IS NOT NULL AND o.file_sha256 = c.file_sha256;
  RETURN to_jsonb(c) || jsonb_build_object('file', jsonb_build_object('id', f.id, 'name', f.file_name, 'mime', f.mime_type, 'size', f.size_bytes, 'storage_path', f.storage_path),
    'converted', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id', v.id, 'name', v.file_name, 'mime', v.mime_type, 'size', v.size_bytes, 'storage_path', v.storage_path) END,
    'can_write', public.fin_can_write(c.company_id), 'same_file', same);
END $$;