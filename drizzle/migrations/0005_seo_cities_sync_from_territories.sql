CREATE OR REPLACE FUNCTION public.unaccent_less(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(coalesce(_s,''),
    'àâäáãåÀÂÄÁÃÅçÇéèêëÉÈÊËîïíìÎÏÍÌôöòóõÔÖÒÓÕûüùúÛÜÙÚñÑÿŸ',
    'aaaaaaAAAAAAcCeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnNyY')
$$;

CREATE OR REPLACE FUNCTION public.seo_slugify(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from regexp_replace(
    lower(public.unaccent_less(_s)), '[^a-z0-9]+', '-', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.seo_sync_cities_from_territories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _linked int := 0; _inserted int := 0; _refreshed int := 0;
BEGIN
  UPDATE public.geo_territories t
     SET seo_city_slug = c.slug
    FROM public.seo_cities c
   WHERE t.type = 'municipalite' AND t.status = 'active'
     AND coalesce(t.seo_city_slug,'') = ''
     AND c.slug = public.seo_slugify(t.name);
  GET DIAGNOSTICS _linked = ROW_COUNT;

  WITH src AS (
    SELECT DISTINCT ON (public.seo_slugify(t.name))
           public.seo_slugify(t.name) AS slug,
           t.name, coalesce(nullif(t.region,''), nullif(t.mrc,''), 'Québec') AS region,
           t.latitude, t.longitude, t.mrc
      FROM public.geo_territories t
     WHERE t.type = 'municipalite' AND t.status = 'active'
       AND public.seo_slugify(t.name) <> ''
     ORDER BY public.seo_slugify(t.name), t.request_count DESC NULLS LAST
  )
  INSERT INTO public.seo_cities
    (slug, name, region, latitude, longitude, mrc, territory_type, active, served, sort_order, seo_priority)
  SELECT s.slug, s.name, s.region, s.latitude, s.longitude, s.mrc, 'ville', true, false, 900, 30
    FROM src s
  ON CONFLICT (slug) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  UPDATE public.geo_territories t
     SET seo_city_slug = public.seo_slugify(t.name)
   WHERE t.type = 'municipalite' AND t.status = 'active'
     AND coalesce(t.seo_city_slug,'') = ''
     AND EXISTS (SELECT 1 FROM public.seo_cities c WHERE c.slug = public.seo_slugify(t.name));

  UPDATE public.seo_cities c
     SET latitude  = coalesce(c.latitude,  t.latitude),
         longitude = coalesce(c.longitude, t.longitude),
         mrc       = coalesce(c.mrc, t.mrc)
    FROM public.geo_territories t
   WHERE t.seo_city_slug = c.slug AND t.type='municipalite' AND t.status='active'
     AND (c.latitude IS NULL OR c.longitude IS NULL OR c.mrc IS NULL);
  GET DIAGNOSTICS _refreshed = ROW_COUNT;

  RETURN jsonb_build_object(
    'linked', _linked, 'inserted', _inserted, 'enriched', _refreshed,
    'territories_municipalities', (SELECT count(*) FROM public.geo_territories WHERE type='municipalite' AND status='active'),
    'seo_cities_total', (SELECT count(*) FROM public.seo_cities),
    'seo_cities_active', (SELECT count(*) FROM public.seo_cities WHERE active)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seo_sync_cities_from_territories() FROM public;
GRANT EXECUTE ON FUNCTION public.seo_sync_cities_from_territories() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.geo_territory_sync_seo_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _slug text;
BEGIN
  IF NEW.type <> 'municipalite' OR NEW.status <> 'active' THEN RETURN NEW; END IF;
  _slug := coalesce(nullif(NEW.seo_city_slug,''), public.seo_slugify(NEW.name));
  IF _slug = '' THEN RETURN NEW; END IF;

  INSERT INTO public.seo_cities
    (slug, name, region, latitude, longitude, mrc, territory_type, active, served, sort_order, seo_priority)
  VALUES (_slug, NEW.name, coalesce(nullif(NEW.region,''), nullif(NEW.mrc,''), 'Québec'),
          NEW.latitude, NEW.longitude, NEW.mrc, 'ville', true, false, 900, 30)
  ON CONFLICT (slug) DO NOTHING;

  IF coalesce(NEW.seo_city_slug,'') = '' THEN
    UPDATE public.geo_territories SET seo_city_slug = _slug WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS geo_territories_sync_seo_city ON public.geo_territories;
CREATE TRIGGER geo_territories_sync_seo_city
AFTER INSERT OR UPDATE OF name, type, status ON public.geo_territories
FOR EACH ROW EXECUTE FUNCTION public.geo_territory_sync_seo_city();

CREATE OR REPLACE FUNCTION public.seo_manager_cities()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rows jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO _rows
  FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name', c.name, 'region', c.region, 'mrc', c.mrc,
      'active', c.active, 'served', c.served, 'population', c.population,
      'sort_order', c.sort_order, 'seo_priority', c.seo_priority,
      'in_registry', t.id IS NOT NULL,
      'requests', coalesce(t.request_count, 0),
      'pages_total', coalesce(p.total, 0),
      'pages_published', coalesce(p.published, 0),
      'page_state', CASE WHEN coalesce(p.published,0) > 0 THEN 'published'
                         WHEN coalesce(p.total,0) > 0 THEN 'draft'
                         ELSE 'none' END
    ) AS x
    FROM public.seo_cities c
    LEFT JOIN LATERAL (
      SELECT g.id, g.request_count FROM public.geo_territories g
       WHERE g.seo_city_slug = c.slug AND g.type='municipalite' AND g.status='active'
       LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS total, count(*) FILTER (WHERE sp.status='published') AS published
        FROM public.seo_pages sp WHERE sp.city_slug = c.slug
    ) p ON true
  ) s;

  RETURN jsonb_build_object(
    'cities', _rows,
    'territories_total', (SELECT count(*) FROM public.geo_territories WHERE type='municipalite' AND status='active'),
    'missing_in_seo', (SELECT count(*) FROM public.geo_territories g
                        WHERE g.type='municipalite' AND g.status='active'
                          AND NOT EXISTS (SELECT 1 FROM public.seo_cities c WHERE c.slug = coalesce(nullif(g.seo_city_slug,''), public.seo_slugify(g.name))))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seo_manager_cities() FROM public;
GRANT EXECUTE ON FUNCTION public.seo_manager_cities() TO authenticated, service_role;

SELECT public.seo_sync_cities_from_territories();