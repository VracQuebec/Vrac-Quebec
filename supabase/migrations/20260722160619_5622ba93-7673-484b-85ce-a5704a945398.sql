
-- =========================================================================
-- SEO Pipeline V2 — génération ville-par-ville
-- =========================================================================

-- 1) TABLES ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.seo_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'all_cities', -- all_cities | single_city | retry_errors | republish
  status TEXT NOT NULL DEFAULT 'queued',   -- queued|running|paused|stopped|completed|failed|cancelled
  city_slugs TEXT[] NOT NULL DEFAULT '{}',
  qa_threshold INT NOT NULL DEFAULT 90,
  max_retries INT NOT NULL DEFAULT 3,
  page_timeout_ms INT NOT NULL DEFAULT 60000,
  force_regenerate BOOLEAN NOT NULL DEFAULT false,
  total_pages INT NOT NULL DEFAULT 0,
  done_pages INT NOT NULL DEFAULT 0,
  succeeded_pages INT NOT NULL DEFAULT 0,
  failed_pages INT NOT NULL DEFAULT 0,
  retries_count INT NOT NULL DEFAULT 0,
  qa_avg NUMERIC(5,2),
  current_city_slug TEXT,
  pages_per_minute NUMERIC(6,2),
  eta_seconds INT,
  last_progress_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_pipeline_runs TO authenticated;
GRANT ALL ON public.seo_pipeline_runs TO service_role;
ALTER TABLE public.seo_pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pipeline_runs" ON public.seo_pipeline_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.seo_city_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.seo_pipeline_runs(id) ON DELETE CASCADE,
  city_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|paused|completed|failed|cancelled
  sort_order INT NOT NULL DEFAULT 0,
  total_tasks INT NOT NULL DEFAULT 0,
  done_tasks INT NOT NULL DEFAULT 0,
  succeeded_tasks INT NOT NULL DEFAULT 0,
  failed_tasks INT NOT NULL DEFAULT 0,
  retries_count INT NOT NULL DEFAULT 0,
  qa_avg NUMERIC(5,2),
  current_step TEXT,
  sitemap_updated_at TIMESTAMPTZ,
  last_progress_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, city_slug)
);

