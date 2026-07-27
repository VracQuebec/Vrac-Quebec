ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.seo_optimization_tasks
  ADD COLUMN IF NOT EXISTS error_source text,
  ADD COLUMN IF NOT EXISTS error_http_status integer,
  ADD COLUMN IF NOT EXISTS error_function text,
  ADD COLUMN IF NOT EXISTS error_stack text,
  ADD COLUMN IF NOT EXISTS error_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.seo_opt_task_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _terminal_old boolean;
  _terminal_new boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  _terminal_old := OLD.status IN ('completed','error','skipped','cancelled');
  _terminal_new := NEW.status IN ('completed','error','skipped','cancelled');

  IF _terminal_new AND NOT _terminal_old THEN
    UPDATE public.seo_optimization_runs SET
      done = GREATEST(0, done + 1),
      succeeded = GREATEST(0, succeeded + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END),
      failed = GREATEST(0, failed + CASE WHEN NEW.status = 'error' THEN 1 ELSE 0 END),
      skipped = GREATEST(0, skipped + CASE WHEN NEW.status = 'skipped' THEN 1 ELSE 0 END),
      ai_calls = ai_calls + COALESCE(NEW.ai_calls, 0),
      cost_estimate = cost_estimate + COALESCE(NEW.cost_estimate, 0),
      last_progress_at = now()
    WHERE id = NEW.run_id;
  ELSIF NOT _terminal_new AND _terminal_old THEN
    UPDATE public.seo_optimization_runs SET
      done = GREATEST(0, done - 1),
      succeeded = GREATEST(0, succeeded - CASE WHEN OLD.status = 'completed' THEN 1 ELSE 0 END),
      failed = GREATEST(0, failed - CASE WHEN OLD.status = 'error' THEN 1 ELSE 0 END),
      skipped = GREATEST(0, skipped - CASE WHEN OLD.status = 'skipped' THEN 1 ELSE 0 END),
      ai_calls = GREATEST(0, ai_calls - COALESCE(OLD.ai_calls, 0)),
      cost_estimate = GREATEST(0, cost_estimate - COALESCE(OLD.cost_estimate, 0)),
      last_progress_at = now()
    WHERE id = NEW.run_id;
  ELSIF _terminal_new AND _terminal_old AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.seo_optimization_runs SET
      succeeded = GREATEST(0, succeeded - CASE WHEN OLD.status = 'completed' THEN 1 ELSE 0 END + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END),
      failed = GREATEST(0, failed - CASE WHEN OLD.status = 'error' THEN 1 ELSE 0 END + CASE WHEN NEW.status = 'error' THEN 1 ELSE 0 END),
      skipped = GREATEST(0, skipped - CASE WHEN OLD.status = 'skipped' THEN 1 ELSE 0 END + CASE WHEN NEW.status = 'skipped' THEN 1 ELSE 0 END),
      last_progress_at = now()
    WHERE id = NEW.run_id;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.seo_optimization_runs SET last_progress_at = now() WHERE id = NEW.run_id;
  END IF;

  IF NEW.status = 'error' AND OLD.status <> 'error'
     AND NEW.attempts < NEW.max_attempts THEN
    UPDATE public.seo_optimization_runs SET retried = retried + 1 WHERE id = NEW.run_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_seo_pages_keywords_gin ON public.seo_pages USING gin (keywords);
CREATE INDEX IF NOT EXISTS idx_seo_optimization_tasks_error_source ON public.seo_optimization_tasks (run_id, error_source) WHERE error_source IS NOT NULL;