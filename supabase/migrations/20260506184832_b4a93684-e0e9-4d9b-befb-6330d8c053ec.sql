ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS dompe_number text DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_submissions_dompe_number ON public.submissions(dompe_number);