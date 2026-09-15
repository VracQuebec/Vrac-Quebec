ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz;

CREATE OR REPLACE FUNCTION public.submissions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_touch_updated_at ON public.submissions;
CREATE TRIGGER trg_submissions_touch_updated_at
BEFORE UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.submissions_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_updated_at ON public.submissions (updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_submissions_desired_date ON public.submissions (desired_date NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_submissions_next_follow_up_at ON public.submissions (next_follow_up_at NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_submissions_quote_trips ON public.submissions (quote_trips NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_submissions_quantity_value ON public.submissions (quantity_value NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_submissions_quote_distance_km ON public.submissions (quote_distance_km NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_submissions_name ON public.submissions (lower(name));
CREATE INDEX IF NOT EXISTS idx_submissions_priority ON public.submissions (priority);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions (status);