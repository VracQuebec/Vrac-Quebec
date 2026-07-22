
-- ============================================================
-- 1) Tables
-- ============================================================
CREATE TABLE public.seo_optimization_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','paused','completed','failed','cancelled')),
  concurrency int NOT NULL DEFAULT 5 CHECK (concurrency BETWEEN 1 AND 20),
  qa_threshold int NOT NULL DEFAULT 90,
  qa_skip_above int NOT NULL DEFAULT 95,
  force_all boolean NOT NULL DEFAULT false,
  actions text[] NOT NULL DEFAULT '{}',
  filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  total int NOT NULL DEFAULT 0,
  done int NOT NULL DEFAULT 0,
  succeeded int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  retried int NOT NULL DEFAULT 0,
  ai_calls int NOT NULL DEFAULT 0,
  cost_estimate numeric(12,4) NOT NULL DEFAULT 0,
  qa_before_avg numeric,
  qa_after_avg numeric,
  started_at timestamptz,
  finished_at timestamptz,
  last_progress_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_optimization_runs TO authenticated;
GRANT ALL ON public.seo_optimization_runs TO service_role;

ALTER TABLE public.seo_optimization_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read optimization runs"
  ON public.seo_optimization_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_seo_opt_runs_status ON public.seo_optimization_runs(status);
CREATE INDEX idx_seo_opt_runs_progress ON public.seo_optimization_runs(last_progress_at)
  WHERE status = 'running';

CREATE TRIGGER trg_seo_opt_runs_updated
  BEFORE UPDATE ON public.seo_optimization_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.seo_optimization_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.seo_optimization_runs(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','claimed','analyzing','optimizing','qa','publishing','completed','error','skipped','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  qa_before int,
  qa_after int,
  ai_calls int NOT NULL DEFAULT 0,
  cost_estimate numeric(10,4) NOT NULL DEFAULT 0,
  duration_ms int,
  fixed_actions text[] NOT NULL DEFAULT '{}',
  skip_reason text,
  error text,
  last_error_at timestamptz,
  next_attempt_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, page_id)
);

GRANT SELECT ON public.seo_optimization_tasks TO authenticated;
GRANT ALL ON public.seo_optimization_tasks TO service_role;

ALTER TABLE public.seo_optimization_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read optimization tasks"
  ON public.seo_optimization_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_seo_opt_tasks_run_status ON public.seo_optimization_tasks(run_id, status);
CREATE INDEX idx_seo_opt_tasks_pickup ON public.seo_optimization_tasks(run_id, status, next_attempt_at)
  WHERE status IN ('pending','error');
CREATE INDEX idx_seo_opt_tasks_finished ON public.seo_optimization_tasks(finished_at DESC NULLS LAST);

CREATE TRIGGER trg_seo_opt_tasks_updated
  BEFORE UPDATE ON public.seo_optimization_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 2) Counter sync trigger on task state changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.seo_opt_task_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _terminal_old boolean;
  _terminal_new boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  _terminal_old := OLD.status IN ('completed','error','skipped','cancelled');
  _terminal_new := NEW.status IN ('completed','error','skipped','cancelled');

  IF _terminal_new AND NOT _terminal_old THEN
    UPDATE public.seo_optimization_runs SET
      done = done + 1,
      succeeded = succeeded + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
      failed = failed + CASE WHEN NEW.status = 'error' THEN 1 ELSE 0 END,
      skipped = skipped + CASE WHEN NEW.status = 'skipped' THEN 1 ELSE 0 END,
      ai_calls = ai_calls + COALESCE(NEW.ai_calls, 0),
      cost_estimate = cost_estimate + COALESCE(NEW.cost_estimate, 0),
      last_progress_at = now()
    WHERE id = NEW.run_id;
  ELSIF NOT _terminal_new AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.seo_optimization_runs SET last_progress_at = now() WHERE id = NEW.run_id;
  END IF;

  IF NEW.status = 'error' AND OLD.status <> 'error'
     AND NEW.attempts < NEW.max_attempts THEN
    UPDATE public.seo_optimization_runs SET retried = retried + 1 WHERE id = NEW.run_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seo_opt_task_sync
  AFTER UPDATE ON public.seo_optimization_tasks
  FOR EACH ROW EXECUTE FUNCTION public.seo_opt_task_sync();

-- ============================================================
-- 3) Auto-completion trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.seo_opt_run_check_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'running' AND NEW.total > 0 AND NEW.done >= NEW.total THEN
    NEW.status := CASE WHEN NEW.failed > 0 AND NEW.succeeded = 0 THEN 'failed' ELSE 'completed' END;
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seo_opt_run_completion
  BEFORE UPDATE ON public.seo_optimization_runs
  FOR EACH ROW EXECUTE FUNCTION public.seo_opt_run_check_completion();

