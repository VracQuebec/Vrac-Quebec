CREATE OR REPLACE FUNCTION public.seo_city_opportunities()
RETURNS TABLE(city_slug text, pertinent int, covered int, drafts int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  RETURN QUERY
  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug) g.id AS territory_id, g.seo_city_slug AS slug
    FROM geo_territories g JOIN seo_cities c ON c.slug = g.seo_city_slug AND c.active
    WHERE g.type='municipalite' AND g.status='active' AND g.seo_city_slug IS NOT NULL
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ), terms AS (
    SELECT DISTINCT r.slug AS cs, seo_slugify(x) AS term
    FROM registry r JOIN submissions s ON s.territory_id=r.territory_id
    CROSS JOIN LATERAL unnest(coalesce(s.materials,'{}'::text[])) x
    WHERE nullif(btrim(x),'') IS NOT NULL AND seo_slugify(x) <> 'je-ne-suis-pas-certain'
  ), slots AS (
    SELECT r.slug AS cs, NULL::text AS m, NULL::text AS s FROM registry r
    UNION
    SELECT t.cs, m.slug, NULL FROM terms t JOIN seo_materials m ON m.active AND (seo_slugify(m.name)=t.term
      OR EXISTS (SELECT 1 FROM unnest(coalesce(m.keywords,'{}'::text[])) k WHERE seo_slugify(k)=t.term))
    UNION
    SELECT r.slug, NULL, ss.slug FROM registry r JOIN geo_territory_services gts ON gts.territory_id=r.territory_id
    JOIN seo_services ss ON ss.active AND ss.slug = CASE gts.service_key
        WHEN 'recherche_dompe' THEN 'dompe' WHEN 'point_de_depot' THEN 'recherche-point-de-depot'
        WHEN 'disposition_remblai' THEN 'recherche-point-de-depot' WHEN 'transport' THEN 'transport-vrac'
        WHEN 'courtage_materiaux' THEN 'courtage-materiaux' ELSE replace(gts.service_key,'_','-') END
    WHERE gts.status IN ('ACTIVE','PARTIELLE') AND gts.request_count > 0
  )
  SELECT sl.cs, count(*)::int,
    count(*) FILTER (WHERE p.slug IS NOT NULL)::int,
    count(*) FILTER (WHERE p.slug IS NOT NULL AND NOT (p.status='published' OR p.published_at IS NOT NULL))::int
  FROM slots sl LEFT JOIN LATERAL (
    SELECT q.slug, q.status, q.published_at FROM seo_pages q
    WHERE q.city_slug=sl.cs AND q.material_slug IS NOT DISTINCT FROM sl.m AND q.service_slug IS NOT DISTINCT FROM sl.s
    ORDER BY q.updated_at DESC NULLS LAST LIMIT 1) p ON true
  GROUP BY sl.cs;
END $$;
REVOKE ALL ON FUNCTION public.seo_city_opportunities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_opportunities() TO authenticated;