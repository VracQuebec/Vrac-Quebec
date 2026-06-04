ALTER TABLE public.lead_trips ALTER COLUMN submission_id DROP NOT NULL;
ALTER TABLE public.lead_trips ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
