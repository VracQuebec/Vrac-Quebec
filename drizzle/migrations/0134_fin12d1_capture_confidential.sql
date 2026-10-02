ALTER TABLE public.fin_doc_captures ADD COLUMN IF NOT EXISTS exp_file_id uuid REFERENCES public.fin_exp_files(id);
COMMENT ON COLUMN public.fin_doc_captures.exp_file_id IS 'FIN-12D1 : copie privée dans une note de frais; source et résultats OCR visibles seulement par qui peut voir la note';

UPDATE public.fin_doc_captures c SET exp_file_id = f.id
FROM public.fin_exp_files f
WHERE c.exp_file_id IS NULL AND c.status = 'ecarte' AND f.company_id = c.company_id AND f.sha256 IS NOT NULL AND f.sha256 = c.file_sha256;

CREATE OR REPLACE FUNCTION public.fin_crm_file_exp_ok(_file uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.fin_doc_captures c
    WHERE (c.file_id = _file OR c.converted_file_id = _file) AND c.exp_file_id IS NOT NULL AND NOT public.fin_exp_file_visible(c.exp_file_id)) $$;
REVOKE ALL ON FUNCTION public.fin_crm_file_exp_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_crm_file_exp_ok(uuid) TO authenticated;

DROP POLICY IF EXISTS r ON public.fin_doc_captures;
CREATE POLICY r ON public.fin_doc_captures FOR SELECT TO authenticated
  USING (public.fin_can_read(company_id) AND (exp_file_id IS NULL OR public.fin_exp_file_visible(exp_file_id)));

DROP POLICY IF EXISTS r ON public.ent_crm_files;
CREATE POLICY r ON public.ent_crm_files FOR SELECT TO authenticated
  USING ((public.entcrm_can_commercial(company_id) OR (is_field AND public.entcrm_can_field(company_id))) AND public.fin_crm_file_exp_ok(id));

CREATE OR REPLACE FUNCTION public.fin_cap_detail(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.fin_doc_captures; f public.ent_crm_files; v public.ent_crm_files; same jsonb;
BEGIN
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _id;
  IF c.id IS NULL OR NOT public.fin_can_read(c.company_id) OR (c.exp_file_id IS NOT NULL AND NOT public.fin_exp_file_visible(c.exp_file_id)) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO f FROM public.ent_crm_files WHERE id = c.file_id;
  IF c.converted_file_id IS NOT NULL THEN SELECT * INTO v FROM public.ent_crm_files WHERE id = c.converted_file_id; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'results', o.results, 'created_at', o.created_at)), '[]') INTO same
    FROM public.fin_doc_captures o WHERE o.company_id = c.company_id AND o.id <> c.id AND c.file_sha256 IS NOT NULL AND o.file_sha256 = c.file_sha256
      AND (o.exp_file_id IS NULL OR public.fin_exp_file_visible(o.exp_file_id));
  RETURN to_jsonb(c) || jsonb_build_object('file', jsonb_build_object('id', f.id, 'name', f.file_name, 'mime', f.mime_type, 'size', f.size_bytes, 'storage_path', f.storage_path),
    'converted', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id', v.id, 'name', v.file_name, 'mime', v.mime_type, 'size', v.size_bytes, 'storage_path', v.storage_path) END,
    'can_write', public.fin_can_write(c.company_id), 'same_file', same);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_exp_file_from_capture(_file uuid, _capture uuid, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f public.fin_exp_files; c public.fin_doc_captures;
BEGIN
  SELECT * INTO f FROM public.fin_exp_files WHERE id = _file FOR UPDATE;
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _capture FOR UPDATE;
  IF f.id IS NULL OR c.id IS NULL OR f.company_id <> c.company_id OR f.owner_id <> auth.uid() OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF f.sha256 IS NULL OR c.file_sha256 IS NULL OR f.sha256 <> c.file_sha256 THEN RAISE EXCEPTION 'Copie différente de la pièce d''origine' USING ERRCODE='P0410'; END IF;
  IF c.exp_file_id IS NOT NULL AND c.exp_file_id <> f.id THEN RAISE EXCEPTION 'Pièce déjà orientée vers une autre note de frais' USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_exp_files SET extraction = c.extraction, extract_status = CASE WHEN c.extraction IS NULL THEN 'aucune' ELSE 'ok' END, extracted_at = c.extracted_at, updated_at = now() WHERE id = f.id;
  UPDATE public.fin_doc_captures SET exp_file_id = f.id,
    status = CASE WHEN status IN ('traite','ecarte') THEN status ELSE 'ecarte' END,
    dismiss_reason = CASE WHEN status IN ('traite','ecarte') THEN dismiss_reason ELSE left(coalesce(nullif(btrim(_reason),''), 'Orienté vers une note de frais (payé par un employé)'), 300) END,
    rev = rev + 1 WHERE id = c.id;
  PERFORM public.fin_cap_log(c.company_id, c.id, 'to_expense', jsonb_build_object('exp_file_id', f.id));
  RETURN jsonb_build_object('ok', true, 'extraction', c.extraction IS NOT NULL);
END $function$;