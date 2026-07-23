
-- Phase 1: Industrial mesh engine (batches, workers, watchdog, incremental hashing)

-- 1) Extend blog_mesh_runs with pipeline-style fields
ALTER TABLE public.blog_mesh_runs
  ADD COLUMN IF NOT EXISTS total_batches INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS done_batches INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_items INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS done_items INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_items INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS batch_size_posts INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS batch_size_pages INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS item_ids UUID[] NOT NULL DEFAULT '{}';

-- Allow new statuses
ALTER TABLE public.blog_mesh_runs DROP CONSTRAINT IF EXISTS blog_mesh_runs_status_check;
ALTER TABLE public.blog_mesh_runs ADD CONSTRAINT blog_mesh_runs_status_check
  CHECK (status IN ('queued','running','paused','completed','failed','cancelled'));

-- 2) Batches table
CREATE TABLE IF NOT EXISTS public.blog_mesh_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.blog_mesh_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('posts','pages')),
  item_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','running','completed','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blog_mesh_batches_run_idx ON public.blog_mesh_batches(run_id, status);
CREATE INDEX IF NOT EXISTS blog_mesh_batches_claim_idx ON public.blog_mesh_batches(status, next_attempt_at NULLS FIRST, sort_order);

GRANT SELECT ON public.blog_mesh_batches TO authenticated;
GRANT ALL ON public.blog_mesh_batches TO service_role;

ALTER TABLE public.blog_mesh_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read blog_mesh_batches" ON public.blog_mesh_batches
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER blog_mesh_batches_touch BEFORE UPDATE ON public.blog_mesh_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Content hash columns for incremental skip
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS mesh_content_hash TEXT;
ALTER TABLE public.seo_pages  ADD COLUMN IF NOT EXISTS mesh_content_hash TEXT;

