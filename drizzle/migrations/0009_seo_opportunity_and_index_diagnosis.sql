CREATE OR REPLACE FUNCTION public.seo_opportunity_analysis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _cities jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug)
      g.id AS territory_id, g.seo_city_slug AS slug, c.name, c.region, c.population,
      coalesce(g.request_count, 0) AS request_count
    FROM public.geo_territories g
    JOIN public.seo_cities c ON c.slug = g.seo_city_slug AND c.active = true
    WHERE g.type = 'municipalite' AND g.status = 'active' AND g.seo_city_slug IS NOT NULL
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ), subs AS (
    SELECT r.slug AS city_slug, s.*
    FROM registry r JOIN public.submissions s ON s.territory_id = r.territory_id
  ), demand AS (
    SELECT city_slug,
      count(*)::int AS requests_total,
      count(*) FILTER (WHERE request_type = 'remblai' AND coalesce(deliver_or_remove,'') <> 'À sortir du chantier')::int AS requests_remblai,
      count(*) FILTER (WHERE service_type = 'remblai_disposition' OR deliver_or_remove = 'À sortir du chantier')::int AS requests_disposition,
      count(*) FILTER (WHERE deliver_or_remove = 'À sortir du chantier' OR dompe_number IS NOT NULL)::int AS requests_dompe,
      count(*) FILTER (WHERE request_type = 'livraison' OR deliver_or_remove = 'À livrer')::int AS requests_livraison,
      count(*) FILTER (WHERE request_type = 'vrac' OR service_type = 'vrac_achat')::int AS requests_vrac,
      count(*) FILTER (WHERE quote_trips IS NOT NULL OR quote_truck IS NOT NULL)::int AS requests_transport,
      count(*) FILTER (WHERE coalesce(machinery_available, false))::int AS requests_machinerie
    FROM subs GROUP BY city_slug
  ), raw_materials AS (
    SELECT s.city_slug, public.seo_slugify(x.material) AS material_term, count(*)::int AS requests
    FROM subs s CROSS JOIN LATERAL unnest(coalesce(s.materials, '{}'::text[])) AS x(material)
    WHERE nullif(btrim(x.material), '') IS NOT NULL
      AND public.seo_slugify(x.material) <> 'je-ne-suis-pas-certain'
    GROUP BY s.city_slug, public.seo_slugify(x.material)
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
           sum(gts.request_count)::int AS requests, max(gts.status) AS availability
    FROM registry r
    JOIN public.geo_territory_services gts ON gts.territory_id = r.territory_id
    JOIN LATERAL (
      SELECT s.slug AS seo_slug, s.name FROM public.seo_services s
      WHERE s.active = true AND s.slug = CASE gts.service_key
        WHEN 'recherche_dompe' THEN 'dompe'
        WHEN 'point_de_depot' THEN 'recherche-point-de-depot'
        WHEN 'disposition_remblai' THEN 'recherche-point-de-depot'
        WHEN 'transport' THEN 'transport-vrac'
        WHEN 'courtage_materiaux' THEN 'courtage-materiaux'
        ELSE replace(gts.service_key, '_', '-') END
    ) ss ON true
    WHERE gts.status IN ('ACTIVE','PARTIELLE') AND gts.request_count > 0
    GROUP BY r.slug, ss.seo_slug, ss.name
  ), page_stats AS (
    SELECT p.city_slug,
      count(*)::int AS pages_total,
      count(*) FILTER (WHERE p.status = 'published')::int AS pages_published,
      count(*) FILTER (WHERE p.status = 'draft')::int AS pages_draft
    FROM public.seo_pages p GROUP BY p.city_slug
  ), scored AS (
    SELECT r.slug, r.name, r.region, r.population, r.request_count,
      coalesce(d.requests_total,0) AS requests_total,
      coalesce(d.requests_remblai,0) AS requests_remblai,
      coalesce(d.requests_disposition,0) AS requests_disposition,
      coalesce(d.requests_dompe,0) AS requests_dompe,
      coalesce(d.requests_livraison,0) AS requests_livraison,
      coalesce(d.requests_vrac,0) AS requests_vrac,
      coalesce(d.requests_transport,0) AS requests_transport,
      coalesce(d.requests_machinerie,0) AS requests_machinerie,
      coalesce(ps.pages_total,0) AS pages_total,
      coalesce(ps.pages_published,0) AS pages_published,
      coalesce(ps.pages_draft,0) AS pages_draft,
      (SELECT count(*) FROM material_signals m WHERE m.city_slug = r.slug)::int AS materials_count,
      (SELECT count(*) FROM service_signals s WHERE s.city_slug = r.slug)::int AS services_count
    FROM registry r
    LEFT JOIN demand d ON d.city_slug = r.slug
    LEFT JOIN page_stats ps ON ps.city_slug = r.slug
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug', s.slug, 'name', s.name, 'region', s.region, 'population', s.population,
    'requests_total', greatest(s.requests_total, s.request_count),
    'requests_remblai', s.requests_remblai,
    'requests_disposition', s.requests_disposition,
    'requests_dompe', s.requests_dompe,
    'requests_livraison', s.requests_livraison,
    'requests_vrac', s.requests_vrac,
    'requests_transport', s.requests_transport,
    'requests_machinerie', s.requests_machinerie,
    'pages_total', s.pages_total, 'pages_published', s.pages_published, 'pages_draft', s.pages_draft,
    'materials_count', s.materials_count, 'services_count', s.services_count,
    'tier', CASE
       WHEN greatest(s.requests_total, s.request_count) >= 10 AND (s.materials_count > 0 OR s.services_count > 0) THEN 'forte'
       WHEN greatest(s.requests_total, s.request_count) >= 3 THEN 'moyenne'
       WHEN greatest(s.requests_total, s.request_count) >= 1 THEN 'faible'
       ELSE 'non_pertinente' END,
    'reasons', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT greatest(s.requests_total, s.request_count)::text || ' demande(s) CRM rattachée(s)' AS x
        WHERE greatest(s.requests_total, s.request_count) > 0
        UNION ALL SELECT s.requests_remblai::text || ' demande(s) de remblai' WHERE s.requests_remblai > 0
        UNION ALL SELECT s.requests_dompe::text || ' demande(s) de dompe / sortie de matériaux' WHERE s.requests_dompe > 0
        UNION ALL SELECT s.requests_livraison::text || ' demande(s) de livraison' WHERE s.requests_livraison > 0
        UNION ALL SELECT s.requests_vrac::text || ' demande(s) de matériaux en vrac' WHERE s.requests_vrac > 0
        UNION ALL SELECT s.requests_transport::text || ' demande(s) avec calcul de transport' WHERE s.requests_transport > 0
        UNION ALL SELECT s.materials_count::text || ' matériau(x) réellement demandé(s)' WHERE s.materials_count > 0
        UNION ALL SELECT s.services_count::text || ' service(s) actif(s) au registre territorial' WHERE s.services_count > 0
        UNION ALL SELECT 'Aucune demande CRM rattachée à ce territoire' WHERE greatest(s.requests_total, s.request_count) = 0
        UNION ALL SELECT s.pages_published::text || ' page(s) SEO déjà publiée(s)' WHERE s.pages_published > 0
        UNION ALL SELECT 'Aucune page SEO créée' WHERE s.pages_total = 0
      ) t),
    'services', coalesce((SELECT jsonb_agg(jsonb_build_object('slug',x.slug,'name',x.name,'requests',x.requests,'availability',x.availability) ORDER BY x.requests DESC, x.name) FROM service_signals x WHERE x.city_slug = s.slug), '[]'::jsonb),
    'materials', coalesce((SELECT jsonb_agg(jsonb_build_object('slug',x.slug,'name',x.name,'requests',x.requests) ORDER BY x.requests DESC, x.name) FROM material_signals x WHERE x.city_slug = s.slug), '[]'::jsonb),
    'existing_pages', coalesce((SELECT jsonb_agg(jsonb_build_object('slug',p.slug,'status',p.status,'material',p.material_slug,'service',p.service_slug) ORDER BY p.slug) FROM public.seo_pages p WHERE p.city_slug = s.slug), '[]'::jsonb),
    'candidates', coalesce((
      SELECT jsonb_agg(q.c) FROM (
        SELECT jsonb_build_object('kind','material','slug',m.slug,'name',m.name,'requests',m.requests) AS c, m.requests AS r
        FROM material_signals m WHERE m.city_slug = s.slug
          AND NOT EXISTS (SELECT 1 FROM public.seo_pages p WHERE p.city_slug = s.slug AND p.material_slug = m.slug)
        UNION ALL
        SELECT jsonb_build_object('kind','service','slug',sv.slug,'name',sv.name,'requests',sv.requests), sv.requests
        FROM service_signals sv WHERE sv.city_slug = s.slug
          AND NOT EXISTS (SELECT 1 FROM public.seo_pages p WHERE p.city_slug = s.slug AND p.service_slug = sv.slug)
        ORDER BY 2 DESC
      ) q), '[]'::jsonb)
  ) ORDER BY greatest(s.requests_total, s.request_count) DESC, s.name), '[]'::jsonb)
  INTO _cities FROM scored s;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'cities', _cities,
    'crm_active', (SELECT count(*) FROM public.geo_territories WHERE type='municipalite' AND status='active'),
    'seo_cities', (SELECT count(*) FROM public.seo_cities WHERE active),
    'cities_with_pages', (SELECT count(DISTINCT city_slug) FROM public.seo_pages)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.seo_opportunity_analysis() FROM public;
