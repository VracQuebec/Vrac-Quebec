ALTER TABLE public.jsc_trucks
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS public_image_url text,
  ADD COLUMN IF NOT EXISTS public_uses text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS access_requirements text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS limitations text[] DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.jsc_public_truck_profiles()
RETURNS TABLE (
  id uuid, name text, truck_type text, capacity_tonnes numeric, capacity_m3 numeric,
  axle_count integer, public_description text, public_image_url text,
  public_uses text[], access_requirements text[], limitations text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.truck_type::text, t.capacity_tonnes::numeric, t.capacity_m3::numeric,
         t.axle_count, t.public_description, t.public_image_url,
         COALESCE(t.public_uses, '{}'::text[]), COALESCE(t.access_requirements, '{}'::text[]),
         COALESCE(t.limitations, '{}'::text[])
  FROM public.jsc_trucks t
  WHERE t.is_public AND t.archived_at IS NULL
  ORDER BY COALESCE(t.sort_order, 0), t.capacity_tonnes ASC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.jsc_public_truck_profiles() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.jsc_public_materials_calc()
RETURNS TABLE (slug text, name text, density_kg_per_m3 numeric, allowed_units text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.slug, m.name, m.density_kg_per_m3::numeric,
         COALESCE(NULLIF(m.allowed_units, '{}'::text[]), ARRAY['tonne']::text[])
  FROM public.jsc_materials m
  WHERE m.is_active AND m.is_public AND m.archived_at IS NULL
    AND m.density_kg_per_m3 IS NOT NULL AND m.density_kg_per_m3 > 0
  ORDER BY m.sort_order, m.name;
$$;
GRANT EXECUTE ON FUNCTION public.jsc_public_materials_calc() TO anon, authenticated;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS access_heavy_truck text,
  ADD COLUMN IF NOT EXISTS access_details jsonb,
  ADD COLUMN IF NOT EXISTS availability_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.submissions_touch_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.availability_status IS DISTINCT FROM OLD.availability_status
     OR NEW.availability_note IS DISTINCT FROM OLD.availability_note THEN
    NEW.availability_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_submissions_touch_availability ON public.submissions;
CREATE TRIGGER trg_submissions_touch_availability
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.submissions_touch_availability();