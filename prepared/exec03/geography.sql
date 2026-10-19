-- PREPARED ONLY: exact existing municipal reference, no geocoding or coordinates.
CREATE FUNCTION public.exec03_geo_key(_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT trim(regexp_replace(lower(translate(coalesce(_value,''),'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿ–—','AAACEEEEIIOOUUUYaaaceeeeiioouuuy--')),'[[:space:]_-]+',' ','g'));
$$;
CREATE FUNCTION public.exec03_region(_city text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN count(DISTINCT nullif(trim(region_admin),''))=1 THEN min(nullif(trim(region_admin),'')) END
 FROM seo_cities WHERE province='QC' AND territory_type IN ('ville','municipalite','arrondissement')
 AND exec03_geo_key(name)=exec03_geo_key(_city) AND nullif(trim(_city),'') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.exec03_geo_key(text),public.exec03_region(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exec03_geo_key(text),public.exec03_region(text) TO authenticated,service_role;