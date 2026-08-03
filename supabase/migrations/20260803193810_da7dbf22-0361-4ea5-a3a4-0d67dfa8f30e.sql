ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS service_type text;
COMMENT ON COLUMN public.submissions.service_type IS 'Type de service choisi par le client: remblai_disposition | materiel_remplissage | vrac_achat';
CREATE INDEX IF NOT EXISTS idx_submissions_service_type ON public.submissions (service_type);