CREATE OR REPLACE FUNCTION public.seo_city_is_generable(_city_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.geo_territories g
    JOIN public.seo_cities c ON c.slug = g.seo_city_slug
    WHERE g.type = 'municipalite'
      AND g.status = 'active'
      AND c.active = true
      AND c.slug = _city_slug
  )
$$;

REVOKE ALL ON FUNCTION public.seo_city_is_generable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_is_generable(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_generator_catalog()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _cities jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug)
      g.id AS territory_id, g.seo_city_slug AS slug, c.id AS seo_city_id,
      c.name, c.region, c.population, c.sort_order,
      coalesce(g.request_count, 0) AS request_count
    FROM public.geo_territories g
    JOIN public.seo_cities c ON c.slug = g.seo_city_slug AND c.active = true
    WHERE g.type = 'municipalite' AND g.status = 'active' AND g.seo_city_slug IS NOT NULL
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ), raw_materials AS (
    SELECT r.slug AS city_slug, public.seo_slugify(x.material) AS material_term, count(*)::int AS requests
    FROM registry r
    JOIN public.submissions s ON s.territory_id = r.territory_id
    CROSS JOIN LATERAL unnest(coalesce(s.materials, '{}'::text[])) AS x(material)
    WHERE nullif(btrim(x.material), '') IS NOT NULL
      AND public.seo_slugify(x.material) <> 'je-ne-suis-pas-certain'
    GROUP BY r.slug, public.seo_slugify(x.material)
  ), material_signals AS (
    SELECT rm.city_slug, m.slug, m.name, sum(rm.requests)::int AS requests
    FROM raw_materials rm
    JOIN public.seo_materials m ON m.active = true AND (
      public.seo_slugify(m.name) = rm.material_term
      OR EXISTS (SELECT 1 FROM unnest(coalesce(m.keywords, '{}'::text[])) k WHERE public.seo_slugify(k) = rm.material_term)
    )
    GROUP BY rm.city_slug, m.slug, m.name
  ), service_signals AS (
    SELECT r.slug AS city_slug, ss.seo_slug AS slug, ss.name,
           sum(gts.request_count)::int AS requests,
           max(gts.status) AS availability
    FROM registry r
    JOIN public.geo_territory_services gts ON gts.territory_id = r.territory_id
    JOIN LATERAL (
      SELECT s.slug AS seo_slug, s.name
      FROM public.seo_services s
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
    GROUP BY r.slug, ss.seo_slug, ss.name
  ), page_stats AS (
    SELECT p.city_slug,
      count(*)::int AS pages_total,
      count(*) FILTER (WHERE p.status = 'published')::int AS pages_published,
      count(*) FILTER (WHERE p.status = 'draft')::int AS pages_draft,
      count(*) FILTER (WHERE p.status IN ('needs_review','rejected') OR coalesce(p.qa_last_score,100) < 80)::int AS pages_review
    FROM public.seo_pages p GROUP BY p.city_slug
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.seo_city_id, 'slug', r.slug, 'name', r.name, 'region', r.region,
    'population', r.population, 'sort_order', r.sort_order, 'request_count', r.request_count,
    'pages_total', coalesce(ps.pages_total,0), 'pages_published', coalesce(ps.pages_published,0),
    'pages_draft', coalesce(ps.pages_draft,0), 'pages_review', coalesce(ps.pages_review,0),
    'status', CASE WHEN coalesce(ps.pages_review,0) > 0 THEN 'needs_review'
                   WHEN coalesce(ps.pages_draft,0) > 0 THEN 'draft'
                   WHEN coalesce(ps.pages_published,0) > 0 THEN 'existing'
                   WHEN r.request_count > 0 THEN 'to_create'
                   ELSE 'no_opportunity' END,
    'services', coalesce((SELECT jsonb_agg(jsonb_build_object('slug',s.slug,'name',s.name,'requests',s.requests,'availability',s.availability) ORDER BY s.requests DESC,s.name) FROM service_signals s WHERE s.city_slug=r.slug), '[]'::jsonb),
    'materials', coalesce((SELECT jsonb_agg(jsonb_build_object('slug',m.slug,'name',m.name,'requests',m.requests) ORDER BY m.requests DESC,m.name) FROM material_signals m WHERE m.city_slug=r.slug), '[]'::jsonb)
  ) ORDER BY r.name), '[]'::jsonb) INTO _cities
  FROM registry r LEFT JOIN page_stats ps ON ps.city_slug=r.slug;

  RETURN jsonb_build_object(
    'cities', _cities,
    'crm_active', (SELECT count(*) FROM public.geo_territories WHERE type='municipalite' AND status='active'),
    'generable', jsonb_array_length(_cities),
    'historical_retained', (SELECT count(*) FROM public.seo_cities c WHERE NOT public.seo_city_is_generable(c.slug)),
    'computed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seo_generator_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_generator_catalog() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_pipeline_start(_mode text DEFAULT 'selected_cities'::text, _city_slugs text[] DEFAULT NULL::text[], _qa_threshold integer DEFAULT 90, _force_regenerate boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _run_id uuid; _slugs text[]; _uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(_uid, 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  IF EXISTS (SELECT 1 FROM public.seo_pipeline_runs WHERE status IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Un lancement est déjà en cours. Arrêtez-le avant d''en démarrer un autre.';
  END IF;
  IF _city_slugs IS NULL OR array_length(_city_slugs,1) IS NULL THEN
    RAISE EXCEPTION 'Sélectionnez explicitement au moins une municipalité active du registre CRM';
  END IF;
  SELECT array_agg(DISTINCT c.slug ORDER BY c.slug) INTO _slugs
  FROM public.seo_cities c
  WHERE c.slug = ANY(_city_slugs) AND public.seo_city_is_generable(c.slug);
  IF coalesce(array_length(_slugs,1),0) <> array_length(_city_slugs,1) THEN
    RAISE EXCEPTION 'La sélection contient une ville inactive, historique ou absente du registre CRM';
  END IF;
  INSERT INTO public.seo_pipeline_runs(mode,status,city_slugs,qa_threshold,force_regenerate,created_by,started_at,last_progress_at)
  VALUES (_mode,'queued',_slugs,coalesce(_qa_threshold,90),coalesce(_force_regenerate,false),_uid,now(),now()) RETURNING id INTO _run_id;
  INSERT INTO public.seo_city_batches(run_id,city_slug,sort_order,status)
  SELECT _run_id,s,ord,'queued' FROM unnest(_slugs) WITH ORDINALITY AS t(s,ord);
  RETURN _run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_slot_rows(_city_slug text DEFAULT NULL)
RETURNS TABLE(city_slug text, city_name text, kind text, material_slug text, service_slug text, label text, page_id uuid, page_slug text, title text, page_status text, published_at timestamptz, word_count int, seo_score int, last_generated_at timestamptz, issues text[], gen_state text, pub_state text, task_status text, task_step text, task_attempts int, task_error text, task_updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cities AS (
    SELECT c.slug,c.name FROM seo_cities c WHERE c.active AND public.seo_city_is_generable(c.slug) AND (_city_slug IS NULL OR c.slug=_city_slug)
  ), slots AS (
    SELECT 'hub'::text kind,NULL::text material_slug,NULL::text service_slug,'Page ville (hub)'::text label
    UNION ALL SELECT 'material',m.slug,NULL::text,m.name FROM seo_materials m WHERE m.active
    UNION ALL SELECT 'service',NULL::text,s.slug,s.name FROM seo_services s WHERE s.active
  ), grid AS (
    SELECT c.slug city_slug,c.name city_name,s.kind,s.material_slug,s.service_slug,s.label FROM cities c CROSS JOIN slots s
  ), withpage AS (
    SELECT g.*,p.id page_id,p.slug page_slug,p.title,p.status page_status,p.published_at,p.word_count,p.seo_score,p.last_generated_at,p.meta_title,p.meta_description,p.h1,p.content_html
    FROM grid g LEFT JOIN LATERAL (
      SELECT * FROM seo_pages p WHERE p.city_slug=g.city_slug AND p.material_slug IS NOT DISTINCT FROM g.material_slug AND p.service_slug IS NOT DISTINCT FROM g.service_slug ORDER BY p.updated_at DESC NULLS LAST LIMIT 1
    ) p ON true
  ), withtask AS (
    SELECT w.*,t.status task_status,t.step task_step,t.attempts task_attempts,t.last_error task_error,t.updated_at task_updated_at
    FROM withpage w LEFT JOIN LATERAL (
      SELECT * FROM seo_page_tasks t WHERE t.city_slug=w.city_slug AND t.material_slug IS NOT DISTINCT FROM w.material_slug AND t.service_slug IS NOT DISTINCT FROM w.service_slug ORDER BY t.updated_at DESC LIMIT 1
    ) t ON true
  )
  SELECT w.city_slug,w.city_name,w.kind,w.material_slug,w.service_slug,w.label,w.page_id,w.page_slug,w.title,w.page_status,w.published_at,w.word_count,w.seo_score,w.last_generated_at,v.issues,
    CASE WHEN w.page_id IS NULL THEN CASE WHEN w.task_status IN ('failed','needs_retry') THEN 'error' WHEN w.task_status IN ('queued','running') THEN 'pending' ELSE 'missing' END WHEN coalesce(array_length(v.issues,1),0)>0 THEN 'invalid' ELSE 'ok' END,
    CASE WHEN w.page_id IS NULL THEN 'na' WHEN w.page_status='published' OR w.published_at IS NOT NULL THEN 'published' ELSE 'unpublished' END,
    w.task_status,w.task_step,w.task_attempts,w.task_error,w.task_updated_at
  FROM withtask w CROSS JOIN LATERAL (
    SELECT CASE WHEN w.page_id IS NULL THEN '{}'::text[] ELSE public.seo_validate_page_fields(w.meta_title,w.meta_description,w.h1,w.content_html,w.page_slug,w.city_slug,(SELECT count(*) FROM seo_pages d WHERE d.slug=w.page_slug)>1) END issues
  ) v;
$$;

REVOKE ALL ON FUNCTION public.seo_slot_rows(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_slot_rows(text) TO service_role;