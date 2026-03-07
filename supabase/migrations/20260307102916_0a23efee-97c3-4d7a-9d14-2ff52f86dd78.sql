
-- Add submission_number, latitude, longitude columns
ALTER TABLE public.submissions 
  ADD COLUMN IF NOT EXISTS submission_number serial,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
