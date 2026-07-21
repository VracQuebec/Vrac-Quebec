
-- 1) seo_waves
CREATE TABLE IF NOT EXISTS public.seo_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  priority int NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seo_waves TO authenticated;
GRANT ALL ON public.seo_waves TO service_role;
ALTER TABLE public.seo_waves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage waves" ON public.seo_waves;
CREATE POLICY "Admins manage waves" ON public.seo_waves
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Auth reads waves" ON public.seo_waves;
CREATE POLICY "Auth reads waves" ON public.seo_waves FOR SELECT
  TO authenticated USING (true);

INSERT INTO public.seo_waves (code, name, description, priority)
VALUES
  ('S1', 'Vague 1 — Grandes villes', 'Priorité maximale : Québec, Lévis, Montréal…', 5),
  ('S2', 'Vague 2 — Villes moyennes', 'Villes 20k–100k habitants', 4),
  ('S3', 'Vague 3 — Longue traîne', 'Petites villes et combinaisons spécifiques', 3)
ON CONFLICT (code) DO NOTHING;

-- 2) seo_pages.wave
ALTER TABLE public.seo_pages ADD COLUMN IF NOT EXISTS wave text;
CREATE INDEX IF NOT EXISTS idx_seo_pages_wave ON public.seo_pages(wave);

-- Backfill wave from city population
UPDATE public.seo_pages sp SET wave = 'S1'
  FROM public.seo_cities c
  WHERE sp.city_slug = c.slug AND sp.wave IS NULL AND c.population >= 100000;
UPDATE public.seo_pages sp SET wave = 'S2'
  FROM public.seo_cities c
  WHERE sp.city_slug = c.slug AND sp.wave IS NULL AND c.population >= 20000;
UPDATE public.seo_pages SET wave = 'S3' WHERE wave IS NULL;

-- 3) seo_generation_jobs enrichment
ALTER TABLE public.seo_generation_jobs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'generate',
  ADD COLUMN IF NOT EXISTS wave text,
  ADD COLUMN IF NOT EXISTS succeeded int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- 4) Unified stats function
CREATE OR REPLACE FUNCTION public.seo_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  cities_total int; materials_total int; services_total int;
  pages_total int; pages_published int; pages_draft int; pages_needs_fix int;
  cities_covered int; materials_covered int; services_covered int;
  combinations_possible int; combinations_created int;
  qa_avg numeric; seo_avg numeric;
  gsc_imp bigint; gsc_clk bigint; gsc_pos numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT COUNT(*) INTO cities_total FROM public.seo_cities WHERE active;
  SELECT COUNT(*) INTO materials_total FROM public.seo_materials WHERE active;
  SELECT COUNT(*) INTO services_total FROM public.seo_services WHERE active;

  SELECT COUNT(*) INTO pages_total FROM public.seo_pages;
  SELECT COUNT(*) INTO pages_published FROM public.seo_pages WHERE status='published';
  SELECT COUNT(*) INTO pages_draft FROM public.seo_pages WHERE status='draft';
  SELECT COUNT(*) INTO pages_needs_fix FROM public.seo_pages
    WHERE status='draft' AND (qa_last_score IS NOT NULL AND qa_last_score < 80)
       OR (array_length(qa_blockers, 1) > 0);

  SELECT COUNT(DISTINCT city_slug) INTO cities_covered FROM public.seo_pages WHERE status='published';
  SELECT COUNT(DISTINCT material_slug) INTO materials_covered FROM public.seo_pages
    WHERE status='published' AND material_slug IS NOT NULL;
  SELECT COUNT(DISTINCT service_slug) INTO services_covered FROM public.seo_pages
    WHERE status='published' AND service_slug IS NOT NULL;

  combinations_possible := cities_total * (materials_total + services_total);
  SELECT COUNT(*) INTO combinations_created FROM public.seo_pages;

  SELECT COALESCE(AVG(qa_last_score), 0) INTO qa_avg FROM public.seo_pages WHERE qa_last_score IS NOT NULL;
  SELECT COALESCE(AVG(seo_score), 0) INTO seo_avg FROM public.seo_pages WHERE seo_score IS NOT NULL;

  SELECT COALESCE(SUM(impressions),0), COALESCE(SUM(clicks),0), COALESCE(AVG(position),0)
    INTO gsc_imp, gsc_clk, gsc_pos
    FROM public.seo_gsc_metrics WHERE period='28d';

  result := jsonb_build_object(
    'computed_at', now(),
    'cities_total', cities_total, 'materials_total', materials_total, 'services_total', services_total,
    'pages_total', pages_total, 'pages_published', pages_published, 'pages_draft', pages_draft, 'pages_needs_fix', pages_needs_fix,
    'cities_covered', cities_covered, 'materials_covered', materials_covered, 'services_covered', services_covered,
    'combinations_possible', combinations_possible, 'combinations_created', combinations_created,
    'qa_avg', ROUND(qa_avg, 1), 'seo_avg', ROUND(seo_avg, 1),
    'gsc_impressions', gsc_imp, 'gsc_clicks', gsc_clk, 'gsc_position', ROUND(gsc_pos, 2),
    'coverage_cities_pct', CASE WHEN cities_total>0 THEN ROUND(100.0*cities_covered/cities_total, 1) ELSE 0 END,
    'coverage_materials_pct', CASE WHEN materials_total>0 THEN ROUND(100.0*materials_covered/materials_total, 1) ELSE 0 END,
    'coverage_services_pct', CASE WHEN services_total>0 THEN ROUND(100.0*services_covered/services_total, 1) ELSE 0 END,
    'coverage_combinations_pct', CASE WHEN combinations_possible>0 THEN ROUND(100.0*combinations_created/combinations_possible, 1) ELSE 0 END,
    'waves', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', w.code, 'name', w.name, 'priority', w.priority,
        'total', COALESCE(pw.total,0),
        'published', COALESCE(pw.published,0),
        'draft', COALESCE(pw.draft,0)
      ) ORDER BY w.priority DESC), '[]'::jsonb)
      FROM public.seo_waves w
      LEFT JOIN (
        SELECT wave, COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='published') AS published,
          COUNT(*) FILTER (WHERE status='draft') AS draft
        FROM public.seo_pages WHERE wave IS NOT NULL GROUP BY wave
      ) pw ON pw.wave = w.code
      WHERE w.active
    )
  );
  RETURN result;
END $$;
