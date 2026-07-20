
-- 1. Add priority + google index columns on seo_pages
ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS priority_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_index_status text,
  ADD COLUMN IF NOT EXISTS google_last_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS seo_pages_priority_idx ON public.seo_pages(priority DESC);

-- 2. Search Console metrics table (one row per page × period)
CREATE TABLE IF NOT EXISTS public.seo_gsc_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('7d','28d','90d')),
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric(6,4) NOT NULL DEFAULT 0,
  position numeric(6,2) NOT NULL DEFAULT 0,
  top_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  index_status text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_gsc_metrics TO authenticated;
GRANT ALL ON public.seo_gsc_metrics TO service_role;

ALTER TABLE public.seo_gsc_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage GSC metrics"
  ON public.seo_gsc_metrics
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. AI improvement history table (before/after snapshots)
CREATE TABLE IF NOT EXISTS public.seo_page_improvements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  model text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_page_improvements_page_idx ON public.seo_page_improvements(page_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_page_improvements TO authenticated;
GRANT ALL ON public.seo_page_improvements TO service_role;

ALTER TABLE public.seo_page_improvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SEO improvements"
  ON public.seo_page_improvements
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Backfill priority using population + dompes (best-effort)
UPDATE public.seo_pages p
SET priority = GREATEST(1, LEAST(5,
  1
  + CASE WHEN c.population >= 400000 THEN 3
         WHEN c.population >= 100000 THEN 2
         WHEN c.population >= 25000 THEN 1
         ELSE 0 END
  + CASE WHEN COALESCE(public.count_active_dumps_by_city(p.city_slug), 0) > 0 THEN 1 ELSE 0 END
))
FROM public.seo_cities c
WHERE p.city_slug = c.slug AND p.priority_locked = false;
