
-- 1) New columns on runs
ALTER TABLE public.seo_optimization_runs
  ADD COLUMN IF NOT EXISTS rate_limit_hits int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_adjusted_concurrency boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_id uuid;

-- 2) Reports table
CREATE TABLE IF NOT EXISTS public.seo_optimization_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.seo_optimization_runs(id) ON DELETE CASCADE,
  pages_optimized int NOT NULL DEFAULT 0,
  pages_skipped int NOT NULL DEFAULT 0,
  pages_failed int NOT NULL DEFAULT 0,
  errors_fixed int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 0,
  ai_calls int NOT NULL DEFAULT 0,
  cost_estimate numeric(12,4) NOT NULL DEFAULT 0,
  avg_qa_before numeric,
  avg_qa_after numeric,
  avg_qa_delta numeric,
  top_fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_status text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_optimization_reports TO authenticated;
GRANT ALL ON public.seo_optimization_reports TO service_role;

ALTER TABLE public.seo_optimization_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read optimization reports"
  ON public.seo_optimization_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Admin notifications
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','error')),
  link text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can mark admin notifications read"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications(created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- 4) Finalize RPC (idempotent)
CREATE OR REPLACE FUNCTION public.seo_optimization_finalize(_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.seo_optimization_runs%ROWTYPE;
  _report_id uuid;
  _avg_before numeric;
  _avg_after numeric;
  _errors_fixed int;
  _duration int;
  _top_fixes jsonb;
BEGIN
  SELECT * INTO _run FROM public.seo_optimization_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF _run.report_id IS NOT NULL THEN RETURN _run.report_id; END IF;

  SELECT AVG(qa_before) FILTER (WHERE qa_before IS NOT NULL),
         AVG(qa_after)  FILTER (WHERE qa_after  IS NOT NULL)
    INTO _avg_before, _avg_after
    FROM public.seo_optimization_tasks WHERE run_id = _run_id;

  SELECT COUNT(*)::int INTO _errors_fixed
    FROM public.seo_optimization_tasks
   WHERE run_id = _run_id AND status = 'completed' AND attempts > 1;

  _duration := GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(_run.finished_at, now()) - COALESCE(_run.started_at, _run.created_at)))::int);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('action', action, 'count', n) ORDER BY n DESC), '[]'::jsonb)
    INTO _top_fixes
    FROM (
      SELECT unnest(fixed_actions) AS action, COUNT(*)::int AS n
        FROM public.seo_optimization_tasks
       WHERE run_id = _run_id AND status = 'completed'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) s;

  INSERT INTO public.seo_optimization_reports
    (run_id, pages_optimized, pages_skipped, pages_failed, errors_fixed,
     duration_seconds, ai_calls, cost_estimate,
     avg_qa_before, avg_qa_after, avg_qa_delta, top_fixes, final_status)
  VALUES
    (_run_id, _run.succeeded, _run.skipped, _run.failed, _errors_fixed,
     _duration, _run.ai_calls, _run.cost_estimate,
     _avg_before, _avg_after,
     CASE WHEN _avg_before IS NOT NULL AND _avg_after IS NOT NULL THEN _avg_after - _avg_before ELSE NULL END,
     _top_fixes, _run.status)
  RETURNING id INTO _report_id;

  UPDATE public.seo_optimization_runs
     SET report_id = _report_id,
         qa_before_avg = _avg_before,
         qa_after_avg = _avg_after
   WHERE id = _run_id;

  INSERT INTO public.admin_notifications (title, body, level, link, meta)
  VALUES (
    'Optimisation SEO terminée',
    format('%s pages optimisées, %s ignorées, %s en erreur (durée %ss, coût $%s).',
      _run.succeeded, _run.skipped, _run.failed, _duration, to_char(_run.cost_estimate, 'FM999999.00')),
    CASE WHEN _run.failed > 0 AND _run.succeeded = 0 THEN 'error'
         WHEN _run.failed > 0 THEN 'warning'
         ELSE 'success' END,
    '/admin/seo-manager?tab=optimizer',
    jsonb_build_object('run_id', _run_id, 'report_id', _report_id)
  );

  RETURN _report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.seo_optimization_finalize(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.seo_optimization_finalize(uuid) TO authenticated, service_role;

-- 5) Autotune RPC
CREATE OR REPLACE FUNCTION public.seo_optimization_autotune(_run_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hits int;
  _new_conc int;
  _current_conc int;
BEGIN
  SELECT concurrency INTO _current_conc FROM public.seo_optimization_runs WHERE id = _run_id;
  IF _current_conc IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*)::int INTO _hits
    FROM public.seo_optimization_tasks
   WHERE run_id = _run_id
     AND last_error_at > now() - interval '5 minutes'
     AND error ILIKE '%rate limit%';

  IF _hits >= 10 THEN
    _new_conc := GREATEST(1, LEAST(_current_conc - 1, 2));
  ELSIF _hits = 0 THEN
    _new_conc := LEAST(5, _current_conc + 1);
  ELSE
    _new_conc := _current_conc;
  END IF;

  IF _new_conc <> _current_conc THEN
    UPDATE public.seo_optimization_runs
       SET concurrency = _new_conc,
           auto_adjusted_concurrency = true
     WHERE id = _run_id;
  END IF;
  RETURN _new_conc;
END;
$$;

REVOKE ALL ON FUNCTION public.seo_optimization_autotune(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.seo_optimization_autotune(uuid) TO authenticated, service_role;

-- 6) Enhanced watchdog: requeue stuck, auto-resume paused, finalize done runs
CREATE OR REPLACE FUNCTION public.seo_optimization_watchdog()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n int := 0;
  _r record;
BEGIN
  -- Requeue in-flight tasks stuck > 5 minutes
  WITH upd AS (
    UPDATE public.seo_optimization_tasks
       SET status = CASE WHEN attempts >= max_attempts THEN 'error' ELSE 'pending' END,
           error = COALESCE(error, '') || CASE WHEN attempts >= max_attempts THEN ' | watchdog: timeout' ELSE '' END,
           next_attempt_at = now() + interval '5 seconds',
           finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
     WHERE status IN ('claimed','analyzing','optimizing','qa','publishing')
       AND started_at < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO _n FROM upd;

  -- Auto-resume paused runs orphaned > 10 minutes
  UPDATE public.seo_optimization_runs
     SET status = 'running', last_progress_at = now()
   WHERE status = 'paused' AND updated_at < now() - interval '10 minutes';

  -- Finalize runs that terminated but have no report yet
  FOR _r IN
    SELECT id FROM public.seo_optimization_runs
     WHERE status IN ('completed','failed','cancelled')
       AND report_id IS NULL
       AND finished_at IS NOT NULL
  LOOP
    PERFORM public.seo_optimization_finalize(_r.id);
  END LOOP;

  -- Autotune the active running run
  FOR _r IN SELECT id FROM public.seo_optimization_runs WHERE status = 'running' LOOP
    PERFORM public.seo_optimization_autotune(_r.id);
  END LOOP;

  RETURN _n;
END;
$$;
