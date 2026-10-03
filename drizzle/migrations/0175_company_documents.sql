CREATE TABLE public.ent_company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('assurance','rpevl','rcv','req','permis','cnesst','vehicule','autre')),
  title text NOT NULL,
  reference text,
  issuer text,
  issued_on date,
  expires_on date,
  notes text,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  archived_at timestamptz,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path LIKE company_id::text || '/%')
);
CREATE INDEX ON public.ent_company_documents(company_id, category);
GRANT SELECT, INSERT, UPDATE ON public.ent_company_documents TO authenticated;
GRANT ALL ON public.ent_company_documents TO service_role;
ALTER TABLE public.ent_company_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecd_read ON public.ent_company_documents FOR SELECT TO authenticated USING (public.entcrm_can_read(company_id));
CREATE POLICY ecd_insert ON public.ent_company_documents FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY ecd_update ON public.ent_company_documents FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id)) WITH CHECK (public.entcrm_can_write(company_id));

CREATE POLICY company_docs_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-docs' AND public.entcrm_can_read(((storage.foldername(name))[1])::uuid));
CREATE POLICY company_docs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-docs' AND public.entcrm_can_write(((storage.foldername(name))[1])::uuid));