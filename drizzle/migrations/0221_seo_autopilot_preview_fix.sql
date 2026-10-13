CREATE OR REPLACE FUNCTION public.seo_autopilot_preview()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE _r jsonb;
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
    'cities', count(DISTINCT cs),
    'combinations', count(*),
    'published', count(*) FILTER (WHERE pst = 'published'),
    'to_generate', count(*) FILTER (WHERE pst IS NULL AND av = 'confirmee'),
    'drafts_to_finish', count(*) FILTER (WHERE pst IS NOT NULL AND pst <> 'published' AND av = 'confirmee'),
    'drafts_waiting', count(*) FILTER (WHERE pst IS NOT NULL AND pst <> 'published' AND av <> 'confirmee'),
    'waiting_evidence', count(*) FILTER (WHERE pst IS NULL AND av = 'inconnue'),
    'excluded', count(*) FILTER (WHERE pst IS NULL AND av = 'exclue'),
    'global_locked', EXISTS (SELECT 1 FROM public.seo_pipeline_guard WHERE global_disabled)
  ) INTO _r FROM c;
  RETURN _r;
END $function$;