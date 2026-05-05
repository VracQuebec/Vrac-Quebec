
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS visible_to_entrepreneur boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT '';
