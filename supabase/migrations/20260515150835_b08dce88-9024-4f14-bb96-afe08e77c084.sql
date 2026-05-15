ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS show_on_admin_map boolean NOT NULL DEFAULT true;