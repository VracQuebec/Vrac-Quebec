CREATE OR REPLACE FUNCTION public.seo_city_coverage_all()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  RETURN (
  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug) g.id AS tid, g.seo_city_slug AS slug, c.name
    FROM geo_territories g JOIN seo_cities c ON c.slug=g.seo_city_slug AND c.active
    WHERE g.type='municipalite' AND g.status='active' AND g.seo_city_slug IS NOT NULL
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ),
  -- Règle validée Terre / Terre mélangée → Remblai : une demande distincte compte une fois,
  -- seulement si le contexte est clairement du remplissage (lecture seule, aucune écriture).
  terre AS (
    SELECT s.territory_id AS tid, count(DISTINCT s.id)::int AS n
    FROM submissions s
    CROSS JOIN LATERAL (SELECT lower(coalesce(s.description,'')||' '||coalesce(s.other_material,'')) AS d) t
    WHERE EXISTS (SELECT 1 FROM unnest(coalesce(s.materials,'{}'::text[])) x
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
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'materials', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',m.slug,'name',m.name,
        'keys', (SELECT jsonb_agg(DISTINCT k) FROM unnest(array[seo_slugify(m.name)] || coalesce((SELECT array_agg(seo_slugify(x)) FROM unnest(coalesce(m.keywords,'{}'::text[])) x),'{}')) k)
      ) ORDER BY m.sort_order, m.slug),'[]') FROM seo_materials m WHERE m.active),
    'services', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',s.slug,'name',s.name) ORDER BY s.slug),'[]') FROM seo_services s WHERE s.active),
    'cities', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'city_slug', r.slug, 'city_name', r.name,
        'terre_remblai', coalesce((SELECT te.n FROM terre te WHERE te.tid=r.tid),0),
        'territory_services', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',t.service_key,'status',t.status,'requests',t.request_count)),'[]') FROM geo_territory_services t WHERE t.territory_id=r.tid),
        'terms', (SELECT coalesce(jsonb_agg(jsonb_build_object('raw',q.raw,'slug',q.slug,'count',q.n)),'[]') FROM (
            SELECT min(btrim(x)) raw, seo_slugify(x) slug, count(*)::int n
            FROM submissions s CROSS JOIN LATERAL unnest(coalesce(s.materials,'{}'::text[])) x
            WHERE s.territory_id=r.tid AND nullif(btrim(x),'') IS NOT NULL AND seo_slugify(x) <> 'je-ne-suis-pas-certain'
            GROUP BY seo_slugify(x)) q),
        'pages', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'status',p.status,'noindex',p.noindex,'published_at',p.published_at,'material_slug',p.material_slug,'service_slug',p.service_slug)),'[]') FROM seo_pages p WHERE p.city_slug=r.slug)
      ) ORDER BY r.slug),'[]') FROM registry r)
  ));
END $function$;