GRANT SELECT ON public.seo_city_batches TO authenticated;
GRANT ALL ON public.seo_city_batches TO service_role;
ALTER TABLE public.seo_city_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read city_batches" ON public.seo_city_batches
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.seo_page_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.seo_city_batches(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.seo_pipeline_runs(id) ON DELETE CASCADE,
  city_slug TEXT NOT NULL,
  material_slug TEXT,
  service_slug TEXT,
  kind TEXT NOT NULL DEFAULT 'full', -- full = generate+qa+autofix+publish
  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|needs_retry|skipped|cancelled
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  page_id UUID,
  page_slug TEXT,
  qa_score INT,
  duration_ms INT,
  last_error TEXT,
  step TEXT, -- generate|qa|autofix|publish
  next_attempt_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_page_tasks TO authenticated;
GRANT ALL ON public.seo_page_tasks TO service_role;
ALTER TABLE public.seo_page_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read page_tasks" ON public.seo_page_tasks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Uniqueness: one active task per (batch, city, material, service, kind)
CREATE UNIQUE INDEX IF NOT EXISTS seo_page_tasks_active_uniq
  ON public.seo_page_tasks (
    batch_id, city_slug,
    COALESCE(material_slug,''), COALESCE(service_slug,''), kind
  ) WHERE status IN ('queued','running','needs_retry');

CREATE INDEX IF NOT EXISTS seo_page_tasks_batch_status_idx
  ON public.seo_page_tasks (batch_id, status);
CREATE INDEX IF NOT EXISTS seo_page_tasks_run_status_idx
  ON public.seo_page_tasks (run_id, status);
CREATE INDEX IF NOT EXISTS seo_city_batches_run_status_idx
  ON public.seo_city_batches (run_id, status, sort_order);

-- Only one active pipeline run at a time
CREATE UNIQUE INDEX IF NOT EXISTS seo_pipeline_runs_single_active
  ON public.seo_pipeline_runs ((1)) WHERE status IN ('queued','running','paused');

-- updated_at triggers
CREATE TRIGGER trg_seo_pipeline_runs_updated
  BEFORE UPDATE ON public.seo_pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_seo_city_batches_updated
  BEFORE UPDATE ON public.seo_city_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_seo_page_tasks_updated
  BEFORE UPDATE ON public.seo_page_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.seo_pipeline_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.seo_city_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.seo_page_tasks;

-- 2) CONTROL RPCs ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seo_pipeline_start(
  _mode TEXT DEFAULT 'all_cities',
  _city_slugs TEXT[] DEFAULT NULL,
  _qa_threshold INT DEFAULT 90,
  _force_regenerate BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _run_id UUID;
  _slugs TEXT[];
  _uid UUID := auth.uid();
BEGIN
  IF NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  -- Fail if a run is already active
  IF EXISTS (SELECT 1 FROM public.seo_pipeline_runs
              WHERE status IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Un lancement est déjà en cours. Arrêtez-le avant d''en démarrer un autre.';
  END IF;

  IF _city_slugs IS NOT NULL AND array_length(_city_slugs, 1) > 0 THEN
    _slugs := _city_slugs;
  ELSE
    SELECT array_agg(slug ORDER BY COALESCE(population, 0) DESC, name)
      INTO _slugs
      FROM public.seo_cities WHERE active = true;
  END IF;

  IF _slugs IS NULL OR array_length(_slugs, 1) = 0 THEN
    RAISE EXCEPTION 'Aucune ville active';
  END IF;

  INSERT INTO public.seo_pipeline_runs
    (mode, status, city_slugs, qa_threshold, force_regenerate, created_by, started_at, last_progress_at)
  VALUES
    (_mode, 'queued', _slugs, COALESCE(_qa_threshold, 90), COALESCE(_force_regenerate, false), _uid, now(), now())
  RETURNING id INTO _run_id;

  INSERT INTO public.seo_city_batches (run_id, city_slug, sort_order, status)
    SELECT _run_id, s, ord, 'queued'
    FROM unnest(_slugs) WITH ORDINALITY AS t(s, ord);

  RETURN _run_id;
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_pause(_run_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_pipeline_runs SET status = 'paused'
    WHERE id = _run_id AND status IN ('queued','running');
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_resume(_run_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_pipeline_runs SET status = 'running', last_progress_at = now()
    WHERE id = _run_id AND status = 'paused';
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_stop(_run_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_pipeline_runs SET status = 'stopped', finished_at = now()
    WHERE id = _run_id AND status IN ('queued','running','paused');
  UPDATE public.seo_city_batches SET status = 'cancelled', finished_at = now()
    WHERE run_id = _run_id AND status IN ('queued','running','paused');
  UPDATE public.seo_page_tasks SET status = 'cancelled', finished_at = now()
    WHERE run_id = _run_id AND status IN ('queued','running','needs_retry');
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_cancel(_run_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  PERFORM public.seo_pipeline_stop(_run_id);
  UPDATE public.seo_pipeline_runs SET status = 'cancelled' WHERE id = _run_id;
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_retry_errors(_run_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  WITH upd AS (
    UPDATE public.seo_page_tasks
       SET status = 'queued', attempts = 0, last_error = NULL,
           next_attempt_at = NULL, started_at = NULL, finished_at = NULL
     WHERE run_id = _run_id AND status IN ('failed','needs_retry','cancelled')
    RETURNING 1
  ) SELECT COUNT(*) INTO _n FROM upd;

  UPDATE public.seo_city_batches SET status = 'queued', finished_at = NULL
    WHERE run_id = _run_id
      AND status IN ('failed','completed','cancelled')
      AND EXISTS (SELECT 1 FROM public.seo_page_tasks t
                  WHERE t.batch_id = seo_city_batches.id AND t.status = 'queued');

  UPDATE public.seo_pipeline_runs SET status = 'queued', finished_at = NULL, last_progress_at = now()
    WHERE id = _run_id AND status IN ('failed','completed','stopped','cancelled');

  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_regenerate_city(_city_slug TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  RETURN public.seo_pipeline_start('single_city', ARRAY[_city_slug], 90, true);
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_republish_city(_city_slug TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _run_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  _run_id := public.seo_pipeline_start('republish', ARRAY[_city_slug], 90, false);
  RETURN _run_id;
END $$;

CREATE OR REPLACE FUNCTION public.seo_pipeline_state_v2()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _run JSONB;
  _batches JSONB;
  _recent JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT to_jsonb(r.*) INTO _run
    FROM public.seo_pipeline_runs r
   WHERE status IN ('queued','running','paused')
   ORDER BY created_at DESC LIMIT 1;

  IF _run IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(b.*) ORDER BY b.sort_order), '[]'::jsonb) INTO _batches
      FROM public.seo_city_batches b
     WHERE b.run_id = (_run->>'id')::uuid;
  ELSE
    _batches := '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r.*) ORDER BY created_at DESC), '[]'::jsonb) INTO _recent
    FROM (
      SELECT id, mode, status, total_pages, done_pages, succeeded_pages, failed_pages,
             qa_avg, started_at, finished_at, created_at
        FROM public.seo_pipeline_runs
       ORDER BY created_at DESC LIMIT 10
    ) r;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'active_run', _run,
    'batches', _batches,
    'recent_runs', _recent
  );
END $$;

GRANT EXECUTE ON FUNCTION public.seo_pipeline_start(TEXT, TEXT[], INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_pause(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_resume(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_stop(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_cancel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_retry_errors(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_regenerate_city(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_republish_city(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_state_v2() TO authenticated;
