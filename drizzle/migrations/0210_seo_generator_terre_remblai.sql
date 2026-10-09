-- Règle validée Terre / Terre mélangée → Remblai : une seule définition partagée
-- par la couverture SEO et la file du Générateur (lecture seule).
CREATE OR REPLACE FUNCTION public.seo_terre_remblai_requests()
RETURNS TABLE(tid uuid, n int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.territory_id AS tid, count(DISTINCT s.id)::int AS n
  FROM submissions s
  CROSS JOIN LATERAL (SELECT lower(coalesce(s.description,'')||' '||coalesce(s.other_material,'')) AS d) t
  WHERE s.territory_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(coalesce(s.materials,'{}'::text[])) x
                WHERE seo_slugify(x) IN ('terre','terre-melangee','terre-melange','terre-melanger','terre-melamge'))
    AND s.contamination IS NULL
    AND regexp_replace(t.d,'(non|pas|sans|aucun\w*|z[ée]ro)\W+(\w+\W+){0,4}contamin\w*|non-?contamin\w*',' ','g') !~ 'contamin'
    AND s.request_type='remblai'
    AND coalesce(s.service_type,'') <> 'remblai_disposition'
    AND coalesce(s.deliver_or_remove,'') !~* 'sortir'
    AND t.d !~ 'pelouse|semences? [àa] gazon|terre [àa] gazon|poserons du gazon'
    AND t.d !~ 'v[ée]g[ée]tal|terre noire|top ?soil|jardin|gazon|potager|tourbe|semence'
    AND (s.service_type IS NULL OR s.service_type='materiel_remplissage')
  GROUP BY s.territory_id
$$;
REVOKE ALL ON FUNCTION public.seo_terre_remblai_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_terre_remblai_requests() TO service_role;

CREATE OR REPLACE FUNCTION public.seo_city_slots_expected(_city_slug text DEFAULT NULL::text)
 RETURNS TABLE(city_slug text, city_name text, kind text, material_slug text, service_slug text, label text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  ), terre_slots AS (
    SELECT r.slug AS city_slug, m.slug
    FROM registry r
    JOIN public.seo_terre_remblai_requests() te ON te.tid = r.territory_id AND te.n > 0
    JOIN public.seo_materials m ON m.slug = 'remblai' AND m.active = true
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
    SELECT ts.city_slug, 'material', ts.slug, NULL FROM terre_slots ts
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
$function$;