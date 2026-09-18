CREATE OR REPLACE FUNCTION public.seo_city_slots_expected(_city_slug text DEFAULT NULL)
RETURNS TABLE(city_slug text, city_name text, kind text, material_slug text, service_slug text, label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug)
      g.id AS territory_id, g.seo_city_slug AS slug, c.name
    FROM public.geo_territories g
    JOIN public.seo_cities c ON c.slug = g.seo_city_slug AND c.active = true
    WHERE g.type = 'municipalite' AND g.status = 'active' AND g.seo_city_slug IS NOT NULL
      AND (_city_slug IS NULL OR g.seo_city_slug = _city_slug)
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ), raw_materials AS (
    SELECT r.slug AS city_slug, public.seo_slugify(x.material) AS term
    FROM registry r
    JOIN public.submissions s ON s.territory_id = r.territory_id
    CROSS JOIN LATERAL unnest(coalesce(s.materials, '{}'::text[])) AS x(material)
    WHERE nullif(btrim(x.material), '') IS NOT NULL
      AND public.seo_slugify(x.material) <> 'je-ne-suis-pas-certain'
  ), material_slots AS (
    SELECT DISTINCT rm.city_slug, m.slug, m.name
    FROM raw_materials rm
    JOIN public.seo_materials m ON m.active = true AND (
      public.seo_slugify(m.name) = rm.term
      OR EXISTS (SELECT 1 FROM unnest(coalesce(m.keywords, '{}'::text[])) k WHERE public.seo_slugify(k) = rm.term)
    )
  ), service_slots AS (
    SELECT DISTINCT r.slug AS city_slug, ss.slug, ss.name
    FROM registry r
    JOIN public.geo_territory_services gts ON gts.territory_id = r.territory_id
    JOIN LATERAL (
      SELECT s.slug, s.name FROM public.seo_services s
      WHERE s.active = true AND s.slug = CASE gts.service_key
        WHEN 'recherche_dompe' THEN 'dompe'
        WHEN 'point_de_depot' THEN 'recherche-point-de-depot'
        WHEN 'disposition_remblai' THEN 'recherche-point-de-depot'
        WHEN 'transport' THEN 'transport-vrac'
        WHEN 'courtage_materiaux' THEN 'courtage-materiaux'
        ELSE replace(gts.service_key, '_', '-')
      END
    ) ss ON true
    WHERE gts.status IN ('ACTIVE', 'PARTIELLE') AND gts.request_count > 0
  ), existing_slots AS (
    SELECT DISTINCT r.slug AS city_slug,
      CASE WHEN p.material_slug IS NOT NULL THEN 'material'
           WHEN p.service_slug IS NOT NULL THEN 'service' ELSE 'hub' END AS kind,
      p.material_slug, p.service_slug
    FROM registry r JOIN public.seo_pages p ON p.city_slug = r.slug
  ), all_slots AS (
    SELECT r.slug AS city_slug, 'hub'::text AS kind, NULL::text AS material_slug, NULL::text AS service_slug FROM registry r
    UNION
    SELECT ms.city_slug, 'material', ms.slug, NULL FROM material_slots ms
    UNION
    SELECT sv.city_slug, 'service', NULL, sv.slug FROM service_slots sv
    UNION
    SELECT es.city_slug, es.kind, es.material_slug, es.service_slug FROM existing_slots es
  )
  SELECT a.city_slug, r.name, a.kind, a.material_slug, a.service_slug,
    CASE a.kind
      WHEN 'hub' THEN 'Page ville (hub)'
      WHEN 'material' THEN coalesce((SELECT m.name FROM public.seo_materials m WHERE m.slug = a.material_slug), a.material_slug)
      ELSE coalesce((SELECT s.name FROM public.seo_services s WHERE s.slug = a.service_slug), a.service_slug)
    END
  FROM all_slots a JOIN registry r ON r.slug = a.city_slug
$$;

