ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS og_title TEXT,
  ADD COLUMN IF NOT EXISTS og_description TEXT;

NOTIFY pgrst, 'reload schema';