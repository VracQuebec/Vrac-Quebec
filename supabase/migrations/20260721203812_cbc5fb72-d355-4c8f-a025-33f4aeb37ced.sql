
-- Strategic reports
CREATE TABLE public.strategic_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategic_reports TO authenticated;
GRANT ALL ON public.strategic_reports TO service_role;
ALTER TABLE public.strategic_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage strategic reports"
  ON public.strategic_reports FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Business metrics
CREATE TABLE public.seo_business_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_month DATE NOT NULL,
  organic_visitors INTEGER NOT NULL DEFAULT 0,
  ads_equivalent_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  seo_submissions INTEGER NOT NULL DEFAULT 0,
  seo_conversion_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
  estimated_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  attributed_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_submission NUMERIC(12,2) NOT NULL DEFAULT 0,
  roi NUMERIC(8,2) NOT NULL DEFAULT 0,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_business_metrics TO authenticated;
GRANT ALL ON public.seo_business_metrics TO service_role;
ALTER TABLE public.seo_business_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage seo business metrics"
  ON public.seo_business_metrics FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_seo_business_metrics_updated_at
  BEFORE UPDATE ON public.seo_business_metrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Recommendations: daily priority flag
ALTER TABLE public.seo_recommendations
  ADD COLUMN IF NOT EXISTS is_daily_priority BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_seo_recommendations_daily
  ON public.seo_recommendations (is_daily_priority, priority DESC)
  WHERE is_daily_priority = true;