GRANT EXECUTE ON FUNCTION public.seo_opportunity_analysis() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_index_diagnosis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  WITH dup AS (
    SELECT lower(btrim(coalesce(meta_title, title))) AS t
    FROM public.seo_pages WHERE status = 'published'
    GROUP BY 1 HAVING count(*) > 1
  ), classified AS (
    SELECT p.slug, p.city_slug, p.material_slug, p.service_slug, p.word_count,
      coalesce(p.internal_link_count, 0) AS internal_link_count, p.published_at,
      CASE
        WHEN p.noindex THEN 'noindex'
        WHEN p.indexed_at IS NOT NULL OR p.google_index_status = 'indexed' THEN 'indexee'
        WHEN coalesce(p.internal_link_count,0) = 0 THEN 'page_orpheline'
        WHEN coalesce(p.word_count,0) < 800 THEN 'contenu_insuffisant'
        WHEN EXISTS (SELECT 1 FROM dup d WHERE d.t = lower(btrim(coalesce(p.meta_title, p.title)))) THEN 'duplication_potentielle'
        WHEN p.published_at IS NULL OR p.published_at > now() - interval '14 days' THEN 'publiee_recemment'
        WHEN p.discovered_at IS NOT NULL THEN 'exploree_non_indexee'
        ELSE 'cause_inconnue'
      END AS cause
    FROM public.seo_pages p WHERE p.status = 'published'
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'published', (SELECT count(*) FROM classified),
    'indexed', (SELECT count(*) FROM classified WHERE cause = 'indexee'),
    'not_indexed', (SELECT count(*) FROM classified WHERE cause <> 'indexee'),
    'gsc_connected', EXISTS (SELECT 1 FROM public.seo_pages WHERE google_last_checked_at IS NOT NULL),
    'causes', (SELECT coalesce(jsonb_agg(jsonb_build_object('cause', c.cause, 'count', c.n) ORDER BY c.n DESC), '[]'::jsonb)
               FROM (SELECT cause, count(*)::int AS n FROM classified WHERE cause <> 'indexee' GROUP BY cause) c),
    'samples', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'cause', s.cause, 'city', s.city_slug,
                  'material', s.material_slug, 'service', s.service_slug, 'words', s.word_count,
                  'internal_links', s.internal_link_count)), '[]'::jsonb)
                FROM (SELECT * FROM classified WHERE cause <> 'indexee' ORDER BY cause, slug LIMIT 200) s),
    'orphans', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'city', city_slug,
                  'material', material_slug, 'service', service_slug)), '[]'::jsonb)
                FROM classified WHERE cause = 'page_orpheline')
  ) INTO _res;

  RETURN _res;
END;
$function$;

REVOKE ALL ON FUNCTION public.seo_index_diagnosis() FROM public;
GRANT EXECUTE ON FUNCTION public.seo_index_diagnosis() TO authenticated, service_role;