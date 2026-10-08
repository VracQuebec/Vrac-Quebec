CREATE OR REPLACE FUNCTION public.seo_city_coverage(_city_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _tid uuid; _name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT g.id, c.name INTO _tid, _name FROM geo_territories g JOIN seo_cities c ON c.slug=g.seo_city_slug
   WHERE g.type='municipalite' AND g.status='active' AND g.seo_city_slug=_city_slug
   ORDER BY g.request_count DESC, g.id LIMIT 1;
  RETURN jsonb_build_object(
    'city_slug', _city_slug, 'city_name', _name, 'computed_at', now(),
    'materials', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',m.slug,'name',m.name,
        'keys', (SELECT jsonb_agg(DISTINCT k) FROM unnest(array[seo_slugify(m.name)] || coalesce((SELECT array_agg(seo_slugify(x)) FROM unnest(coalesce(m.keywords,'{}'::text[])) x),'{}')) k)
      ) ORDER BY m.sort_order, m.slug),'[]') FROM seo_materials m WHERE m.active),
    'services', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',s.slug,'name',s.name) ORDER BY s.slug),'[]') FROM seo_services s WHERE s.active),
    'territory_services', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',t.service_key,'status',t.status,'requests',t.request_count) ORDER BY t.service_key),'[]')
      FROM geo_territory_services t WHERE t.territory_id=_tid),
    'terms', (SELECT coalesce(jsonb_agg(jsonb_build_object('raw',r.raw,'slug',r.slug,'count',r.n) ORDER BY r.slug),'[]') FROM (
      SELECT min(btrim(x)) raw, seo_slugify(x) slug, count(*)::int n
      FROM submissions s CROSS JOIN LATERAL unnest(coalesce(s.materials,'{}'::text[])) x
      WHERE s.territory_id=_tid AND nullif(btrim(x),'') IS NOT NULL AND seo_slugify(x) <> 'je-ne-suis-pas-certain'
      GROUP BY seo_slugify(x)) r),
    'pages', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'status',p.status,'noindex',p.noindex,'published_at',p.published_at,
        'material_slug',p.material_slug,'service_slug',p.service_slug) ORDER BY p.slug),'[]') FROM seo_pages p WHERE p.city_slug=_city_slug)
  );
END $$;
REVOKE ALL ON FUNCTION public.seo_city_coverage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_coverage(text) TO authenticated;