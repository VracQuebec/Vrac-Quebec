ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS quote_number text,
  ADD COLUMN IF NOT EXISTS quote_id uuid,
  ADD COLUMN IF NOT EXISTS quote_material text,
  ADD COLUMN IF NOT EXISTS quote_quantity numeric,
  ADD COLUMN IF NOT EXISTS quote_unit text,
  ADD COLUMN IF NOT EXISTS quote_tonnage numeric,
  ADD COLUMN IF NOT EXISTS quote_trips integer,
  ADD COLUMN IF NOT EXISTS quote_truck text,
  ADD COLUMN IF NOT EXISTS quote_distance_km numeric,
  ADD COLUMN IF NOT EXISTS quote_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS quote_total numeric;

CREATE INDEX IF NOT EXISTS idx_submissions_quote_number ON public.submissions (quote_number);