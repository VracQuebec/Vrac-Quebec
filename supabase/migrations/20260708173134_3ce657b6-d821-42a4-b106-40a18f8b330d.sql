
CREATE TYPE public.blog_post_status AS ENUM ('draft', 'published', 'scheduled', 'archived');

-- Fallback unaccent
CREATE OR REPLACE FUNCTION public.unaccent_string(input TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(
    COALESCE(input, ''),
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝŸýÿÑñÇç',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuYYyyNnCc'
  );
$$;

CREATE OR REPLACE FUNCTION public.blog_slugify(input TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE s TEXT;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  s := lower(public.unaccent_string(input));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '(^-+|-+$)', '', 'g');
  RETURN s;
END;
$$;

-- blog_categories
CREATE TABLE public.blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  icon TEXT,
  color TEXT DEFAULT '#7ED321',
  sort_order INT NOT NULL DEFAULT 0,
  meta_title TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_categories TO authenticated;
GRANT ALL ON public.blog_categories TO service_role;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_categories public read" ON public.blog_categories FOR SELECT USING (true);
CREATE POLICY "blog_categories admin write" ON public.blog_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- blog_authors
CREATE TABLE public.blog_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  title TEXT,
  bio TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_authors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_authors TO authenticated;
GRANT ALL ON public.blog_authors TO service_role;
ALTER TABLE public.blog_authors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_authors public read" ON public.blog_authors FOR SELECT USING (true);
CREATE POLICY "blog_authors admin write" ON public.blog_authors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- blog_tags
CREATE TABLE public.blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_tags TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_tags TO authenticated;
GRANT ALL ON public.blog_tags TO service_role;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_tags public read" ON public.blog_tags FOR SELECT USING (true);
CREATE POLICY "blog_tags admin write" ON public.blog_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- blog_posts
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  previous_slugs TEXT[] NOT NULL DEFAULT '{}',
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL DEFAULT '',
  content_format TEXT NOT NULL DEFAULT 'html',
  cover_image_url TEXT,
  cover_image_alt TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES public.blog_authors(id) ON DELETE SET NULL,
  status public.blog_post_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  meta_title TEXT,
  meta_description TEXT,
  canonical_url TEXT,
  og_image_url TEXT,
  reading_time_minutes INT NOT NULL DEFAULT 1,
  view_count INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  noindex BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_tsv tsvector
);
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;
CREATE INDEX blog_posts_status_pub_idx ON public.blog_posts (status, published_at DESC);
CREATE INDEX blog_posts_category_idx ON public.blog_posts (category_id);
CREATE INDEX blog_posts_featured_idx ON public.blog_posts (is_featured) WHERE is_featured;
CREATE INDEX blog_posts_popular_idx ON public.blog_posts (is_popular) WHERE is_popular;
CREATE INDEX blog_posts_previous_slugs_idx ON public.blog_posts USING GIN (previous_slugs);
CREATE INDEX blog_posts_search_idx ON public.blog_posts USING GIN (search_tsv);
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_posts public read published" ON public.blog_posts FOR SELECT
  USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now());
CREATE POLICY "blog_posts admin all" ON public.blog_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- blog_post_tags
CREATE TABLE public.blog_post_tags (
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
GRANT SELECT ON public.blog_post_tags TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_post_tags TO authenticated;
GRANT ALL ON public.blog_post_tags TO service_role;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_post_tags public read" ON public.blog_post_tags FOR SELECT USING (true);
CREATE POLICY "blog_post_tags admin write" ON public.blog_post_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- blog_post_related
CREATE TABLE public.blog_post_related (
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  related_post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, related_post_id),
  CHECK (post_id <> related_post_id)
);
GRANT SELECT ON public.blog_post_related TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_post_related TO authenticated;
GRANT ALL ON public.blog_post_related TO service_role;
ALTER TABLE public.blog_post_related ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_post_related public read" ON public.blog_post_related FOR SELECT USING (true);
CREATE POLICY "blog_post_related admin write" ON public.blog_post_related FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- blog_post_views
CREATE TABLE public.blog_post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  ip_hash TEXT,
  user_agent TEXT,
  referrer TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.blog_post_views TO service_role;
GRANT SELECT ON public.blog_post_views TO authenticated;
CREATE INDEX blog_post_views_post_idx ON public.blog_post_views (post_id, viewed_at DESC);
ALTER TABLE public.blog_post_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_post_views admin read" ON public.blog_post_views FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Triggers
CREATE TRIGGER trg_blog_categories_updated BEFORE UPDATE ON public.blog_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_blog_authors_updated BEFORE UPDATE ON public.blog_authors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_blog_posts_updated BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.blog_posts_before_write() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  word_count INT;
  plain TEXT;
