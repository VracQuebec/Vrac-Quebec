ALTER TABLE public.entrepreneurs
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS province_name text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS postal_sector text;

COMMENT ON COLUMN public.entrepreneurs.city IS 'Ville normalisée dérivée de address (pipeline localisation.ts). NULL si non fiable.';
COMMENT ON COLUMN public.entrepreneurs.province IS 'Code province normalisé (ex. QC). NULL si non fiable.';
COMMENT ON COLUMN public.entrepreneurs.province_name IS 'Nom officiel de la province. NULL si non fiable.';
COMMENT ON COLUMN public.entrepreneurs.region IS 'Région administrative issue du référentiel local uniquement. NULL si non déterminable.';
COMMENT ON COLUMN public.entrepreneurs.postal_sector IS 'Secteur postal (3 premiers caractères). Le code postal complet reste privé dans address.';