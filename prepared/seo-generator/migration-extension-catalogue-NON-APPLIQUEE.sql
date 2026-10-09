-- PROPOSITION — NON APPLIQUÉE. Extension de la file centrale SEO au catalogue complet.
-- Effet à l'application : AUCUNE ligne existante modifiée; seo_city_slots_expected (file actuelle
-- du Générateur, des boutons et du Centre de pilotage) reste STRICTEMENT inchangée.
-- Ajoute : une table d'exclusions temporaires, une lecture « catalogue complet » par ville
-- (disponibilité confirmée / inconnue / exclue) et son résumé admin.

-- 1. Exclusions temporaires de la génération générale (pages et données existantes conservées).
CREATE TABLE public.seo_generation_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('material','service')),
  slug text NOT NULL,
  reason text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (kind, slug)
);
GRANT SELECT, INSERT, UPDATE ON public.seo_generation_exclusions TO authenticated;
GRANT ALL ON public.seo_generation_exclusions TO service_role;
ALTER TABLE public.seo_generation_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gèrent les exclusions SEO" ON public.seo_generation_exclusions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Deux lignes initiales (insérées séparément par requête de données après approbation) :
--   ('material','terre-contaminee','Exclusion temporaire — sujet réglementé, validation requise')
--   ('material','neige','Exclusion temporaire — service saisonnier hors offre générale')

-- 2. Catalogue complet attendu par ville, comparé à la file actuelle.
CREATE OR REPLACE FUNCTION public.seo_city_slots_catalog(_city_slug text DEFAULT NULL)
RETURNS TABLE(city_slug text, city_name text, kind text, material_slug text, service_slug text,
              label text, availability text, page_slug text, page_status text, page_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug) g.seo_city_slug AS slug, c.name
    FROM geo_territories g JOIN seo_cities c ON c.slug = g.seo_city_slug AND c.active
    WHERE g.type = 'municipalite' AND g.status = 'active' AND g.seo_city_slug IS NOT NULL
      AND (_city_slug IS NULL OR g.seo_city_slug = _city_slug)
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ), grid AS (
    SELECT r.slug, r.name, 'hub'::text AS kind, NULL::text AS m, NULL::text AS s, 'Page ville (hub)'::text AS label FROM registry r
    UNION ALL SELECT r.slug, r.name, 'material', m.slug, NULL, m.name FROM registry r CROSS JOIN seo_materials m WHERE m.active
    UNION ALL SELECT r.slug, r.name, 'service', NULL, s.slug, s.name FROM registry r CROSS JOIN seo_services s WHERE s.active
  ), confirmed AS (
    SELECT e.city_slug, e.kind, e.material_slug, e.service_slug FROM public.seo_city_slots_expected(_city_slug) e
  )
  SELECT g.slug, g.name, g.kind, g.m, g.s, g.label,
    CASE WHEN EXISTS (SELECT 1 FROM seo_generation_exclusions x WHERE x.active AND x.kind = g.kind AND x.slug = coalesce(g.m, g.s)) THEN 'exclue'
         WHEN EXISTS (SELECT 1 FROM confirmed c WHERE c.city_slug = g.slug AND c.kind = g.kind
                      AND c.material_slug IS NOT DISTINCT FROM g.m AND c.service_slug IS NOT DISTINCT FROM g.s
                      AND (g.kind = 'hub' OR EXISTS (SELECT 1 FROM public.seo_city_slots_expected(g.slug) z WHERE false) OR true)) THEN 'confirmee'
         ELSE 'inconnue' END,
    p.slug, p.status, coalesce(pc.n, 0)
  FROM grid g
  LEFT JOIN LATERAL (SELECT sp.slug, sp.status FROM seo_pages sp WHERE sp.city_slug = g.slug
       AND sp.material_slug IS NOT DISTINCT FROM g.m AND sp.service_slug IS NOT DISTINCT FROM g.s
       ORDER BY sp.updated_at DESC NULLS LAST LIMIT 1) p ON true
  LEFT JOIN LATERAL (SELECT count(*)::int n FROM seo_pages sp WHERE sp.city_slug = g.slug
       AND sp.material_slug IS NOT DISTINCT FROM g.m AND sp.service_slug IS NOT DISTINCT FROM g.s) pc ON true
$$;
REVOKE ALL ON FUNCTION public.seo_city_slots_catalog(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_city_slots_catalog(text) TO service_role;

-- 3. Résumé admin (lecture seule) : totaux globaux, par disponibilité et doublons.
CREATE OR REPLACE FUNCTION public.seo_catalog_coverage_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
SET statement_timeout = '120s' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  RETURN (WITH c AS (SELECT * FROM public.seo_city_slots_catalog(NULL))
    SELECT jsonb_build_object(
      'computed_at', now(),
      'expected', count(*),
      'published', count(*) FILTER (WHERE page_status = 'published'),
      'drafts', count(*) FILTER (WHERE page_slug IS NOT NULL AND page_status <> 'published'),
      'missing', count(*) FILTER (WHERE page_slug IS NULL),
      'missing_confirmed', count(*) FILTER (WHERE page_slug IS NULL AND availability = 'confirmee'),
      'missing_unknown', count(*) FILTER (WHERE page_slug IS NULL AND availability = 'inconnue'),
      'missing_excluded', count(*) FILTER (WHERE page_slug IS NULL AND availability = 'exclue'),
      'excluded_existing', count(*) FILTER (WHERE page_slug IS NOT NULL AND availability = 'exclue'),
      'duplicate_combinations', count(*) FILTER (WHERE page_count > 1)) FROM c);
END $$;
REVOKE ALL ON FUNCTION public.seo_catalog_coverage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_catalog_coverage_summary() TO authenticated;

-- RETOUR ARRIÈRE (aucune donnée existante touchée) :
--   DROP FUNCTION public.seo_catalog_coverage_summary();
--   DROP FUNCTION public.seo_city_slots_catalog(text);
--   DROP TABLE public.seo_generation_exclusions;
-- seo_city_slots_expected n'est pas modifiée; sa définition actuelle est sauvegardée dans
-- sauvegarde-seo_city_slots_expected-20261009.sql.