BEGIN
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    NEW.slug := public.blog_slugify(NEW.title);
    IF EXISTS (SELECT 1 FROM public.blog_posts WHERE slug = NEW.slug AND id <> NEW.id) THEN
      NEW.slug := NEW.slug || '-' || substr(NEW.id::text, 1, 6);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.slug IS DISTINCT FROM NEW.slug AND OLD.slug IS NOT NULL THEN
    IF NOT (OLD.slug = ANY(NEW.previous_slugs)) THEN
      NEW.previous_slugs := array_append(NEW.previous_slugs, OLD.slug);
    END IF;
  END IF;

  plain := regexp_replace(COALESCE(NEW.content, ''), '<[^>]+>', ' ', 'g');
  word_count := array_length(regexp_split_to_array(btrim(plain), '\s+'), 1);
  NEW.reading_time_minutes := GREATEST(1, COALESCE(word_count, 0) / 200);

  NEW.search_tsv := setweight(to_tsvector('french', COALESCE(NEW.title, '')), 'A')
                 || setweight(to_tsvector('french', COALESCE(NEW.excerpt, '')), 'B')
                 || setweight(to_tsvector('french', plain), 'C');

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_blog_posts_before_write
  BEFORE INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.blog_posts_before_write();

CREATE OR REPLACE FUNCTION public.blog_ref_before_write() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    NEW.slug := public.blog_slugify(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_blog_categories_slug BEFORE INSERT OR UPDATE ON public.blog_categories
  FOR EACH ROW EXECUTE FUNCTION public.blog_ref_before_write();
CREATE TRIGGER trg_blog_tags_slug BEFORE INSERT OR UPDATE ON public.blog_tags
  FOR EACH ROW EXECUTE FUNCTION public.blog_ref_before_write();
CREATE TRIGGER trg_blog_authors_slug BEFORE INSERT OR UPDATE ON public.blog_authors
  FOR EACH ROW EXECUTE FUNCTION public.blog_ref_before_write();

-- Seed categories
INSERT INTO public.blog_categories (slug, name, description, sort_order, color, icon) VALUES
  ('remblai',           'Remblai',           'Tout sur le remblai : dépôt, sortie, réglementation.',                     10, '#7ED321', 'Layers'),
  ('terre',             'Terre',             'Terre de remplissage, terre à jardin, terre noire, terre végétale.',       20, '#8B7355', 'Sprout'),
  ('sable',             'Sable',             'Sable de tous types : construction, pavé, sablière.',                       30, '#D4B074', 'Waves'),
  ('gravier',           'Gravier',           'Gravier, criblure, pierre concassée pour toutes vos surfaces.',             40, '#9CA3AF', 'Diamond'),
  ('pierre',            'Pierre',            'Pierre concassée, pierre nette, pierre décorative.',                        50, '#6B7280', 'Mountain'),
  ('excavation',        'Excavation',        'Excavation, terrassement, préparation de terrain.',                         60, '#F59E0B', 'Hammer'),
  ('transport-en-vrac', 'Transport en vrac', 'Camions, tonnage, voyages, livraison en vrac au Québec.',                   70, '#111111', 'Truck'),
  ('entrepreneurs',     'Entrepreneurs',     'Ressources pour entrepreneurs en construction et excavation.',              80, '#7ED321', 'HardHat'),
  ('proprietaires',     'Propriétaires',     'Guides pour propriétaires : projets résidentiels et paysagement.',          90, '#3B82F6', 'Home'),
  ('guides',            'Guides pratiques',  'Guides étape par étape pour vos projets en vrac.',                         100, '#10B981', 'BookOpen'),
  ('calculs',           'Calculs',           'Calculateurs : tonnage, verges cubes, voyages de camion.',                 110, '#8B5CF6', 'Calculator'),
  ('faq',               'FAQ',               'Questions fréquentes sur le vrac, remblai et transport.',                  120, '#EC4899', 'HelpCircle'),
  ('actualites',        'Actualités',        'Nouvelles du secteur du vrac et de la construction au Québec.',            130, '#EF4444', 'Newspaper'),
  ('reglementation',    'Réglementation',    'Lois, permis et normes environnementales au Québec.',                      140, '#0EA5E9', 'Scale')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_authors (slug, name, title, bio)
VALUES ('vrac-quebec', 'Équipe Vrac Québec', 'Rédaction', 'L''équipe de Vrac Québec, spécialistes du vrac, remblai et transport au Québec.')
ON CONFLICT (slug) DO NOTHING;

-- Full-text search RPC
CREATE OR REPLACE FUNCTION public.blog_search(_query TEXT, _limit INT DEFAULT 20)
RETURNS TABLE (
  id UUID, slug TEXT, title TEXT, excerpt TEXT, cover_image_url TEXT,
  category_id UUID, published_at TIMESTAMPTZ, reading_time_minutes INT, rank REAL
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.slug, p.title, p.excerpt, p.cover_image_url,
         p.category_id, p.published_at, p.reading_time_minutes,
         ts_rank(p.search_tsv, websearch_to_tsquery('french', _query)) AS rank
  FROM public.blog_posts p
  WHERE p.status = 'published'
    AND p.published_at IS NOT NULL AND p.published_at <= now()
    AND p.search_tsv @@ websearch_to_tsquery('french', _query)
  ORDER BY rank DESC, p.published_at DESC
  LIMIT COALESCE(_limit, 20);
$$;
GRANT EXECUTE ON FUNCTION public.blog_search(TEXT, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.blog_increment_view(_post_id UUID) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.blog_posts SET view_count = view_count + 1 WHERE id = _post_id;
$$;
REVOKE ALL ON FUNCTION public.blog_increment_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blog_increment_view(UUID) TO service_role;
