
-- Enrichir seo_pages
ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS internal_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS word_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS h2_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS h3_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS internal_link_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_link_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seo_score integer,
  ADD COLUMN IF NOT EXISTS needs_refresh boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refresh_reason text,
  ADD COLUMN IF NOT EXISTS cover_image_alt text,
  ADD COLUMN IF NOT EXISTS last_analyzed_at timestamptz;

CREATE INDEX IF NOT EXISTS seo_pages_needs_refresh_idx ON public.seo_pages(needs_refresh) WHERE needs_refresh = true;
CREATE INDEX IF NOT EXISTS seo_pages_score_idx ON public.seo_pages(seo_score DESC NULLS LAST);

-- Table d'analyse SEO
CREATE TABLE IF NOT EXISTS public.seo_page_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  word_count integer NOT NULL DEFAULT 0,
  internal_links integer NOT NULL DEFAULT 0,
  external_links integer NOT NULL DEFAULT 0,
  h1_count integer NOT NULL DEFAULT 0,
  h2_count integer NOT NULL DEFAULT 0,
  h3_count integer NOT NULL DEFAULT 0,
  meta_title_length integer NOT NULL DEFAULT 0,
  meta_description_length integer NOT NULL DEFAULT 0,
  keyword_density numeric(5,2) NOT NULL DEFAULT 0,
  core_web_vitals_score integer,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_page_analytics TO authenticated;
GRANT ALL ON public.seo_page_analytics TO service_role;
ALTER TABLE public.seo_page_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage seo analytics" ON public.seo_page_analytics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS seo_page_analytics_page_idx ON public.seo_page_analytics(page_id, analyzed_at DESC);

-- Trigger : marquer les pages SEO d'une ville pour rafraîchissement quand une dompe est créée/modifiée
CREATE OR REPLACE FUNCTION public.mark_seo_pages_needs_refresh_from_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  city_prefix text;
  normalized_type text;
BEGIN
  normalized_type := lower(trim(coalesce(NEW.request_type, '')));
  -- Ne réagir que pour les dompes (remblai/dépôt)
  IF normalized_type NOT IN ('remblai', 'depot', 'dépôt', 'remblai / dépôt', 'remblai / depot') THEN
    RETURN NEW;
  END IF;

  city_prefix := lower(coalesce(NEW.city, ''));
  IF city_prefix = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.seo_pages
     SET needs_refresh = true,
         refresh_reason = 'dompe_update'
   WHERE lower(city_slug) IN (
           lower(regexp_replace(unaccent_string(city_prefix), '[^a-z0-9]+', '-', 'g'))
         );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submissions_refresh_seo ON public.submissions;
CREATE TRIGGER submissions_refresh_seo
AFTER INSERT OR UPDATE OF request_type, city, status ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.mark_seo_pages_needs_refresh_from_submission();

-- Fonction agrégée : nombre de dompes actives par ville (public, aucune adresse exposée)
CREATE OR REPLACE FUNCTION public.count_active_dumps_by_city(_city_slug text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.submissions s
  WHERE lower(regexp_replace(unaccent_string(coalesce(s.city, '')), '[^a-z0-9]+', '-', 'g')) = lower(_city_slug)
    AND lower(trim(coalesce(s.request_type, ''))) IN ('remblai','depot','dépôt','remblai / dépôt','remblai / depot')
    AND lower(trim(coalesce(s.status, ''))) IN ('en attente de livraison','nouveau','confirmée','confirmee');
$$;

GRANT EXECUTE ON FUNCTION public.count_active_dumps_by_city(text) TO anon, authenticated;