-- ============================================================
-- 4) RPCs (admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.seo_optimization_start(
  _concurrency int DEFAULT 5,
  _threshold int DEFAULT 90,
  _skip_above int DEFAULT 95,
  _actions text[] DEFAULT '{}',
  _force_all boolean DEFAULT false,
  _city_slugs text[] DEFAULT NULL,
  _limit int DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run_id uuid;
  _count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF EXISTS (SELECT 1 FROM public.seo_optimization_runs
             WHERE status IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Un run est déjà actif. Terminez-le avant d''en démarrer un autre.';
  END IF;

  INSERT INTO public.seo_optimization_runs
    (status, concurrency, qa_threshold, qa_skip_above, force_all, actions, filter,
     created_by, started_at, last_progress_at)
  VALUES
    ('queued',
     GREATEST(1, LEAST(20, COALESCE(_concurrency, 5))),
     COALESCE(_threshold, 90),
     COALESCE(_skip_above, 95),
     COALESCE(_force_all, false),
     COALESCE(_actions, '{}'),
     jsonb_build_object('city_slugs', _city_slugs, 'limit', _limit),
     auth.uid(), now(), now())
  RETURNING id INTO _run_id;

  INSERT INTO public.seo_optimization_tasks(run_id, page_id)
  SELECT _run_id, p.id
    FROM public.seo_pages p
   WHERE p.status = 'published'
     AND (COALESCE(_force_all, false)
          OR p.qa_last_score IS NULL
          OR p.qa_last_score < COALESCE(_skip_above, 95))
     AND (_city_slugs IS NULL OR p.city_slug = ANY(_city_slugs))
   ORDER BY COALESCE(p.qa_last_score, 0) ASC, p.updated_at DESC
   LIMIT COALESCE(_limit, 100000)
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO _count FROM public.seo_optimization_tasks WHERE run_id = _run_id;

  IF _count = 0 THEN
    UPDATE public.seo_optimization_runs
       SET status='completed', total=0, finished_at=now()
     WHERE id = _run_id;
  ELSE
    UPDATE public.seo_optimization_runs SET total=_count, status='running' WHERE id = _run_id;
  END IF;

  RETURN _run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_optimization_pause(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_optimization_runs SET status='paused'
    WHERE id=_run_id AND status IN ('queued','running');
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_optimization_resume(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_optimization_runs
     SET status='running', last_progress_at=now()
   WHERE id=_run_id AND status='paused';
  -- Reset any stalled in-flight tasks
  UPDATE public.seo_optimization_tasks
     SET status='pending', next_attempt_at=NULL
   WHERE run_id=_run_id
     AND status IN ('claimed','analyzing','optimizing','qa','publishing');
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_optimization_cancel(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_optimization_runs
     SET status='cancelled', finished_at=now()
   WHERE id=_run_id AND status IN ('queued','running','paused');
  UPDATE public.seo_optimization_tasks
     SET status='cancelled', finished_at=now()
   WHERE run_id=_run_id
     AND status NOT IN ('completed','error','skipped','cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_optimization_retry_errors(_run_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  WITH upd AS (
    UPDATE public.seo_optimization_tasks
       SET status='pending', attempts=0, error=NULL,
           next_attempt_at=NULL, started_at=NULL, finished_at=NULL
     WHERE run_id=_run_id AND status='error'
     RETURNING 1
  ) SELECT COUNT(*) INTO _n FROM upd;

  UPDATE public.seo_optimization_runs
     SET status='running', finished_at=NULL, last_progress_at=now()
   WHERE id=_run_id AND status IN ('completed','failed','cancelled');
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_optimization_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run jsonb;
  _journal jsonb;
  _history jsonb;
  _today jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT to_jsonb(r.*) INTO _run
    FROM public.seo_optimization_runs r
   WHERE status IN ('queued','running','paused')
   ORDER BY created_at DESC LIMIT 1;

  IF _run IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.finished_at DESC NULLS LAST), '[]'::jsonb)
      INTO _journal
      FROM (
        SELECT t.id, t.status, t.qa_before, t.qa_after, t.ai_calls, t.cost_estimate,
               t.duration_ms, t.fixed_actions, t.error, t.skip_reason, t.attempts,
               t.finished_at, t.started_at,
               p.slug, p.title
          FROM public.seo_optimization_tasks t
          JOIN public.seo_pages p ON p.id = t.page_id
         WHERE t.run_id = (_run->>'id')::uuid
           AND t.status IN ('completed','error','skipped')
         ORDER BY t.finished_at DESC NULLS LAST
         LIMIT 50
      ) t;
  ELSE
    _journal := '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO _history
    FROM (SELECT * FROM public.seo_optimization_runs ORDER BY created_at DESC LIMIT 10) r;

  SELECT jsonb_build_object(
    'runs_today',   (SELECT COUNT(*) FROM public.seo_optimization_runs WHERE created_at::date = current_date),
    'pages_today',  (SELECT COUNT(*) FROM public.seo_optimization_tasks WHERE finished_at::date = current_date AND status='completed'),
    'skipped_today',(SELECT COUNT(*) FROM public.seo_optimization_tasks WHERE finished_at::date = current_date AND status='skipped'),
    'failed_today', (SELECT COUNT(*) FROM public.seo_optimization_tasks WHERE finished_at::date = current_date AND status='error'),
    'ai_calls_today',(SELECT COALESCE(SUM(ai_calls),0) FROM public.seo_optimization_tasks WHERE finished_at::date = current_date),
    'cost_today',   (SELECT COALESCE(SUM(cost_estimate),0) FROM public.seo_optimization_tasks WHERE finished_at::date = current_date),
    'avg_duration_ms', (SELECT COALESCE(ROUND(AVG(duration_ms))::int,0) FROM public.seo_optimization_tasks WHERE finished_at::date = current_date AND status='completed')
  ) INTO _today;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'active_run',  _run,
    'journal',     _journal,
    'history',     _history,
    'today',       _today
  );
END;
$$;

-- ============================================================
-- 5) Watchdog: re-queue tasks stuck in 'claimed' for >5 min
-- ============================================================
CREATE OR REPLACE FUNCTION public.seo_optimization_watchdog()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int := 0;
BEGIN
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
  RETURN _n;
END;
$$;
