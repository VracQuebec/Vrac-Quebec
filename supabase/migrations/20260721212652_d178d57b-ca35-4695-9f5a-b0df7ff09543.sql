ALTER TABLE public.seo_generation_jobs
  ADD COLUMN IF NOT EXISTS current_target jsonb,
  ADD COLUMN IF NOT EXISTS current_step text,
  ADD COLUMN IF NOT EXISTS current_attempt int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz,
  ADD COLUMN IF NOT EXISTS watchdog_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_queue jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS blocked_items jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.seo_generation_jobs
SET last_progress_at = COALESCE(last_progress_at, heartbeat_at, started_at, updated_at, created_at)
WHERE last_progress_at IS NULL;