-- Priorité de traitement des tâches d'optimisation
ALTER TABLE public.seo_optimization_tasks
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;
CREATE INDEX IF NOT EXISTS idx_seo_opt_tasks_priority
  ON public.seo_optimization_tasks (run_id, priority, created_at)
  WHERE status IN ('pending','error');

-- Claim par priorité
CREATE OR REPLACE FUNCTION public.exec_claim_optim_tasks(_run_id uuid, _size integer)
 RETURNS TABLE(id uuid, page_id uuid, attempts integer, max_attempts integer, qa_before integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT t.id
      FROM public.seo_optimization_tasks t
     WHERE t.run_id = _run_id
       AND t.status IN ('pending','error')
       AND t.attempts < t.max_attempts
       AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
     ORDER BY t.priority ASC, t.created_at ASC
     LIMIT GREATEST(1, LEAST(COALESCE(_size, 1), 10))
     FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.seo_optimization_tasks t
       SET status = 'claimed', started_at = now(), attempts = t.attempts + 1,
           error_source = NULL, error_http_status = NULL, error_function = NULL,
           error_stack = NULL, error_context = '{}'::jsonb
      FROM picked
     WHERE t.id = picked.id
     RETURNING t.id, t.page_id, t.attempts, t.max_attempts, t.qa_before
  )
  SELECT updated.id, updated.page_id, updated.attempts, updated.max_attempts, updated.qa_before
    FROM updated;
END;
$function$;

-- Vue candidate commune : classification + priorité
CREATE OR REPLACE VIEW public.seo_bulk_candidates WITH (security_invoker = on) AS
SELECT
  p.id,
  p.slug,
  p.title,
  p.city_slug,
  p.material_slug,
  COALESCE(p.seo_score, p.qa_last_score) AS score,
  p.needs_refresh,
  p.proc_status,
  p.word_count,
  p.internal_link_count,
  p.last_analyzed_at,
  (p.proc_status = 'error') AS is_error,
  (
    COALESCE(p.seo_score, p.qa_last_score) IS NULL
    OR COALESCE(p.seo_score, p.qa_last_score) < 85
    OR COALESCE(p.word_count, 0) < 600
    OR COALESCE(p.internal_link_count, 0) < 3
    OR p.meta_title IS NULL OR p.meta_description IS NULL
    OR length(p.meta_description) < 120 OR length(p.meta_description) > 175
    OR length(p.meta_title) < 30 OR length(p.meta_title) > 65
  ) AS is_to_improve,
  (
    p.needs_refresh IS TRUE
    OR p.last_analyzed_at IS NULL
    OR p.last_analyzed_at < now() - INTERVAL '90 days'
  ) AS is_to_refresh,
  (COALESCE(p.seo_score, p.qa_last_score) >= 85) AS is_excellent
FROM public.seo_pages p
WHERE p.status = 'published';

GRANT SELECT ON public.seo_bulk_candidates TO authenticated, service_role;

-- Tableau de bord global
CREATE OR REPLACE FUNCTION public.seo_bulk_overview()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'computed_at', now(),
    'total', COUNT(*),
    'excellent', COUNT(*) FILTER (WHERE score >= 85),
    'good', COUNT(*) FILTER (WHERE score >= 65 AND score < 85),
    'weak', COUNT(*) FILTER (WHERE score IS NOT NULL AND score < 65),
    'never_analyzed', COUNT(*) FILTER (WHERE score IS NULL),
    'to_improve', COUNT(*) FILTER (WHERE is_to_improve),
    'to_refresh', COUNT(*) FILTER (WHERE is_to_refresh),
    'errors', COUNT(*) FILTER (WHERE is_error),
    'avg_score', COALESCE(ROUND(AVG(score) FILTER (WHERE score IS NOT NULL))::int, 0)
  )
  FROM public.seo_bulk_candidates;
$function$;

