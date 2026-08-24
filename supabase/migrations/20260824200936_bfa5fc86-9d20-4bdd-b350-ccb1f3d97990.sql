ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS callara_call_id text;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_callara_call_id_unique ON public.submissions (callara_call_id) WHERE callara_call_id IS NOT NULL;
COMMENT ON COLUMN public.submissions.callara_call_id IS 'Identifiant unique de l''appel Callara (idempotence du webhook callara-webhook).';