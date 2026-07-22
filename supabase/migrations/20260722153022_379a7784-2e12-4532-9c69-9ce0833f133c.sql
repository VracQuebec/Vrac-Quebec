
-- Blog ↔ SEO mesh tables
CREATE TABLE IF NOT EXISTS public.blog_seo_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  seo_page_id uuid NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  relevance_score int NOT NULL DEFAULT 0,
  match_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  link_direction text NOT NULL DEFAULT 'both',
  auto_generated boolean NOT NULL DEFAULT true,
  confirmed_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blog_post_id, seo_page_id)
);

GRANT SELECT ON public.blog_seo_links TO anon, authenticated;
GRANT ALL ON public.blog_seo_links TO service_role;

ALTER TABLE public.blog_seo_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read blog_seo_links"
  ON public.blog_seo_links FOR SELECT
  USING (true);

CREATE POLICY "Admins manage blog_seo_links"
  ON public.blog_seo_links FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS blog_seo_links_post_idx ON public.blog_seo_links(blog_post_id);
CREATE INDEX IF NOT EXISTS blog_seo_links_seo_idx ON public.blog_seo_links(seo_page_id);

CREATE TRIGGER blog_seo_links_touch
  BEFORE UPDATE ON public.blog_seo_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Mesh runs (report history)
CREATE TABLE IF NOT EXISTS public.blog_mesh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  mode text NOT NULL DEFAULT 'all',
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  orphan_post_ids uuid[] NOT NULL DEFAULT '{}',
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blog_mesh_runs TO authenticated;
GRANT ALL ON public.blog_mesh_runs TO service_role;

ALTER TABLE public.blog_mesh_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read blog_mesh_runs"
  ON public.blog_mesh_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Extend blog_posts with mesh tracking
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS mesh_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mesh_score int NOT NULL DEFAULT 0;

-- Stats RPC
CREATE OR REPLACE FUNCTION public.blog_mesh_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int; linked int; orphan int; links_total int; avg_score numeric;
  seo_total int; seo_covered int; opportunities int;
  last_run jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT COUNT(*) INTO total FROM public.blog_posts WHERE status = 'published';
  SELECT COUNT(DISTINCT bp.id) INTO linked
    FROM public.blog_posts bp
    JOIN public.blog_seo_links l ON l.blog_post_id = bp.id
    WHERE bp.status = 'published';
  orphan := GREATEST(total - linked, 0);
  SELECT COUNT(*) INTO links_total FROM public.blog_seo_links;
  SELECT COALESCE(AVG(mesh_score), 0) INTO avg_score FROM public.blog_posts WHERE status = 'published';

  SELECT COUNT(*) INTO seo_total FROM public.seo_pages WHERE status = 'published';
  SELECT COUNT(DISTINCT sp.id) INTO seo_covered
    FROM public.seo_pages sp
    JOIN public.blog_seo_links l ON l.seo_page_id = sp.id
    WHERE sp.status = 'published';
  opportunities := GREATEST(seo_total - seo_covered, 0) + orphan;

  SELECT to_jsonb(r) INTO last_run
    FROM (SELECT * FROM public.blog_mesh_runs ORDER BY started_at DESC LIMIT 1) r;

  RETURN jsonb_build_object(
    'total_posts', total,
    'linked_posts', linked,
    'orphan_posts', orphan,
    'total_links', links_total,
    'avg_mesh_score', ROUND(avg_score, 1),
    'seo_pages_total', seo_total,
    'seo_pages_covered', seo_covered,
    'seo_pages_uncovered', GREATEST(seo_total - seo_covered, 0),
    'opportunities', opportunities,
    'last_run', last_run
  );
END;
$$;

-- Reset mesh_analyzed_at when post or seo page changes
CREATE OR REPLACE FUNCTION public.mark_post_needs_mesh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.mesh_analyzed_at := NULL;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS blog_posts_mesh_reset ON public.blog_posts;
CREATE TRIGGER blog_posts_mesh_reset
  BEFORE UPDATE OF title, excerpt, content, category_id
  ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.mark_post_needs_mesh();
