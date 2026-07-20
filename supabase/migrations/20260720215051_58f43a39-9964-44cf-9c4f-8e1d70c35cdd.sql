
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS related_city_slugs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS related_material_slugs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS related_service_slugs text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS blog_posts_related_cities_idx
  ON public.blog_posts USING gin (related_city_slugs);
CREATE INDEX IF NOT EXISTS blog_posts_related_materials_idx
  ON public.blog_posts USING gin (related_material_slugs);
CREATE INDEX IF NOT EXISTS blog_posts_related_services_idx
  ON public.blog_posts USING gin (related_service_slugs);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seo_pages_combo_unique'
  ) THEN
    ALTER TABLE public.seo_pages
      ADD CONSTRAINT seo_pages_combo_unique UNIQUE (city_slug, material_slug, service_slug);
  END IF;
END $$;
