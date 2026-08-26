-- 1. Validation helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.seo_validate_page_fields(
  _meta_title text, _meta_description text, _h1 text,
  _content_html text, _slug text, _city_slug text, _dupe boolean
) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN nullif(btrim(coalesce(_meta_title,'')),'') IS NULL THEN 'Titre SEO manquant' END,
    CASE WHEN length(coalesce(_meta_description,'')) < 80 THEN 'Meta description manquante ou trop courte (< 80 caractères)' END,
    CASE WHEN nullif(btrim(coalesce(_h1,'')),'') IS NULL THEN 'H1 manquant' END,
    CASE WHEN length(coalesce(_content_html,'')) < 500 THEN 'Contenu manquant ou trop court' END,
    CASE WHEN nullif(btrim(coalesce(_slug,'')),'') IS NULL OR _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN 'Slug / URL invalide' END,
    CASE WHEN nullif(btrim(coalesce(_city_slug,'')),'') IS NULL THEN 'Ville manquante' END,
    CASE WHEN _dupe THEN 'URL dupliquée' END
  ], NULL);
$$;

-- 2. Etat réel de chaque emplacement prévu ------------------------------
CREATE OR REPLACE FUNCTION public.seo_slot_rows(_city_slug text DEFAULT NULL)
RETURNS TABLE(
  city_slug text, city_name text, kind text, material_slug text, service_slug text, label text,
  page_id uuid, page_slug text, title text, page_status text, published_at timestamptz,
  word_count int, seo_score int, last_generated_at timestamptz,
  issues text[], gen_state text, pub_state text,
  task_status text, task_step text, task_attempts int, task_error text, task_updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cities AS (
    SELECT c.slug, c.name FROM seo_cities c
     WHERE c.active AND c.served AND (_city_slug IS NULL OR c.slug = _city_slug)
  ),
  slots AS (
    SELECT 'hub'::text AS kind, NULL::text AS material_slug, NULL::text AS service_slug, 'Page ville (hub)'::text AS label
    UNION ALL SELECT 'material', m.slug, NULL::text, m.name FROM seo_materials m WHERE m.active
    UNION ALL SELECT 'service', NULL::text, s.slug, s.name FROM seo_services s WHERE s.active
  ),
  grid AS (SELECT c.slug AS city_slug, c.name AS city_name, s.kind, s.material_slug, s.service_slug, s.label
             FROM cities c CROSS JOIN slots s),
  withpage AS (
    SELECT g.*, p.id AS page_id, p.slug AS page_slug, p.title, p.status AS page_status, p.published_at,
           p.word_count, p.seo_score, p.last_generated_at,
           p.meta_title, p.meta_description, p.h1, p.content_html
      FROM grid g
      LEFT JOIN LATERAL (
        SELECT * FROM seo_pages p
         WHERE p.city_slug = g.city_slug
           AND coalesce(p.material_slug,'') = coalesce(g.material_slug,'')
           AND coalesce(p.service_slug,'') = coalesce(g.service_slug,'')
         ORDER BY p.updated_at DESC NULLS LAST LIMIT 1
      ) p ON TRUE
  ),
  withtask AS (
    SELECT w.*, t.status AS task_status, t.step AS task_step, t.attempts AS task_attempts,
           t.last_error AS task_error, t.updated_at AS task_updated_at
      FROM withpage w
      LEFT JOIN LATERAL (
        SELECT * FROM seo_page_tasks t
         WHERE t.city_slug = w.city_slug
           AND coalesce(t.material_slug,'') = coalesce(w.material_slug,'')
           AND coalesce(t.service_slug,'') = coalesce(w.service_slug,'')
         ORDER BY t.updated_at DESC LIMIT 1
      ) t ON TRUE
  )
  SELECT w.city_slug, w.city_name, w.kind, w.material_slug, w.service_slug, w.label,
         w.page_id, w.page_slug, w.title, w.page_status, w.published_at,
         w.word_count, w.seo_score, w.last_generated_at,
         v.issues,
         CASE
           WHEN w.page_id IS NULL THEN
             CASE WHEN w.task_status IN ('failed','needs_retry') THEN 'error'
                  WHEN w.task_status IN ('queued','running') THEN 'pending'
                  ELSE 'missing' END
           WHEN coalesce(array_length(v.issues,1),0) > 0 THEN 'invalid'
           ELSE 'ok' END AS gen_state,
         CASE WHEN w.page_id IS NULL THEN 'na'
              WHEN w.page_status = 'published' OR w.published_at IS NOT NULL THEN 'published'
              ELSE 'unpublished' END AS pub_state,
         w.task_status, w.task_step, w.task_attempts, w.task_error, w.task_updated_at
    FROM withtask w
    CROSS JOIN LATERAL (
      SELECT CASE WHEN w.page_id IS NULL THEN '{}'::text[]
             ELSE public.seo_validate_page_fields(
                    w.meta_title, w.meta_description, w.h1, w.content_html, w.page_slug, w.city_slug,
                    (SELECT count(*) FROM seo_pages d WHERE d.slug = w.page_slug) > 1)
             END AS issues
    ) v;
$$;

REVOKE ALL ON FUNCTION public.seo_slot_rows(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_slot_rows(text) TO service_role;

-- 3. Matrice détaillée d'une ville (admin) ------------------------------
CREATE OR REPLACE FUNCTION public.seo_city_matrix(_city_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _rows jsonb; _sum jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY (r.kind <> 'hub'), r.label), '[]'::jsonb)
    INTO _rows FROM public.seo_slot_rows(_city_slug) r;

  SELECT jsonb_build_object(
      'planned', count(*),
      'generated', count(*) FILTER (WHERE r.page_id IS NOT NULL),
      'published', count(*) FILTER (WHERE r.pub_state = 'published'),
      'remaining', count(*) FILTER (WHERE r.page_id IS NULL),
      'errors', count(*) FILTER (WHERE r.gen_state IN ('error','invalid')),
      'invalid', count(*) FILTER (WHERE r.gen_state = 'invalid'),
      'unpublished', count(*) FILTER (WHERE r.pub_state = 'unpublished' AND r.gen_state = 'ok')
    ) INTO _sum FROM public.seo_slot_rows(_city_slug) r;

  RETURN jsonb_build_object('city_slug', _city_slug, 'summary', _sum, 'slots', _rows, 'computed_at', now());
END $$;

-- 4. Centre de pilotage : compteurs basés sur l'état réel ---------------
CREATE OR REPLACE FUNCTION public.seo_control_center()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _per_city int; _cities int; _totals jsonb; _rows jsonb; _run jsonb; _queued int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT (SELECT COUNT(*) FROM seo_materials WHERE active)
       + (SELECT COUNT(*) FROM seo_services WHERE active) + 1 INTO _per_city;
  SELECT COUNT(*) FROM seo_cities WHERE active AND served INTO _cities;

  WITH s AS (SELECT * FROM public.seo_slot_rows(NULL)),
  per_city AS (
    SELECT s.city_slug AS slug, min(s.city_name) AS name,
           count(*)::int AS planned,
           count(*) FILTER (WHERE s.page_id IS NOT NULL)::int AS generated,
           count(*) FILTER (WHERE s.pub_state = 'published')::int AS published,
           count(*) FILTER (WHERE s.page_id IS NULL)::int AS remaining,
           count(*) FILTER (WHERE s.gen_state IN ('error','invalid'))::int AS errors,
           count(*) FILTER (WHERE s.gen_state = 'invalid')::int AS invalid,
           count(*) FILTER (WHERE s.gen_state = 'pending')::int AS pending,
           count(*) FILTER (WHERE s.pub_state = 'unpublished' AND s.gen_state = 'ok')::int AS unpublished
      FROM s GROUP BY s.city_slug
  )
  SELECT
    jsonb_build_object(
      'per_city', _per_city, 'cities', _cities,
      'target_total', coalesce(sum(planned),0),
      'generated', coalesce(sum(generated),0),
      'published', coalesce(sum(published),0),
      'drafts', coalesce(sum(unpublished),0),
      'errors', coalesce(sum(errors),0),
      'remaining', coalesce(sum(remaining),0)
    ),
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', slug, 'name', name, 'planned', planned, 'generated', generated,
      'published', published, 'remaining', remaining, 'errors', errors,
      'invalid', invalid, 'pending', pending, 'unpublished', unpublished,
      'pct', CASE WHEN planned > 0 THEN LEAST(100, ROUND(published::numeric * 100 / planned))::int ELSE 0 END,
      'status', CASE
        WHEN pending > 0 THEN 'running'
        WHEN generated = 0 AND errors > 0 THEN 'error'
        WHEN generated = 0 THEN 'todo'
        WHEN generated >= planned AND published >= planned AND errors = 0 THEN 'done'
        ELSE 'partial' END
    ) ORDER BY name), '[]'::jsonb)
  INTO _totals, _rows FROM per_city;

  SELECT to_jsonb(r.*) INTO _run FROM seo_pipeline_runs r
   WHERE r.status IN ('queued','running','paused') ORDER BY r.created_at DESC LIMIT 1;

  SELECT COUNT(*)::int INTO _queued FROM seo_page_tasks WHERE status IN ('queued','running');

  RETURN jsonb_build_object('computed_at', now(), 'totals', _totals, 'cities', _rows,
                            'active_run', _run, 'queued_tasks', _queued);
