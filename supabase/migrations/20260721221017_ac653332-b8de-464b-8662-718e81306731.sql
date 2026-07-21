
-- 1. Progress metrics columns
ALTER TABLE public.seo_generation_jobs
  ADD COLUMN IF NOT EXISTS progress_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pages_per_minute numeric,
  ADD COLUMN IF NOT EXISTS eta_seconds integer;

-- 2. Unique partial index: one running job per (mode, wave)
CREATE UNIQUE INDEX IF NOT EXISTS seo_jobs_one_running
  ON public.seo_generation_jobs (mode, (COALESCE(wave, '')))
  WHERE status = 'running';

-- 3. Deduplicated recent-jobs view (latest terminal job per mode/wave)
CREATE OR REPLACE VIEW public.seo_recent_jobs_v AS
SELECT DISTINCT ON (mode, COALESCE(wave, ''))
  id, status, mode, wave, total, done, succeeded, failed,
  report, errors, current_target, current_step, current_attempt,
  current_started_at, last_progress_at, watchdog_events,
  retry_queue, blocked_items, progress_samples, pages_per_minute,
  eta_seconds, started_at, finished_at, created_at
FROM public.seo_generation_jobs
ORDER BY mode, COALESCE(wave, ''),
  CASE WHEN status = 'running' THEN 0 ELSE 1 END,
  COALESCE(started_at, created_at) DESC;

GRANT SELECT ON public.seo_recent_jobs_v TO authenticated, service_role;

-- 4. History dedupe trigger: when a job reaches a terminal state,
-- delete older terminal jobs with same (mode, wave).
CREATE OR REPLACE FUNCTION public.seo_jobs_dedupe_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed','completed_with_warnings','failed','failed_with_retries','superseded')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    DELETE FROM public.seo_generation_jobs
    WHERE id <> NEW.id
      AND mode = NEW.mode
      AND COALESCE(wave, '') = COALESCE(NEW.wave, '')
      AND status IN ('completed','completed_with_warnings','failed','failed_with_retries','superseded')
      AND COALESCE(started_at, created_at) < COALESCE(NEW.started_at, NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_jobs_dedupe_history ON public.seo_generation_jobs;
CREATE TRIGGER trg_seo_jobs_dedupe_history
  AFTER UPDATE OF status ON public.seo_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.seo_jobs_dedupe_history();

-- 5. Unified pipeline state RPC
CREATE OR REPLACE FUNCTION public.seo_pipeline_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stats jsonb;
  active jsonb;
  history jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  stats := public.seo_dashboard_stats();

  SELECT to_jsonb(j.*) INTO active
  FROM public.seo_generation_jobs j
  WHERE j.status = 'running'
  ORDER BY j.started_at DESC NULLS LAST
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(v) ORDER BY COALESCE(v.started_at, v.created_at) DESC), '[]'::jsonb)
    INTO history
  FROM (
    SELECT * FROM public.seo_recent_jobs_v
    WHERE status <> 'running'
    ORDER BY COALESCE(started_at, created_at) DESC
    LIMIT 10
  ) v;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'stats', stats,
    'active_job', active,
    'recent_jobs', history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seo_pipeline_state() TO authenticated;

-- 6. Auto-repair: purge stale running jobs (>3min without progress)
CREATE OR REPLACE FUNCTION public.seo_pipeline_purge_stale()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  WITH purged AS (
    UPDATE public.seo_generation_jobs
       SET status = 'failed_with_retries',
           finished_at = now(),
           current_step = 'terminé',
           current_target = NULL,
           current_started_at = NULL,
           report = jsonb_set(COALESCE(report, '{}'::jsonb), '{final_status}', '"failed_with_retries"'::jsonb, true)
                     || jsonb_build_object('auto_purge_reason', 'stalled_over_3_minutes')
     WHERE status = 'running'
       AND COALESCE(last_progress_at, started_at, created_at) < now() - interval '3 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO cnt FROM purged;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seo_pipeline_purge_stale() TO authenticated;

-- 7. Enable realtime on jobs + pages (idempotent — ignore if already added)
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.seo_generation_jobs';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.seo_pages';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.seo_generation_jobs REPLICA IDENTITY FULL;
