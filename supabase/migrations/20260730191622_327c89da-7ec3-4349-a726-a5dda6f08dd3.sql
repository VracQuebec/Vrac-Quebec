-- 1) Matériaux enrichis
ALTER TABLE public.jsc_materials
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'disponible',
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_text text,
  ADD COLUMN IF NOT EXISTS margin_percent numeric,
  ADD COLUMN IF NOT EXISTS promo_price numeric,
  ADD COLUMN IF NOT EXISTS promo_starts_on date,
  ADD COLUMN IF NOT EXISTS promo_ends_on date;

CREATE OR REPLACE FUNCTION public.unaccent_immutable(_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT translate(_text,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY');
$$;

CREATE OR REPLACE FUNCTION public.jsc_material_slugify(_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(both '-' from regexp_replace(
    lower(public.unaccent_immutable(coalesce(_text, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.jsc_materials_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    NEW.slug := public.jsc_material_slugify(NEW.name);
  ELSE
    NEW.slug := public.jsc_material_slugify(NEW.slug);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jsc_materials_before_write ON public.jsc_materials;
CREATE TRIGGER jsc_materials_before_write
BEFORE INSERT OR UPDATE ON public.jsc_materials
FOR EACH ROW EXECUTE FUNCTION public.jsc_materials_before_write();

UPDATE public.jsc_materials SET slug = public.jsc_material_slugify(name) WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_materials_slug_company_key
  ON public.jsc_materials (company_id, slug) WHERE archived_at IS NULL;

-- 2) Fournisseurs enrichis
ALTER TABLE public.jsc_suppliers
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS opening_hours text,
  ADD COLUMN IF NOT EXISTS website text;

-- 3) Camions enrichis
ALTER TABLE public.jsc_trucks
  ADD COLUMN IF NOT EXISTS axle_count integer,
  ADD COLUMN IF NOT EXISTS per_km_rate numeric,
  ADD COLUMN IF NOT EXISTS per_trip_rate numeric,
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'disponible';

-- 4) Transporteurs enrichis
ALTER TABLE public.jsc_companies
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'disponible';

-- 5) Recommandations entre matériaux
CREATE TABLE IF NOT EXISTS public.jsc_material_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  material_id uuid NOT NULL REFERENCES public.jsc_materials(id) ON DELETE CASCADE,
  related_material_id uuid NOT NULL REFERENCES public.jsc_materials(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'similaire',
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_material_recommendations TO authenticated;
GRANT ALL ON public.jsc_material_recommendations TO service_role;
ALTER TABLE public.jsc_material_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage material recommendations" ON public.jsc_material_recommendations;
CREATE POLICY "Admins manage material recommendations"
ON public.jsc_material_recommendations FOR ALL TO authenticated
USING (public.jsc_can_manage(auth.uid()))
WITH CHECK (public.jsc_can_manage(auth.uid()));

DROP TRIGGER IF EXISTS touch_jsc_material_recommendations ON public.jsc_material_recommendations;
CREATE TRIGGER touch_jsc_material_recommendations
BEFORE UPDATE ON public.jsc_material_recommendations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_jsc_material_recommendations ON public.jsc_material_recommendations;
CREATE TRIGGER audit_jsc_material_recommendations
AFTER INSERT OR UPDATE OR DELETE ON public.jsc_material_recommendations
FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger();

CREATE INDEX IF NOT EXISTS jsc_material_recommendations_material_idx
  ON public.jsc_material_recommendations (material_id);

-- 6) Catalogue public : uniquement les informations vitrine
CREATE OR REPLACE FUNCTION public.jsc_public_catalog()
RETURNS TABLE (
  slug text, name text, category text, subcategory text, unit text,
  public_description text, cover_image_url text, images text[], uses text[],
  availability text, seo_title text, seo_description text, seo_keywords text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.slug, m.name,
         COALESCE(c.name, m.category) AS category,
         m.subcategory, m.unit, m.public_description, m.cover_image_url,
         m.images, m.uses, m.availability, m.seo_title, m.seo_description, m.seo_keywords
  FROM public.jsc_materials m
  LEFT JOIN public.jsc_material_categories c ON c.id = m.category_id
  WHERE m.is_active AND m.is_public AND m.archived_at IS NULL
  ORDER BY COALESCE(c.sort_order, 0), m.sort_order, m.name;
$$;

CREATE OR REPLACE FUNCTION public.jsc_public_material(_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'slug', m.slug,
    'name', m.name,
    'category', COALESCE(c.name, m.category),
    'subcategory', m.subcategory,
    'unit', m.unit,
    'public_description', m.public_description,
    'seo_text', m.seo_text,
    'cover_image_url', m.cover_image_url,
    'images', m.images,
    'uses', m.uses,
    'availability', m.availability,
    'seo_title', m.seo_title,
    'seo_description', m.seo_description,
    'seo_keywords', m.seo_keywords,
    'recommendations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'slug', rm.slug, 'name', rm.name, 'relation_type', r.relation_type,
               'cover_image_url', rm.cover_image_url,
               'public_description', rm.public_description)
             ORDER BY r.sort_order, rm.name)
      FROM public.jsc_material_recommendations r
      JOIN public.jsc_materials rm ON rm.id = r.related_material_id
      WHERE r.material_id = m.id AND r.is_active AND r.archived_at IS NULL
        AND rm.is_active AND rm.is_public AND rm.archived_at IS NULL
    ), '[]'::jsonb)
  )
  FROM public.jsc_materials m
  LEFT JOIN public.jsc_material_categories c ON c.id = m.category_id
  WHERE m.slug = _slug AND m.is_active AND m.is_public AND m.archived_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.jsc_public_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jsc_public_material(text) TO anon, authenticated;