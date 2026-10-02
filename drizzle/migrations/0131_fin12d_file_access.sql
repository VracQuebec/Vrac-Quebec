CREATE OR REPLACE FUNCTION public.fin_exp_file_visible(_file uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fin_exp_files x WHERE x.id = _file AND (public.fin_exp_can_see(x.company_id, x.owner_id)
    OR EXISTS (SELECT 1 FROM public.fin_exp_lines l JOIN public.fin_exp_reports r ON r.id = l.report_id WHERE l.file_id = x.id AND public.fin_exp_can_see(r.company_id, r.employee_id))
    OR EXISTS (SELECT 1 FROM public.fin_exp_advances a WHERE a.proof_file_id = x.id AND public.fin_exp_can_see(a.company_id, a.employee_id))
    OR EXISTS (SELECT 1 FROM public.fin_exp_restitutions t JOIN public.fin_exp_advances a ON a.id = t.advance_id WHERE t.proof_file_id = x.id AND public.fin_exp_can_see(a.company_id, a.employee_id)))) $$;

CREATE OR REPLACE FUNCTION public.fin_exp_path_ok(_name text, _write boolean) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f text[] := string_to_array(_name, '/'); c uuid; u uuid;
BEGIN
  IF array_length(f,1) <> 4 OR f[1] <> 'company' THEN RETURN false; END IF;
  BEGIN c := f[2]::uuid; u := f[3]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  IF _write THEN RETURN u = auth.uid() AND (public.fin_exp_member(c, auth.uid()) OR public.fin_can_write(c)); END IF;
  RETURN EXISTS (SELECT 1 FROM public.fin_exp_files x WHERE x.company_id = c AND (x.storage_path = _name OR x.converted_path = _name) AND public.fin_exp_file_visible(x.id));
END $$;

DROP POLICY IF EXISTS r ON public.fin_exp_files;
CREATE POLICY r ON public.fin_exp_files FOR SELECT TO authenticated USING (public.fin_exp_file_visible(id));

CREATE OR REPLACE FUNCTION public.fin_exp_file_set_converted(_id uuid, _converted text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fin_exp_files;
BEGIN
  SELECT * INTO f FROM public.fin_exp_files WHERE id = _id FOR UPDATE;
  IF f.id IS NULL OR f.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF f.mime <> 'image/heic' THEN RAISE EXCEPTION 'Conversion réservée aux photos HEIC'; END IF;
  IF f.converted_path IS NOT NULL THEN RETURN; END IF;
  IF _converted NOT LIKE 'company/'||f.company_id||'/'||auth.uid()||'/%' THEN RAISE EXCEPTION 'Pièce hors de votre dossier' USING ERRCODE='42501'; END IF;
  UPDATE public.fin_exp_files SET converted_path = _converted, updated_at = now() WHERE id = f.id;
END $$;

-- Reprise d'une lecture FIN-12C déjà faite (aucune nouvelle consommation) : seulement si même entreprise et même empreinte de fichier.
CREATE OR REPLACE FUNCTION public.fin_exp_file_from_capture(_file uuid, _capture uuid, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fin_exp_files; c public.fin_doc_captures;
BEGIN
  SELECT * INTO f FROM public.fin_exp_files WHERE id = _file FOR UPDATE;
  SELECT * INTO c FROM public.fin_doc_captures WHERE id = _capture FOR UPDATE;
  IF f.id IS NULL OR c.id IS NULL OR f.company_id <> c.company_id OR f.owner_id <> auth.uid() OR NOT public.fin_can_write(c.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF f.sha256 IS NULL OR c.file_sha256 IS NULL OR f.sha256 <> c.file_sha256 THEN RAISE EXCEPTION 'Copie différente de la pièce d''origine' USING ERRCODE='P0410'; END IF;
  UPDATE public.fin_exp_files SET extraction = c.extraction, extract_status = CASE WHEN c.extraction IS NULL THEN 'aucune' ELSE 'ok' END, extracted_at = c.extracted_at, updated_at = now() WHERE id = f.id;
  IF c.status NOT IN ('traite','ecarte') THEN
    UPDATE public.fin_doc_captures SET status = 'ecarte', dismiss_reason = left(coalesce(nullif(btrim(_reason),''), 'Orienté vers une note de frais (payé par un employé)'), 300), rev = rev + 1 WHERE id = c.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'extraction', c.extraction IS NOT NULL);
END $$;

REVOKE ALL ON FUNCTION public.fin_exp_file_set_converted(uuid,text), public.fin_exp_file_from_capture(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_exp_file_set_converted(uuid,text), public.fin_exp_file_from_capture(uuid,uuid,text), public.fin_exp_file_visible(uuid) TO authenticated;