-- Simulation : "Analyser avant d'optimiser"
CREATE OR REPLACE FUNCTION public.seo_bulk_preview(_mode text DEFAULT 'optimize', _scope text DEFAULT 'all')
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  WITH c AS (
    SELECT * FROM public.seo_bulk_candidates
  ), sel AS (
    SELECT * FROM c
     WHERE CASE COALESCE(_scope,'all')
             WHEN 'to_improve' THEN is_to_improve
             WHEN 'to_refresh' THEN is_to_refresh
             WHEN 'errors'     THEN is_error
             ELSE true
           END
       AND CASE WHEN COALESCE(_mode,'optimize') = 'refresh'
                THEN (is_to_refresh OR is_to_improve OR is_error)
                ELSE true END
  ), targets AS (
    SELECT * FROM sel
     WHERE is_error OR is_to_improve OR is_to_refresh OR score IS NULL
  )
  SELECT jsonb_build_object(
    'mode', COALESCE(_mode,'optimize'),
    'scope', COALESCE(_scope,'all'),
    'analyzed', (SELECT COUNT(*) FROM c),
    'in_scope', (SELECT COUNT(*) FROM sel),
    'will_process', (SELECT COUNT(*) FROM targets),
    'to_improve', (SELECT COUNT(*) FROM sel WHERE is_to_improve),
    'to_refresh', (SELECT COUNT(*) FROM sel WHERE is_to_refresh),
    'already_excellent', (SELECT COUNT(*) FROM sel WHERE is_excellent AND NOT is_to_improve AND NOT is_to_refresh),
    'errors', (SELECT COUNT(*) FROM sel WHERE is_error),
    'sample', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT slug, title, score, is_error, is_to_improve, is_to_refresh
          FROM targets
         ORDER BY is_error DESC, COALESCE(score, 0) ASC
         LIMIT 20) x), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END;
$function$;

