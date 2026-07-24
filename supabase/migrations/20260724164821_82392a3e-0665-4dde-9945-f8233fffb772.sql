
CREATE TABLE IF NOT EXISTS public.ga4_page_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('7d','28d','90d')),
  users INT NOT NULL DEFAULT 0,
  sessions INT NOT NULL DEFAULT 0,
  new_users INT NOT NULL DEFAULT 0,
  page_views INT NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
  avg_engagement_time_sec NUMERIC(10,2) NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  events_count INT NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_path, period)
);
GRANT SELECT ON public.ga4_page_metrics TO authenticated;
GRANT ALL ON public.ga4_page_metrics TO service_role;
ALTER TABLE public.ga4_page_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ga4_page_metrics" ON public.ga4_page_metrics
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS ga4_page_metrics_period_idx ON public.ga4_page_metrics(period);
CREATE INDEX IF NOT EXISTS ga4_page_metrics_users_idx ON public.ga4_page_metrics(period, users DESC);

CREATE TABLE IF NOT EXISTS public.ga4_daily_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  users INT NOT NULL DEFAULT 0,
  sessions INT NOT NULL DEFAULT 0,
  new_users INT NOT NULL DEFAULT 0,
  page_views INT NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
  avg_engagement_time_sec NUMERIC(10,2) NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  events_count INT NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ga4_daily_summary TO authenticated;
GRANT ALL ON public.ga4_daily_summary TO service_role;
ALTER TABLE public.ga4_daily_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ga4_daily_summary" ON public.ga4_daily_summary
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.ga4_traffic_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL CHECK (period IN ('7d','28d','90d')),
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  channel TEXT,
  sessions INT NOT NULL DEFAULT 0,
  users INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period, source, medium)
);
GRANT SELECT ON public.ga4_traffic_sources TO authenticated;
GRANT ALL ON public.ga4_traffic_sources TO service_role;
ALTER TABLE public.ga4_traffic_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ga4_traffic_sources" ON public.ga4_traffic_sources
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Unified GSC + GA4 view per page
CREATE OR REPLACE VIEW public.seo_gsc_ga4_merged_v
WITH (security_invoker = true) AS
SELECT
  p.id AS page_id,
  p.slug,
  p.title,
  p.status,
  COALESCE(g.clicks, 0) AS gsc_clicks,
  COALESCE(g.impressions, 0) AS gsc_impressions,
  COALESCE(g.ctr, 0) AS gsc_ctr,
  COALESCE(g.position, 0) AS gsc_position,
  COALESCE(a.users, 0) AS ga_users,
  COALESCE(a.sessions, 0) AS ga_sessions,
  COALESCE(a.new_users, 0) AS ga_new_users,
  COALESCE(a.page_views, 0) AS ga_page_views,
  COALESCE(a.engagement_rate, 0) AS ga_engagement_rate,
  COALESCE(a.avg_engagement_time_sec, 0) AS ga_avg_engagement_time_sec,
  COALESCE(a.conversions, 0) AS ga_conversions
FROM public.seo_pages p
LEFT JOIN public.seo_gsc_metrics g ON g.page_id = p.id AND g.period = '28d'
LEFT JOIN public.ga4_page_metrics a ON a.page_path = ('/' || p.slug) AND a.period = '28d';
GRANT SELECT ON public.seo_gsc_ga4_merged_v TO authenticated;
