-- Progression ville par ville persistée en base : chaque page générée met à jour
-- le job de la ville, et la vue d'ensemble expose la ville réellement en cours.
-- Aucune page, URL ou ville n'est modifiée ou supprimée.

CREATE OR REPLACE FUNCTION public.seo_city_run_progress(
  _job_id uuid, _done integer, _created integer, _errors integer, _current_label text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_generation_jobs
  SET done = coalesce(_done, done),
      succeeded = coalesce(_created, succeeded),
      failed = coalesce(_errors, failed),
      last_progress_at = now(),
      heartbeat_at = now(),
      updated_at = now(),
      report = coalesce(report,'{}'::jsonb) || jsonb_build_object('current_label', _current_label)
  WHERE id = _job_id AND mode = 'city' AND status = 'running';
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_run_progress(uuid, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_run_progress(uuid, integer, integer, integer, text) TO authenticated, service_role;

-- Run de ville réellement actif (heartbeat récent). Sert de verrou « une seule ville à la fois ».
CREATE OR REPLACE FUNCTION public.seo_city_active_run()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  SELECT jsonb_build_object(
    'id', j.id, 'city_slug', j.wave, 'total', j.total, 'done', j.done,
    'succeeded', j.succeeded, 'failed', j.failed, 'started_at', j.started_at,
    'current_label', j.report->>'current_label',
    'created_by', j.created_by
  ) INTO _out
  FROM public.seo_generation_jobs j
  WHERE j.mode = 'city' AND j.status = 'running'
    AND coalesce(j.heartbeat_at, j.started_at) > now() - interval '3 minutes'
  ORDER BY j.started_at DESC LIMIT 1;
  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_active_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_active_run() TO authenticated, service_role;

-- Abandon explicite d'un run de ville (fermeture de page, annulation).
CREATE OR REPLACE FUNCTION public.seo_city_run_abandon(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.seo_generation_jobs
  SET status = 'aborted', finished_at = now(), updated_at = now()
  WHERE id = _job_id AND mode = 'city' AND status = 'running';
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_run_abandon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_run_abandon(uuid) TO authenticated, service_role;

-- Vue d'ensemble : ajoute la ville réellement en cours (job vivant) et sa progression.
CREATE OR REPLACE FUNCTION public.seo_city_generation_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rows jsonb; _live jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  _live := public.seo_city_active_run();

  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug)
      g.seo_city_slug AS slug, c.name, c.region, coalesce(g.request_count,0) AS request_count
    FROM public.geo_territories g
    JOIN public.seo_cities c ON c.slug = g.seo_city_slug AND c.active = true
    WHERE g.type = 'municipalite' AND g.status = 'active' AND g.seo_city_slug IS NOT NULL
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ), slots AS (
    SELECT * FROM public.seo_city_slots_expected(NULL)
  ), joined AS (
    SELECT s.city_slug, s.kind, s.material_slug, s.service_slug,
      p.id AS page_id, p.status, p.noindex, p.slug AS page_slug,
      p.meta_title, p.title, p.meta_description, p.h1, p.word_count, p.internal_link_count,
      p.content_html, p.faq, p.last_generated_at,
      p.city_slug AS page_city, p.material_slug AS page_material, p.service_slug AS page_service,
      (SELECT count(*) FROM public.seo_pages d WHERE d.slug = p.slug) AS slug_copies,
      t.status AS task_status
    FROM slots s
    LEFT JOIN LATERAL (
      SELECT * FROM public.seo_pages p
      WHERE p.city_slug = s.city_slug
        AND p.material_slug IS NOT DISTINCT FROM s.material_slug
        AND p.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY p.updated_at DESC NULLS LAST LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT * FROM public.seo_page_tasks t
      WHERE t.city_slug = s.city_slug
        AND t.material_slug IS NOT DISTINCT FROM s.material_slug
        AND t.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY t.updated_at DESC LIMIT 1
    ) t ON true
  ), flagged AS (
    SELECT j.*,
      (j.page_id IS NOT NULL AND (
        j.page_city IS DISTINCT FROM j.city_slug
        OR j.page_material IS DISTINCT FROM j.material_slug
        OR j.page_service IS DISTINCT FROM j.service_slug
        OR j.page_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        OR length(coalesce(nullif(j.meta_title,''), j.title, '')) < 30
        OR coalesce(j.h1,'') = ''
        OR length(coalesce(j.meta_description,'')) < 70
        OR coalesce(j.word_count,0) < 300
        OR coalesce(jsonb_array_length(coalesce(j.faq,'[]'::jsonb)),0) = 0
        OR coalesce(j.internal_link_count,0) < 2
        OR NOT (coalesce(j.content_html,'') ILIKE '%soumission%' OR coalesce(j.content_html,'') ILIKE '%contact%')
        OR coalesce(j.slug_copies,1) > 1
        OR (j.status = 'published' AND coalesce(j.noindex,false))
      )) AS is_invalid
    FROM joined j
  ), agg AS (
    SELECT f.city_slug,
      count(*)::int AS expected,
      count(*) FILTER (WHERE f.page_id IS NOT NULL)::int AS existing,
      count(*) FILTER (WHERE f.page_id IS NOT NULL AND NOT f.is_invalid)::int AS valid,
      count(*) FILTER (WHERE f.status = 'published')::int AS published,
      count(*) FILTER (WHERE f.page_id IS NOT NULL AND f.status <> 'published')::int AS drafts,
      count(*) FILTER (WHERE f.page_id IS NULL AND coalesce(f.task_status,'') NOT IN ('queued','running'))::int AS missing,
      count(*) FILTER (WHERE f.page_id IS NULL AND f.task_status IN ('queued','running'))::int AS pending,
      count(*) FILTER (WHERE (f.page_id IS NULL AND f.task_status IN ('failed','needs_retry')) OR f.is_invalid)::int AS errors,
      max(f.last_generated_at) AS last_generated_at
    FROM flagged f GROUP BY f.city_slug
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug', r.slug, 'name', r.name, 'region', r.region, 'request_count', r.request_count,
    'expected', coalesce(a.expected,0), 'existing', coalesce(a.existing,0),
    'valid', coalesce(a.valid,0),
    'published', coalesce(a.published,0), 'drafts', coalesce(a.drafts,0),
    'missing', coalesce(a.missing,0), 'pending', coalesce(a.pending,0),
    'errors', coalesce(a.errors,0), 'last_generated_at', a.last_generated_at,
    'run_total', CASE WHEN _live->>'city_slug' = r.slug THEN (_live->>'total')::int END,
    'run_done', CASE WHEN _live->>'city_slug' = r.slug THEN (_live->>'done')::int END,
    'run_label', CASE WHEN _live->>'city_slug' = r.slug THEN _live->>'current_label' END,
    'status', CASE
      WHEN _live->>'city_slug' = r.slug THEN 'running'
      WHEN coalesce(a.pending,0) > 0 THEN 'running'
      WHEN coalesce(a.errors,0) > 0 THEN 'errors'
      WHEN coalesce(a.expected,0) > 0 AND coalesce(a.missing,0) = 0 THEN 'done'
      WHEN coalesce(a.existing,0) > 0 THEN 'partial'
      ELSE 'pending_start' END
  ) ORDER BY r.name), '[]'::jsonb) INTO _rows
  FROM registry r LEFT JOIN agg a ON a.city_slug = r.slug;

  RETURN jsonb_build_object(
    'cities', _rows,
    'computed_at', now(),
    'active_run', _live,
    'totals', jsonb_build_object(
      'cities', jsonb_array_length(_rows),
      'done', (SELECT count(*) FROM jsonb_array_elements(_rows) e WHERE e->>'status' = 'done'),
      'partial', (SELECT count(*) FROM jsonb_array_elements(_rows) e WHERE e->>'status' = 'partial'),
      'errors', (SELECT count(*) FROM jsonb_array_elements(_rows) e WHERE e->>'status' = 'errors'),
      'running', (SELECT count(*) FROM jsonb_array_elements(_rows) e WHERE e->>'status' = 'running'),
      'waiting', (SELECT count(*) FROM jsonb_array_elements(_rows) e WHERE e->>'status' = 'pending_start')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_generation_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_generation_overview() TO authenticated, service_role;