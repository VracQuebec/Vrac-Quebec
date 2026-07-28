-- ============================================================
-- Google Business Profile integration — Phase 1
-- ============================================================

-- 1. Configuration table (single row)
CREATE TABLE public.gbp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_token text NOT NULL,
  account_name text,
  account_display_name text,
  location_name text,
  location_display_name text,
  location_address text,
  google_email text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_config TO authenticated;
GRANT ALL ON public.gbp_config TO service_role;
ALTER TABLE public.gbp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage gbp_config"
  ON public.gbp_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Enforce single-row semantics
CREATE UNIQUE INDEX gbp_config_singleton ON public.gbp_config ((true));

-- 2. OAuth state (anti-CSRF, short-lived)
CREATE TABLE public.gbp_oauth_state (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

GRANT SELECT, INSERT, DELETE ON public.gbp_oauth_state TO authenticated;
GRANT ALL ON public.gbp_oauth_state TO service_role;
ALTER TABLE public.gbp_oauth_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage gbp_oauth_state"
  ON public.gbp_oauth_state FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Daily metrics from Performance API
CREATE TABLE public.gbp_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  metric_name text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_date, metric_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_daily_metrics TO authenticated;
GRANT ALL ON public.gbp_daily_metrics TO service_role;
ALTER TABLE public.gbp_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read gbp_daily_metrics"
  ON public.gbp_daily_metrics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write gbp_daily_metrics"
  ON public.gbp_daily_metrics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX gbp_daily_metrics_date_idx ON public.gbp_daily_metrics (metric_date DESC);

-- 4. Location snapshot
CREATE TABLE public.gbp_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name text NOT NULL UNIQUE,
  display_name text,
  primary_category text,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  address_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  locality text,
  region text,
  postal_code text,
  phone text,
  website_uri text,
  maps_uri text,
  average_rating numeric(3,2),
  total_reviews integer NOT NULL DEFAULT 0,
  total_photos integer NOT NULL DEFAULT 0,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_location TO authenticated;
GRANT ALL ON public.gbp_location TO service_role;
ALTER TABLE public.gbp_location ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage gbp_location"
  ON public.gbp_location FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Local posts (publications)
CREATE TABLE public.gbp_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_name text UNIQUE,
  topic_type text NOT NULL DEFAULT 'STANDARD',
  summary text NOT NULL,
  cta_type text,
  cta_url text,
  media_url text,
  event_title text,
  event_start_at timestamptz,
  event_end_at timestamptz,
  offer_coupon_code text,
  offer_terms text,
  status text NOT NULL DEFAULT 'draft',
  error_message text,
  google_search_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gbp_posts_status_check CHECK (status IN ('draft','scheduled','published','failed','deleted'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_posts TO authenticated;
GRANT ALL ON public.gbp_posts TO service_role;
ALTER TABLE public.gbp_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage gbp_posts"
  ON public.gbp_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX gbp_posts_status_idx ON public.gbp_posts (status, created_at DESC);

-- 6. Questions & answers
CREATE TABLE public.gbp_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_name text NOT NULL UNIQUE,
  question_text text NOT NULL,
  author_display_name text,
  author_type text,
  upvote_count integer NOT NULL DEFAULT 0,
  total_answer_count integer NOT NULL DEFAULT 0,
  owner_answer text,
  owner_answered_at timestamptz,
  owner_answered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unanswered',
  created_at_google timestamptz,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gbp_questions_status_check CHECK (status IN ('unanswered','answered','archived'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_questions TO authenticated;
GRANT ALL ON public.gbp_questions TO service_role;
ALTER TABLE public.gbp_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage gbp_questions"
  ON public.gbp_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX gbp_questions_status_idx ON public.gbp_questions (status, fetched_at DESC);

-- 7. updated_at triggers
CREATE TRIGGER trg_gbp_config_updated_at BEFORE UPDATE ON public.gbp_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_gbp_location_updated_at BEFORE UPDATE ON public.gbp_location
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_gbp_posts_updated_at BEFORE UPDATE ON public.gbp_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_gbp_questions_updated_at BEFORE UPDATE ON public.gbp_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. Daily sync cron 05:45 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gbp-sync-daily') THEN
    PERFORM cron.unschedule('gbp-sync-daily');
  END IF;
  PERFORM cron.schedule(
    'gbp-sync-daily',
    '45 5 * * *',
    $CRON$
    SELECT net.http_post(
      url:='https://kenduhxscnynugpvktin.supabase.co/functions/v1/gbp-sync-daily',
      headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlbmR1aHhzY255bnVncHZrdGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjI4MDQsImV4cCI6MjA4ODQzODgwNH0.9k7w4PB-pHA_CZYrTJ-wzJgnpxV4mlAZETD_Zi-LRR8"}'::jsonb,
      body:='{"trigger":"cron"}'::jsonb
    );
    $CRON$
  );
END $$;
