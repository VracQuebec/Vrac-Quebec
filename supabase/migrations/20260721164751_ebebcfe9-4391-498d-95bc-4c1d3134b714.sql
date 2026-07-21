
CREATE TABLE IF NOT EXISTS public.seo_qa_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers TEXT[] NOT NULL DEFAULT '{}',
  warnings TEXT[] NOT NULL DEFAULT '{}',
  auto_published BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_qa_reports_page ON public.seo_qa_reports(page_id, checked_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_qa_reports TO authenticated;
GRANT ALL ON public.seo_qa_reports TO service_role;

ALTER TABLE public.seo_qa_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage QA reports" ON public.seo_qa_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS qa_last_score INT,
  ADD COLUMN IF NOT EXISTS qa_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qa_blockers TEXT[] NOT NULL DEFAULT '{}';
