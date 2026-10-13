-- Synonymes de reconnaissance seulement (aucune donnée client ni décision modifiée)
UPDATE public.seo_materials SET keywords = array_append(keywords, 'pierre concassée 3/4 net')
 WHERE slug='pierre-nette' AND NOT ('pierre concassée 3/4 net' = ANY(keywords));
UPDATE public.seo_materials SET keywords = array_append(keywords, 'roches')
 WHERE slug='roche' AND NOT ('roches' = ANY(keywords));
UPDATE public.seo_materials SET keywords = keywords || ARRAY(SELECT v FROM unnest(ARRAY['roche concassée','roches concassées','roches concassée','roches concasées']) v WHERE NOT (v = ANY(keywords)))
 WHERE slug='pierre-concassee';

CREATE OR REPLACE FUNCTION public.seo_autopilot_preview()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE _r jsonb; _o jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  WITH c AS (
    SELECT s.city_slug AS cs, s.availability AS av, p.status AS pst
    FROM public.seo_city_slots_catalog(NULL) s
    LEFT JOIN LATERAL (
      SELECT p.status FROM public.seo_pages p
       WHERE p.city_slug = s.city_slug AND p.material_slug IS NOT DISTINCT FROM s.material_slug
         AND p.service_slug IS NOT DISTINCT FROM s.service_slug
       ORDER BY (p.status = 'published') DESC, p.updated_at DESC LIMIT 1) p ON true
    WHERE public.seo_city_is_generable(s.city_slug)
  )
  SELECT jsonb_build_object(
    'cities', count(DISTINCT cs), 'combinations', count(*),
    'published', count(*) FILTER (WHERE pst = 'published'),
    'to_generate', count(*) FILTER (WHERE pst IS NULL AND av = 'confirmee'),
    'drafts_to_finish', count(*) FILTER (WHERE pst IS NOT NULL AND pst <> 'published' AND av = 'confirmee'),
    'drafts_waiting', count(*) FILTER (WHERE pst IS NOT NULL AND pst <> 'published' AND av <> 'confirmee'),
    'waiting_evidence', count(*) FILTER (WHERE pst IS NULL AND av = 'inconnue'),
    'excluded', count(*) FILTER (WHERE pst IS NULL AND av = 'exclue'),
    'global_locked', EXISTS (SELECT 1 FROM public.seo_pipeline_guard WHERE global_disabled)
  ) INTO _r FROM c;
  -- Périmètres : pages réelles par type de lieu (municipalités du catalogue vs arrondissements/secteurs hors START)
  WITH muni AS (SELECT DISTINCT g.seo_city_slug s FROM public.geo_territories g JOIN public.seo_cities c ON c.slug=g.seo_city_slug AND c.active
                 WHERE g.type='municipalite' AND g.status='active'),
       oth AS (SELECT c.slug s FROM public.seo_cities c WHERE c.active AND c.slug NOT IN (SELECT s FROM muni))
  SELECT jsonb_build_object(
    'muni_places', (SELECT count(*) FROM muni),
    'muni_published', (SELECT count(*) FROM public.seo_pages WHERE status='published' AND city_slug IN (SELECT s FROM muni)),
    'muni_drafts', (SELECT count(*) FROM public.seo_pages WHERE status<>'published' AND city_slug IN (SELECT s FROM muni)),
    'other_places', (SELECT count(*) FROM oth),
    'other_published', (SELECT count(*) FROM public.seo_pages WHERE status='published' AND city_slug IN (SELECT s FROM oth)),
    'other_drafts', (SELECT count(*) FROM public.seo_pages WHERE status<>'published' AND city_slug IN (SELECT s FROM oth)),
    'all_published', (SELECT count(*) FROM public.seo_pages WHERE status='published'),
    'all_drafts', (SELECT count(*) FROM public.seo_pages WHERE status<>'published')
  ) INTO _o;
  RETURN _r || jsonb_build_object('scopes', _o);
END $function$;