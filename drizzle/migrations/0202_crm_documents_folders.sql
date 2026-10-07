ALTER TABLE public.crm_documents ADD COLUMN IF NOT EXISTS folders text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS crm_documents_folders_gin ON public.crm_documents USING gin (folders);