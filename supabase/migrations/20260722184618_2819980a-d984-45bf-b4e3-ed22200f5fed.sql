
-- 1) QA breakdown column
ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS qa_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Advisor reports table
CREATE TABLE IF NOT EXISTS public.seo_advisor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  period_label text NOT NULL,
  summary text NOT NULL DEFAULT '',
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_gain jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_md text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_advisor_reports TO authenticated;
GRANT ALL ON public.seo_advisor_reports TO service_role;

ALTER TABLE public.seo_advisor_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read advisor reports" ON public.seo_advisor_reports;
CREATE POLICY "Admins can read advisor reports"
  ON public.seo_advisor_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Performance indexes
CREATE INDEX IF NOT EXISTS idx_seo_pages_status_qa
  ON public.seo_pages (status, qa_last_score);

CREATE INDEX IF NOT EXISTS idx_seo_pages_needs_refresh
  ON public.seo_pages (needs_refresh) WHERE needs_refresh = true;

CREATE INDEX IF NOT EXISTS idx_seo_page_events_slug_date
  ON public.seo_page_events (page_slug, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_seo_page_events_type_date
  ON public.seo_page_events (event_type, occurred_at DESC);
