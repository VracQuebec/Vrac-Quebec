
-- Module 1: Recommendations
CREATE TABLE public.seo_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reco_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  page_id uuid REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  entity_slug text,
  priority int NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  impact_estimate int NOT NULL DEFAULT 50,
  effort_estimate int NOT NULL DEFAULT 50,
  title text NOT NULL,
  rationale text,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','applied','snoozed')),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_seo_reco_status_priority ON public.seo_recommendations(status, priority DESC);
CREATE INDEX ix_seo_reco_type ON public.seo_recommendations(reco_type);
CREATE INDEX ix_seo_reco_page ON public.seo_recommendations(page_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_recommendations TO authenticated;
GRANT ALL ON public.seo_recommendations TO service_role;
ALTER TABLE public.seo_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_seo_reco" ON public.seo_recommendations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_seo_reco_updated BEFORE UPDATE ON public.seo_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Module 2: Competitors
CREATE TABLE public.seo_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  label text,
  active boolean NOT NULL DEFAULT true,
  last_crawled_at timestamptz,
  pages_count int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_competitors TO authenticated;
GRANT ALL ON public.seo_competitors TO service_role;
ALTER TABLE public.seo_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_seo_competitors" ON public.seo_competitors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_seo_competitors_updated BEFORE UPDATE ON public.seo_competitors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.seo_competitor_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES public.seo_competitors(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  h1 text,
  meta_description text,
  city_slug text,
  material_slug text,
  service_slug text,
  keywords text[] NOT NULL DEFAULT '{}',
  word_count int,
  last_crawled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competitor_id, url)
);
CREATE INDEX ix_seo_cp_competitor ON public.seo_competitor_pages(competitor_id);
CREATE INDEX ix_seo_cp_combo ON public.seo_competitor_pages(city_slug, material_slug);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_competitor_pages TO authenticated;
GRANT ALL ON public.seo_competitor_pages TO service_role;
ALTER TABLE public.seo_competitor_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_seo_cp" ON public.seo_competitor_pages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Module 5: Goals
CREATE TABLE public.seo_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('indexed_pages','organic_clicks_month','avg_ctr','keyword_rank','submissions_month','total_pages','avg_seo_score')),
  target_value numeric NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  keyword text,
  deadline date,
  active boolean NOT NULL DEFAULT true,
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_goals TO authenticated;
GRANT ALL ON public.seo_goals TO service_role;
ALTER TABLE public.seo_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_seo_goals" ON public.seo_goals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_seo_goals_updated BEFORE UPDATE ON public.seo_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Pre-seed default goals
INSERT INTO public.seo_goals (label, metric_type, target_value) VALUES
  ('500 pages indexées', 'indexed_pages', 500),
  ('1 000 clics organiques / mois', 'organic_clicks_month', 1000),
  ('CTR moyen 5 %', 'avg_ctr', 0.05),
  ('100 soumissions / mois', 'submissions_month', 100),
  ('Score SEO moyen 80', 'avg_seo_score', 80);

-- Module 4: PageSpeed snapshots
CREATE TABLE public.seo_pagespeed_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  page_id uuid REFERENCES public.seo_pages(id) ON DELETE SET NULL,
  strategy text NOT NULL DEFAULT 'mobile' CHECK (strategy IN ('mobile','desktop')),
  performance_score int,
  lcp_ms int,
  cls numeric,
  inp_ms int,
  fcp_ms int,
  ttfb_ms int,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_seo_ps_url_fetched ON public.seo_pagespeed_snapshots(url, fetched_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_pagespeed_snapshots TO authenticated;
GRANT ALL ON public.seo_pagespeed_snapshots TO service_role;
ALTER TABLE public.seo_pagespeed_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_seo_ps" ON public.seo_pagespeed_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Module 4: Broken links
CREATE TABLE public.seo_broken_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  http_status int,
  source_page text,
  error_message text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  UNIQUE(url, source_page)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_broken_links TO authenticated;
GRANT ALL ON public.seo_broken_links TO service_role;
ALTER TABLE public.seo_broken_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_seo_bl" ON public.seo_broken_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Module 6: Priority score function
CREATE OR REPLACE FUNCTION public.seo_priority_score(_page_id uuid)
RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  pop int := 0;
  active_dumps int := 0;
  gsc_impr int := 0;
  gsc_pos numeric := 100;
  competitor_hits int := 0;
  score numeric := 0;
  city_slug_v text;
  material_slug_v text;
BEGIN
  SELECT sp.city_slug, sp.material_slug INTO city_slug_v, material_slug_v
  FROM public.seo_pages sp WHERE sp.id = _page_id;
  IF city_slug_v IS NULL THEN RETURN 3; END IF;

  SELECT COALESCE(sc.population, 0) INTO pop FROM public.seo_cities sc WHERE sc.slug = city_slug_v;
  SELECT public.count_active_dumps_by_city(city_slug_v) INTO active_dumps;
  SELECT COALESCE(g.impressions, 0), COALESCE(g.position, 100)
    INTO gsc_impr, gsc_pos
    FROM public.seo_gsc_metrics g WHERE g.page_id = _page_id AND g.period = '28d' LIMIT 1;
  SELECT COUNT(*) INTO competitor_hits
    FROM public.seo_competitor_pages cp
    WHERE cp.city_slug = city_slug_v AND (material_slug_v IS NULL OR cp.material_slug = material_slug_v);

  score := LEAST(50, pop::numeric / 2000)                       -- population weight
         + LEAST(20, active_dumps * 4)                          -- active local demand
         + LEAST(15, gsc_impr::numeric / 100)                   -- traffic potential
         + CASE WHEN gsc_pos BETWEEN 8 AND 20 THEN 15 ELSE 0 END -- quick win
         + LEAST(10, competitor_hits * 2);                      -- competitive pressure

  RETURN CASE
    WHEN score >= 80 THEN 5
    WHEN score >= 55 THEN 4
    WHEN score >= 30 THEN 3
    WHEN score >= 15 THEN 2
    ELSE 1
  END;
END;
$$;
