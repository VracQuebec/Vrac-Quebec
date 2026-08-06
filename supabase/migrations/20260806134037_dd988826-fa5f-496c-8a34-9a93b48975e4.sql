ALTER TABLE public.jsc_materials
  ADD COLUMN IF NOT EXISTS allowed_units text[] NOT NULL DEFAULT ARRAY['tonne','m3','verge']::text[];