REVOKE ALL ON FUNCTION public.seo_city_slots_expected(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_slots_expected(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_city_generation_report(_city_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _slots jsonb; _name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT c.name INTO _name FROM public.seo_cities c WHERE c.slug = _city_slug;

  WITH slots AS (
    SELECT * FROM public.seo_city_slots_expected(_city_slug)
  ), joined AS (
    SELECT s.city_slug, s.kind, s.material_slug, s.service_slug, s.label,
           p.id AS page_id, p.slug AS page_slug, p.status, p.noindex, p.meta_title, p.title,
           p.meta_description, p.h1, p.word_count, p.internal_link_count, p.content_html,
           p.faq, p.seo_score, p.qa_last_score, p.last_generated_at, p.published_at,
           p.city_slug AS page_city, p.material_slug AS page_material, p.service_slug AS page_service,
           t.status AS task_status, t.last_error AS task_error, t.attempts AS task_attempts,
           (SELECT count(*) FROM public.seo_pages d WHERE d.slug = p.slug) AS slug_copies
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
  ), checked AS (
    SELECT j.*,
      array_remove(ARRAY[
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_city = j.city_slug THEN NULL ELSE 'Relation ville incorrecte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_material IS NOT DISTINCT FROM j.material_slug THEN NULL ELSE 'Relation matériau incorrecte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_service IS NOT DISTINCT FROM j.service_slug THEN NULL ELSE 'Relation service incorrecte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN NULL ELSE 'URL invalide' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN length(coalesce(nullif(j.meta_title,''), j.title, '')) >= 30 THEN NULL ELSE 'Title trop court' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.h1,'') <> '' THEN NULL ELSE 'H1 manquant' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN length(coalesce(j.meta_description,'')) >= 70 THEN NULL ELSE 'Meta description trop courte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN NOT (j.status = 'published' AND coalesce(j.noindex,false)) THEN NULL ELSE 'Publiée mais noindex' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.word_count,0) >= 300 THEN NULL ELSE 'Contenu insuffisant' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(jsonb_array_length(coalesce(j.faq,'[]'::jsonb)),0) > 0 THEN NULL ELSE 'FAQ absente' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.internal_link_count,0) >= 2 THEN NULL ELSE 'Liens internes insuffisants' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.content_html,'') ILIKE '%soumission%' OR coalesce(j.content_html,'') ILIKE '%contact%' THEN NULL ELSE 'CTA absent' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.slug_copies,1) <= 1 THEN NULL ELSE 'URL en doublon' END,
        CASE WHEN j.page_id IS NULL AND j.task_status IN ('failed','needs_retry') THEN coalesce('Échec de génération : ' || j.task_error, 'Échec de génération') ELSE NULL END
      ], NULL) AS problems
    FROM joined j
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kind', c.kind, 'material_slug', c.material_slug, 'service_slug', c.service_slug, 'label', c.label,
    'page_id', c.page_id, 'page_slug', c.page_slug, 'status', c.status, 'noindex', coalesce(c.noindex,false),
    'seo_score', c.seo_score, 'qa_score', c.qa_last_score, 'word_count', c.word_count,
    'internal_link_count', c.internal_link_count, 'last_generated_at', c.last_generated_at,
    'task_status', c.task_status, 'task_error', c.task_error, 'task_attempts', c.task_attempts,
    'problems', to_jsonb(c.problems),
    'state', CASE WHEN c.page_id IS NULL AND c.task_status IN ('queued','running') THEN 'pending'
                  WHEN c.page_id IS NULL AND c.task_status IN ('failed','needs_retry') THEN 'error'
                  WHEN c.page_id IS NULL THEN 'missing'
                  WHEN coalesce(array_length(c.problems,1),0) > 0 THEN 'invalid'
                  WHEN c.status = 'published' THEN 'published'
                  ELSE 'draft' END
  ) ORDER BY c.kind, c.label), '[]'::jsonb) INTO _slots FROM checked c;

  RETURN jsonb_build_object(
    'city_slug', _city_slug,
    'city_name', _name,
    'computed_at', now(),
    'slots', _slots,
    'summary', jsonb_build_object(
      'expected', jsonb_array_length(_slots),
      'existing', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'page_id' IS NOT NULL),
      'published', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'status' = 'published'),
      'drafts', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'page_id' IS NOT NULL AND coalesce(e->>'status','') <> 'published'),
      'missing', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'state' = 'missing'),
      'pending', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'state' = 'pending'),
      'errors', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'state' IN ('error','invalid'))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_generation_report(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_generation_report(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_city_generation_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rows jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

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
      p.last_generated_at, t.status AS task_status
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
  ), agg AS (
    SELECT j.city_slug,
      count(*)::int AS expected,
      count(*) FILTER (WHERE j.page_id IS NOT NULL)::int AS existing,
      count(*) FILTER (WHERE j.status = 'published')::int AS published,
      count(*) FILTER (WHERE j.page_id IS NOT NULL AND j.status <> 'published')::int AS drafts,
      count(*) FILTER (WHERE j.page_id IS NULL AND coalesce(j.task_status,'') NOT IN ('queued','running'))::int AS missing,
      count(*) FILTER (WHERE j.page_id IS NULL AND j.task_status IN ('queued','running'))::int AS pending,
      count(*) FILTER (WHERE
        (j.page_id IS NULL AND j.task_status IN ('failed','needs_retry'))
        OR (j.page_id IS NOT NULL AND (
          length(coalesce(nullif(j.meta_title,''), j.title, '')) < 30
          OR coalesce(j.h1,'') = ''
          OR length(coalesce(j.meta_description,'')) < 70
          OR coalesce(j.word_count,0) < 300
          OR coalesce(j.internal_link_count,0) < 2
          OR (j.status = 'published' AND coalesce(j.noindex,false))
        ))
      )::int AS errors,
      max(j.last_generated_at) AS last_generated_at
    FROM joined j GROUP BY j.city_slug
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug', r.slug, 'name', r.name, 'region', r.region, 'request_count', r.request_count,
    'expected', coalesce(a.expected,0), 'existing', coalesce(a.existing,0),
    'published', coalesce(a.published,0), 'drafts', coalesce(a.drafts,0),
    'missing', coalesce(a.missing,0), 'pending', coalesce(a.pending,0),
    'errors', coalesce(a.errors,0), 'last_generated_at', a.last_generated_at,
    'status', CASE
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

CREATE OR REPLACE FUNCTION public.seo_city_run_start(_city_slug text, _total integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  INSERT INTO public.seo_generation_jobs(status, mode, wave, total, done, succeeded, failed,
    combinations, created_by, started_at, last_progress_at, heartbeat_at, report)
  VALUES ('running', 'city', _city_slug, coalesce(_total,0), 0, 0, 0,
    '[]'::jsonb, auth.uid(), now(), now(), now(),
    jsonb_build_object('city_slug', _city_slug))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_run_start(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_run_start(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_city_run_finish(_job_id uuid, _created integer, _errors integer, _details jsonb DEFAULT '[]'::jsonb)
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
  SET status = CASE WHEN coalesce(_errors,0) > 0 THEN 'completed_with_errors' ELSE 'completed' END,
      done = coalesce(_created,0) + coalesce(_errors,0),
      succeeded = coalesce(_created,0),
      failed = coalesce(_errors,0),
      finished_at = now(), last_progress_at = now(), updated_at = now(),
      report = coalesce(report,'{}'::jsonb) || jsonb_build_object('details', _details)
  WHERE id = _job_id AND mode = 'city';
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_run_finish(uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_run_finish(uuid, integer, integer, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_city_run_history(_city_slug text, _limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', j.id, 'status', j.status, 'total', j.total, 'succeeded', j.succeeded,
    'failed', j.failed, 'started_at', j.started_at, 'finished_at', j.finished_at,
    'duration_seconds', CASE WHEN j.finished_at IS NOT NULL AND j.started_at IS NOT NULL
      THEN extract(epoch FROM (j.finished_at - j.started_at))::int ELSE NULL END,
    'created_by', j.created_by,
    'created_by_email', (SELECT u.email FROM auth.users u WHERE u.id = j.created_by)
  ) ORDER BY j.started_at DESC), '[]'::jsonb) INTO _out
  FROM (
    SELECT * FROM public.seo_generation_jobs
    WHERE mode = 'city' AND wave = _city_slug
    ORDER BY started_at DESC LIMIT coalesce(_limit,10)
  ) j;
  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.seo_city_run_history(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_run_history(text, integer) TO authenticated, service_role;