END $$;

-- 5. Publication ciblée --------------------------------------------------
CREATE OR REPLACE FUNCTION public.seo_page_publish(_page_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p seo_pages; _issues text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  SELECT * INTO _p FROM seo_pages WHERE id = _page_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Page introuvable']); END IF;
  _issues := public.seo_validate_page_fields(_p.meta_title, _p.meta_description, _p.h1, _p.content_html,
              _p.slug, _p.city_slug, (SELECT count(*) FROM seo_pages d WHERE d.slug = _p.slug) > 1);
  IF coalesce(array_length(_issues,1),0) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'issues', _issues);
  END IF;
  UPDATE seo_pages SET status='published', published_at = coalesce(published_at, now()), updated_at = now()
   WHERE id = _page_id;
  RETURN jsonb_build_object('ok', true, 'issues', '[]'::jsonb);
END $$;

DROP FUNCTION IF EXISTS public.seo_city_publish_missing(text);
CREATE OR REPLACE FUNCTION public.seo_city_publish_missing(_city_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _skipped int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  SELECT count(*)::int INTO _skipped FROM public.seo_slot_rows(_city_slug)
   WHERE gen_state = 'invalid' AND pub_state = 'unpublished';
  WITH targets AS (
    SELECT page_id FROM public.seo_slot_rows(_city_slug)
     WHERE gen_state = 'ok' AND pub_state = 'unpublished'
  ), upd AS (
    UPDATE seo_pages p SET status='published', published_at = coalesce(p.published_at, now()), updated_at = now()
     WHERE p.id IN (SELECT page_id FROM targets) RETURNING 1
  ) SELECT count(*)::int INTO _n FROM upd;
  RETURN jsonb_build_object('published', _n, 'skipped_invalid', _skipped);
END $$;

-- 6. Edition manuelle d'une page ----------------------------------------
CREATE OR REPLACE FUNCTION public.seo_page_save(_page_id uuid, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p seo_pages; _issues text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE seo_pages p SET
    title            = coalesce(nullif(_patch->>'title',''), p.title),
    meta_title       = coalesce(nullif(_patch->>'meta_title',''), p.meta_title),
    meta_description = coalesce(nullif(_patch->>'meta_description',''), p.meta_description),
    h1               = coalesce(nullif(_patch->>'h1',''), p.h1),
    intro            = coalesce(nullif(_patch->>'intro',''), p.intro),
    content_html     = coalesce(nullif(_patch->>'content_html',''), p.content_html),
    slug             = coalesce(nullif(_patch->>'slug',''), p.slug),
    word_count       = CASE WHEN nullif(_patch->>'content_html','') IS NOT NULL
                            THEN array_length(regexp_split_to_array(btrim(regexp_replace(_patch->>'content_html','<[^>]+>',' ','g')), '\s+'), 1)
                            ELSE p.word_count END,
    updated_at = now()
   WHERE p.id = _page_id
   RETURNING * INTO _p;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Page introuvable']); END IF;
  _issues := public.seo_validate_page_fields(_p.meta_title, _p.meta_description, _p.h1, _p.content_html,
              _p.slug, _p.city_slug, (SELECT count(*) FROM seo_pages d WHERE d.slug = _p.slug) > 1);
  RETURN jsonb_build_object('ok', true, 'issues', to_jsonb(_issues), 'page', to_jsonb(_p));
END $$;
