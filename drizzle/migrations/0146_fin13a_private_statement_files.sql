-- FIN-13A : original du relevé CSV conservé en privé dans la base (le stockage de pièces n'accepte pas le CSV).
CREATE TABLE public.fin_bank_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  file_name text NOT NULL,
  sha256 text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes <= 2097152),
  content text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_bank_files_sha ON public.fin_bank_files(company_id, sha256);
GRANT SELECT ON public.fin_bank_files TO authenticated;
GRANT ALL ON public.fin_bank_files TO service_role;
ALTER TABLE public.fin_bank_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_bank_files_read ON public.fin_bank_files FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

ALTER TABLE public.fin_bank_imports ADD COLUMN source_file_id uuid REFERENCES public.fin_bank_files(id);

CREATE OR REPLACE FUNCTION public.fin_bank_file_put(_company uuid, _name text, _content text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE h text; fid uuid; sz int;
BEGIN
  PERFORM public.fin_bank_guard(_company, true);
  sz := octet_length(convert_to(coalesce(_content,''), 'UTF8'));
  IF sz = 0 THEN RAISE EXCEPTION 'Fichier vide' USING ERRCODE = '22023'; END IF;
  IF sz > 2097152 THEN RAISE EXCEPTION 'Fichier trop lourd (2 Mo au maximum)' USING ERRCODE = '22023'; END IF;
  h := encode(extensions.digest(convert_to(_content, 'UTF8'), 'sha256'), 'hex');
  SELECT id INTO fid FROM public.fin_bank_files WHERE company_id = _company AND sha256 = h AND file_name = left(coalesce(_name,'releve.csv'), 200) LIMIT 1;
  IF fid IS NULL THEN
    INSERT INTO public.fin_bank_files(company_id, file_name, sha256, size_bytes, content) VALUES (_company, left(coalesce(_name,'releve.csv'), 200), h, sz, _content) RETURNING id INTO fid;
  END IF;
  RETURN jsonb_build_object('id', fid, 'sha', h);
END $$;

-- Toute validation doit référencer un original déposé (même entreprise, même empreinte).
CREATE OR REPLACE FUNCTION public.fin_bank_import_file_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT f.id INTO NEW.source_file_id FROM public.fin_bank_files f WHERE f.company_id = NEW.company_id AND f.sha256 = NEW.file_sha256 ORDER BY (f.file_name = NEW.file_name) DESC, f.created_at DESC LIMIT 1;
  IF NEW.source_file_id IS NULL THEN RAISE EXCEPTION 'Original du relevé introuvable : déposez le fichier avant de valider' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_bank_import_file_link BEFORE INSERT ON public.fin_bank_imports FOR EACH ROW EXECUTE FUNCTION public.fin_bank_import_file_link();

CREATE OR REPLACE FUNCTION public.fin_bank_file_get(_import uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT i.company_id, f.file_name, f.content, f.sha256 INTO r FROM public.fin_bank_imports i JOIN public.fin_bank_files f ON f.id = i.source_file_id WHERE i.id = _import;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original introuvable' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_bank_guard(r.company_id, false);
  RETURN jsonb_build_object('file_name', r.file_name, 'content', r.content, 'sha', r.sha256);
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_bank_file_put(uuid, text, text), public.fin_bank_file_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_bank_file_put(uuid, text, text), public.fin_bank_file_get(uuid) TO authenticated;