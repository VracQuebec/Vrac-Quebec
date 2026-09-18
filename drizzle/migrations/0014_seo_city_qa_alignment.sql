-- Alignement de la QA ville par ville : la vue d'ensemble applique exactement
-- les mêmes contrôles que le rapport détaillé (relations, FAQ, CTA, doublons)
-- et expose le nombre de pages valides. Aucune donnée n'est modifiée.

CREATE OR REPLACE FUNCTION public.seo_city_generation_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      p.content_html, p.faq, p.city_slug AS page_city, p.material_slug AS page_material,
      p.service_slug AS page_service,
      (SELECT count(*) FROM public.seo_pages d WHERE d.slug = p.slug) AS slug_copies,
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
      )) AS invalid
    FROM joined j
  ), agg AS (
    SELECT f.city_slug,
      count(*)::int AS expected,
      count(*) FILTER (WHERE f.page_id IS NOT NULL)::int AS existing,
      count(*) FILTER (WHERE f.page_id IS NOT NULL AND NOT f.invalid)::int AS valid,
      count(*) FILTER (WHERE f.status = 'published')::int AS published,
      count(*) FILTER (WHERE f.page_id IS NOT NULL AND f.status <> 'published')::int AS drafts,
      count(*) FILTER (WHERE f.page_id IS NULL AND coalesce(f.task_status,'') NOT IN ('queued','running'))::int AS missing,
      count(*) FILTER (WHERE f.page_id IS NULL AND f.task_status IN ('queued','running'))::int AS pending,
      count(*) FILTER (WHERE
        (f.page_id IS NULL AND f.task_status IN ('failed','needs_retry')) OR f.invalid
      )::int AS errors,
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
    'status', CASE
      WHEN coalesce(a.pending,0) > 0 THEN 'running'
      WHEN coalesce(a.errors,0) > 0 THEN 'errors'
      WHEN coalesce(a.expected,0) > 0 AND coalesce(a.missing,0) = 0
           AND coalesce(a.valid,0) = coalesce(a.expected,0) THEN 'done'
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
$function$;