-- 4) RPCs
CREATE OR REPLACE FUNCTION public.blog_mesh_start(
  _mode TEXT DEFAULT 'full',
  _item_ids UUID[] DEFAULT NULL,
  _batch_posts INTEGER DEFAULT 25,
  _batch_pages INTEGER DEFAULT 50
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _run_id UUID;
  _post_ids UUID[];
  _page_ids UUID[];
  _post_count INT;
  _page_count INT;
  _batch_count INT := 0;
  _i INT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF EXISTS (SELECT 1 FROM public.blog_mesh_runs WHERE status IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Un run de maillage est déjà actif.';
  END IF;

  -- Select items to process
  IF _mode = 'single_post' AND _item_ids IS NOT NULL THEN
    _post_ids := _item_ids;
    _page_ids := '{}';
  ELSIF _mode = 'single_page' AND _item_ids IS NOT NULL THEN
    _post_ids := '{}';
    _page_ids := _item_ids;
  ELSIF _mode = 'incremental' THEN
    SELECT COALESCE(array_agg(id), '{}') INTO _post_ids
      FROM public.blog_posts
     WHERE status = 'published'
       AND (mesh_analyzed_at IS NULL OR mesh_analyzed_at < updated_at OR mesh_content_hash IS NULL);
    SELECT COALESCE(array_agg(id), '{}') INTO _page_ids
      FROM public.seo_pages
     WHERE status = 'published'
       AND (mesh_content_hash IS NULL);
  ELSE -- 'full'
    SELECT COALESCE(array_agg(id), '{}') INTO _post_ids FROM public.blog_posts WHERE status = 'published';
    SELECT COALESCE(array_agg(id), '{}') INTO _page_ids FROM public.seo_pages  WHERE status = 'published';
  END IF;

  _post_count := COALESCE(array_length(_post_ids, 1), 0);
  _page_count := COALESCE(array_length(_page_ids, 1), 0);

  INSERT INTO public.blog_mesh_runs(status, mode, batch_size_posts, batch_size_pages, total_items, created_by, item_ids)
  VALUES ('queued', _mode, GREATEST(1, _batch_posts), GREATEST(1, _batch_pages), _post_count + _page_count, auth.uid(),
          COALESCE(_post_ids, '{}') || COALESCE(_page_ids, '{}'))
  RETURNING id INTO _run_id;

  -- Chunk posts
  _i := 1;
  WHILE _i <= _post_count LOOP
    INSERT INTO public.blog_mesh_batches(run_id, kind, item_ids, sort_order)
    VALUES (_run_id, 'posts', _post_ids[_i:LEAST(_i + _batch_posts - 1, _post_count)], _batch_count);
    _batch_count := _batch_count + 1;
    _i := _i + _batch_posts;
  END LOOP;

  -- Chunk pages
  _i := 1;
  WHILE _i <= _page_count LOOP
    INSERT INTO public.blog_mesh_batches(run_id, kind, item_ids, sort_order)
    VALUES (_run_id, 'pages', _page_ids[_i:LEAST(_i + _batch_pages - 1, _page_count)], _batch_count);
    _batch_count := _batch_count + 1;
    _i := _i + _batch_pages;
  END LOOP;

  UPDATE public.blog_mesh_runs
     SET total_batches = _batch_count,
         status = CASE WHEN _batch_count = 0 THEN 'completed' ELSE 'running' END,
         finished_at = CASE WHEN _batch_count = 0 THEN now() ELSE NULL END
   WHERE id = _run_id;

  RETURN _run_id;
END $$;

CREATE OR REPLACE FUNCTION public.blog_mesh_pause(_run_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  UPDATE public.blog_mesh_runs SET status='paused'
   WHERE id=_run_id AND status IN ('queued','running');
END $$;

CREATE OR REPLACE FUNCTION public.blog_mesh_resume(_run_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  UPDATE public.blog_mesh_runs SET status='running', last_progress_at=now()
   WHERE id=_run_id AND status='paused';
  UPDATE public.blog_mesh_batches SET status='queued', next_attempt_at=NULL
   WHERE run_id=_run_id AND status='claimed';
END $$;

CREATE OR REPLACE FUNCTION public.blog_mesh_cancel(_run_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  UPDATE public.blog_mesh_runs SET status='cancelled', finished_at=now()
   WHERE id=_run_id AND status IN ('queued','running','paused');
  UPDATE public.blog_mesh_batches SET status='cancelled', finished_at=now()
   WHERE run_id=_run_id AND status NOT IN ('completed','failed','cancelled');
END $$;

CREATE OR REPLACE FUNCTION public.blog_mesh_retry_errors(_run_id UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  WITH upd AS (
    UPDATE public.blog_mesh_batches
       SET status='queued', attempts=0, error=NULL, next_attempt_at=NULL,
           started_at=NULL, finished_at=NULL
     WHERE run_id=_run_id AND status='failed'
    RETURNING 1
  ) SELECT COUNT(*) INTO _n FROM upd;
  UPDATE public.blog_mesh_runs SET status='running', finished_at=NULL, last_progress_at=now()
   WHERE id=_run_id AND status IN ('failed','completed','cancelled');
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.blog_mesh_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _run jsonb; _batches jsonb; _history jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;

  SELECT to_jsonb(r.*) INTO _run
    FROM public.blog_mesh_runs r
   WHERE status IN ('queued','running','paused')
   ORDER BY created_at DESC LIMIT 1;

  IF _run IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(b) ORDER BY b.sort_order), '[]'::jsonb)
      INTO _batches
      FROM (SELECT * FROM public.blog_mesh_batches WHERE run_id=(_run->>'id')::uuid
            ORDER BY sort_order LIMIT 200) b;
  ELSE
    _batches := '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO _history
    FROM (SELECT * FROM public.blog_mesh_runs ORDER BY created_at DESC LIMIT 10) r;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'active_run', _run,
    'batches', _batches,
    'history', _history
  );
END $$;

-- Roll-up trigger: batches → run progress
CREATE OR REPLACE FUNCTION public.blog_mesh_batch_rollup() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _terminal_old BOOLEAN;
  _terminal_new BOOLEAN;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  _terminal_old := OLD.status IN ('completed','failed','cancelled');
  _terminal_new := NEW.status IN ('completed','failed','cancelled');

  IF _terminal_new AND NOT _terminal_old THEN
    UPDATE public.blog_mesh_runs SET
      done_batches = done_batches + 1,
      done_items = done_items + CASE WHEN NEW.status='completed' THEN COALESCE(NEW.processed_count,0) ELSE 0 END,
      failed_items = failed_items + CASE WHEN NEW.status='failed' THEN COALESCE(array_length(NEW.item_ids,1),0) ELSE 0 END,
      last_progress_at = now()
    WHERE id = NEW.run_id;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.blog_mesh_runs SET last_progress_at = now() WHERE id = NEW.run_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS blog_mesh_batches_rollup ON public.blog_mesh_batches;
CREATE TRIGGER blog_mesh_batches_rollup AFTER UPDATE ON public.blog_mesh_batches
  FOR EACH ROW EXECUTE FUNCTION public.blog_mesh_batch_rollup();

-- Auto-complete run when all batches terminal
CREATE OR REPLACE FUNCTION public.blog_mesh_run_check_completion() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'running' AND NEW.total_batches > 0 AND NEW.done_batches >= NEW.total_batches THEN
    NEW.status := CASE WHEN NEW.failed_items > 0 AND NEW.done_items = 0 THEN 'failed' ELSE 'completed' END;
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS blog_mesh_runs_completion ON public.blog_mesh_runs;
CREATE TRIGGER blog_mesh_runs_completion BEFORE UPDATE ON public.blog_mesh_runs
  FOR EACH ROW EXECUTE FUNCTION public.blog_mesh_run_check_completion();