-- Démarrage d'une opération massive
CREATE OR REPLACE FUNCTION public.seo_bulk_start(
  _mode text DEFAULT 'optimize',
  _scope text DEFAULT 'all',
  _concurrency integer DEFAULT 3,
  _limit integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _run_id uuid;
  _count int;
  _skip_above int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF EXISTS (SELECT 1 FROM public.seo_optimization_runs WHERE status IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Une opération est déjà en cours. Reprenez-la ou arrêtez-la avant d''en lancer une autre.';
  END IF;

  _skip_above := CASE WHEN COALESCE(_mode,'optimize') = 'refresh' THEN 92 ELSE 95 END;

  INSERT INTO public.seo_optimization_runs
    (status, concurrency, qa_threshold, qa_skip_above, force_all, actions, filter,
     created_by, started_at, last_progress_at)
  VALUES ('queued', GREATEST(1, LEAST(10, COALESCE(_concurrency,3))), 90, _skip_above, false, '{}',
     jsonb_build_object('mode', COALESCE(_mode,'optimize'), 'scope', COALESCE(_scope,'all'), 'limit', _limit),
     auth.uid(), now(), now())
  RETURNING id INTO _run_id;

  INSERT INTO public.seo_optimization_tasks(run_id, page_id, priority)
  SELECT _run_id, c.id,
         CASE
           WHEN c.is_error THEN 10
           WHEN c.score IS NOT NULL AND c.score < 50 THEN 20
           WHEN c.score IS NULL THEN 25
           WHEN c.score < 65 THEN 30
           WHEN c.is_to_improve THEN 40
           WHEN c.is_to_refresh THEN 50
           WHEN COALESCE(c.word_count,0) < 600 THEN 60
           ELSE 90
         END
    FROM public.seo_bulk_candidates c
   WHERE (CASE COALESCE(_scope,'all')
            WHEN 'to_improve' THEN c.is_to_improve
            WHEN 'to_refresh' THEN c.is_to_refresh
            WHEN 'errors'     THEN c.is_error
            ELSE true
          END)
     AND (c.is_error OR c.is_to_improve OR c.is_to_refresh OR c.score IS NULL)
   ORDER BY 3 ASC, COALESCE(c.score, 0) ASC
   LIMIT COALESCE(_limit, 100000)
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO _count FROM public.seo_optimization_tasks WHERE run_id = _run_id;

  IF _count = 0 THEN
    UPDATE public.seo_optimization_runs SET status='completed', total=0, finished_at=now() WHERE id=_run_id;
  ELSE
    UPDATE public.seo_optimization_runs SET total=_count, status='running' WHERE id=_run_id;
  END IF;

  RETURN jsonb_build_object('run_id', _run_id, 'total', _count,
                            'mode', COALESCE(_mode,'optimize'), 'scope', COALESCE(_scope,'all'));
END;
$function$;

-- État temps réel d'une opération massive
CREATE OR REPLACE FUNCTION public.seo_bulk_state()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _run public.seo_optimization_runs%ROWTYPE; _res jsonb; _current jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT * INTO _run FROM public.seo_optimization_runs
   WHERE status IN ('queued','running','paused')
   ORDER BY created_at DESC LIMIT 1;

  IF _run.id IS NULL THEN
    SELECT * INTO _run FROM public.seo_optimization_runs
     ORDER BY created_at DESC LIMIT 1;
    IF _run.id IS NULL THEN
      RETURN jsonb_build_object('run', NULL);
    END IF;
  END IF;

  SELECT to_jsonb(x) INTO _current FROM (
    SELECT p.slug, p.title
      FROM public.seo_optimization_tasks t
      JOIN public.seo_pages p ON p.id = t.page_id
     WHERE t.run_id = _run.id AND t.status IN ('claimed','analyzing','optimizing','qa')
     ORDER BY t.started_at DESC NULLS LAST LIMIT 1) x;

  SELECT jsonb_build_object(
    'run', to_jsonb(_run),
    'mode', _run.filter->>'mode',
    'scope', _run.filter->>'scope',
    'current_page', _current,
    'counts', (SELECT jsonb_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status IN ('pending')),
        'in_progress', COUNT(*) FILTER (WHERE status IN ('claimed','analyzing','optimizing','qa','publishing')),
        'completed', COUNT(*) FILTER (WHERE status='completed'),
        'skipped', COUNT(*) FILTER (WHERE status='skipped'),
        'errors', COUNT(*) FILTER (WHERE status='error'),
        'improved', COUNT(*) FILTER (WHERE status='completed' AND qa_after IS NOT NULL AND qa_before IS NOT NULL AND qa_after > qa_before)
      ) FROM public.seo_optimization_tasks WHERE run_id = _run.id),
    'recent', COALESCE((SELECT jsonb_agg(j) FROM (
        SELECT t.id, t.status, t.qa_before, t.qa_after, t.fixed_actions, t.error,
               t.skip_reason, t.finished_at, p.slug, p.title
          FROM public.seo_optimization_tasks t
          JOIN public.seo_pages p ON p.id = t.page_id
         WHERE t.run_id = _run.id AND t.status IN ('completed','error','skipped')
         ORDER BY t.finished_at DESC NULLS LAST LIMIT 25) j), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END;
$function$;

-- Liste détaillée des erreurs
CREATE OR REPLACE FUNCTION public.seo_bulk_errors(_run_id uuid)
 RETURNS TABLE(task_id uuid, page_id uuid, slug text, title text, error text, attempts int, last_error_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  RETURN QUERY
  SELECT t.id, t.page_id, p.slug, p.title, t.error, t.attempts, t.last_error_at
    FROM public.seo_optimization_tasks t
    JOIN public.seo_pages p ON p.id = t.page_id
   WHERE t.run_id = _run_id AND t.status = 'error'
   ORDER BY t.last_error_at DESC NULLS LAST;
END;
$function$;

-- Relance d'une tâche en erreur
CREATE OR REPLACE FUNCTION public.seo_bulk_retry_task(_task_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _run uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_optimization_tasks
     SET status='pending', attempts=0, error=NULL, next_attempt_at=NULL,
         started_at=NULL, finished_at=NULL, priority=5
   WHERE id=_task_id AND status='error'
   RETURNING run_id INTO _run;
  IF _run IS NULL THEN RETURN false; END IF;
  UPDATE public.seo_optimization_runs
     SET status='running', finished_at=NULL, last_progress_at=now()
   WHERE id=_run AND status IN ('completed','failed','cancelled');
  RETURN true;
END;
$function$;

-- Historique d'optimisation d'une page
CREATE OR REPLACE FUNCTION public.seo_page_optim_history(_page_id uuid, _limit integer DEFAULT 20)
 RETURNS TABLE(task_id uuid, run_id uuid, status text, qa_before int, qa_after int,
               fixed_actions text[], skip_reason text, error text, finished_at timestamptz, mode text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  RETURN QUERY
  SELECT t.id, t.run_id, t.status, t.qa_before, t.qa_after, t.fixed_actions,
         t.skip_reason, t.error, t.finished_at, COALESCE(r.filter->>'mode','optimize')
    FROM public.seo_optimization_tasks t
    JOIN public.seo_optimization_runs r ON r.id = t.run_id
   WHERE t.page_id = _page_id AND t.finished_at IS NOT NULL
   ORDER BY t.finished_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit,20), 100));
END;
$function$;