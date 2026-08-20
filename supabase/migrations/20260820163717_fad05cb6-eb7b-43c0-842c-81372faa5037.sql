CREATE OR REPLACE FUNCTION public.seo_control_center()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _per_city int;
  _cities int;
  _totals jsonb;
  _rows jsonb;
  _run jsonb;
  _queued int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT (SELECT COUNT(*) FROM public.seo_materials WHERE active)
       + (SELECT COUNT(*) FROM public.seo_services WHERE active) + 1
    INTO _per_city;
  SELECT COUNT(*) FROM public.seo_cities WHERE active AND served INTO _cities;

  SELECT jsonb_build_object(
    'per_city', _per_city,
    'cities', _cities,
    'target_total', _per_city * _cities,
    'generated', (SELECT COUNT(*) FROM public.seo_pages),
    'published', (SELECT COUNT(*) FROM public.seo_pages WHERE status = 'published' OR published_at IS NOT NULL),
    'drafts', (SELECT COUNT(*) FROM public.seo_pages WHERE status <> 'published' AND published_at IS NULL),
    'errors', (SELECT COUNT(*) FROM public.seo_page_tasks WHERE status IN ('failed','needs_retry'))
  ) INTO _totals;

  _totals := _totals || jsonb_build_object(
    'remaining', GREATEST(0, (_totals->>'target_total')::int - (_totals->>'generated')::int)
  );

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO _rows
  FROM (
    SELECT jsonb_build_object(
      'slug', c.slug,
      'name', c.name,
      'planned', _per_city,
      'generated', g.n,
      'published', g.p,
      'remaining', GREATEST(0, _per_city - g.n),
      'errors', e.n,
      'pct', CASE WHEN _per_city > 0 THEN LEAST(100, ROUND(g.p::numeric * 100 / _per_city))::int ELSE 0 END,
      'status', CASE
        WHEN e.n > 0 THEN 'error'
        WHEN g.n >= _per_city AND g.p >= _per_city THEN 'done'
        WHEN g.n > 0 THEN 'running'
        ELSE 'todo' END
    ) AS x
    FROM public.seo_cities c
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE p.status = 'published' OR p.published_at IS NOT NULL)::int AS p
        FROM public.seo_pages p WHERE p.city_slug = c.slug
    ) g
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS n FROM public.seo_page_tasks t
       WHERE t.city_slug = c.slug AND t.status IN ('failed','needs_retry')
    ) e
    WHERE c.active AND c.served
  ) s;

  SELECT to_jsonb(r.*) INTO _run
    FROM public.seo_pipeline_runs r
   WHERE r.status IN ('queued','running','paused')
   ORDER BY r.created_at DESC LIMIT 1;

  SELECT COUNT(*)::int INTO _queued
    FROM public.seo_page_tasks WHERE status IN ('queued','running');

  RETURN jsonb_build_object(
    'computed_at', now(),
    'totals', _totals,
    'cities', _rows,
    'active_run', _run,
    'queued_tasks', _queued
  );
END $function$;

CREATE OR REPLACE FUNCTION public.seo_city_retry_errors(_city_slug text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  WITH upd AS (
    UPDATE public.seo_page_tasks
       SET status = 'queued', attempts = 0, last_error = NULL,
           next_attempt_at = NULL, started_at = NULL, finished_at = NULL, updated_at = now()
     WHERE city_slug = _city_slug AND status IN ('failed','needs_retry')
    RETURNING 1
  ) SELECT COUNT(*) INTO _n FROM upd;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.seo_city_publish_missing(_city_slug text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  WITH upd AS (
    UPDATE public.seo_pages
       SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
     WHERE city_slug = _city_slug
       AND status <> 'published' AND published_at IS NULL
    RETURNING 1
  ) SELECT COUNT(*) INTO _n FROM upd;
  RETURN _n;
END $function$;

GRANT EXECUTE ON FUNCTION public.seo_control_center() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_city_retry_errors(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seo_city_publish_missing(text) TO authenticated;