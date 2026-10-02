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
    rev = rev + 1 WHERE id = c.id RETURNING * INTO c;
  PERFORM public.fin_cap_log(c, 'to_expense', NULL, jsonb_build_object('exp_file_id', f.id));
  RETURN jsonb_build_object('ok', true, 'extraction', c.extraction IS NOT NULL);
END $function$;