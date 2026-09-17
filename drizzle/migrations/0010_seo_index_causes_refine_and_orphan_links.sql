-- 1) Affiner la classification des causes d'indexation (jamais inventée)
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
        WHEN p.google_last_checked_at IS NOT NULL THEN 'statut_google_indetermine'
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

-- 2) Correction technique sûre : maillage interne des pages orphelines (aucune suppression, aucune URL modifiée)
WITH targets AS (
  SELECT p.id, p.city_slug, p.material_slug, c.name AS city_name, m.name AS material_name
  FROM public.seo_pages p
  LEFT JOIN public.seo_cities c ON c.slug = p.city_slug
  LEFT JOIN public.seo_materials m ON m.slug = p.material_slug
  WHERE p.status = 'published' AND coalesce(p.internal_link_count, 0) = 0
), block AS (
  SELECT t.id,
    '<section class="seo-internal-links"><h2>Pages reliées</h2><ul>'
    || coalesce('<li><a href="/livraison/' || t.city_slug || '">Livraison de matériaux à ' || coalesce(t.city_name, t.city_slug) || '</a></li>', '')
    || coalesce('<li><a href="/materiaux/' || t.material_slug || '">' || coalesce(t.material_name, t.material_slug) || ' en vrac</a></li>', '')
    || '<li><a href="/transport-en-vrac">Transport en vrac</a></li>'
    || '<li><a href="/livraison">Livraison de matériaux</a></li>'
    || '<li><a href="/materiaux">Tous les matériaux</a></li>'
    || '</ul></section>' AS html,
    (CASE WHEN t.city_slug IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN t.material_slug IS NOT NULL THEN 1 ELSE 0 END + 3) AS links
  FROM targets t
)
UPDATE public.seo_pages p
SET content_html = coalesce(p.content_html, '') || b.html,
    internal_link_count = b.links,
    updated_at = now()
FROM block b WHERE p.id = b.id;

-- 3) Pages au contenu insuffisant : marquées « à évaluer », jamais supprimées ni dépubliées
UPDATE public.seo_pages
SET needs_refresh = true,
    refresh_reason = coalesce(nullif(refresh_reason, ''), 'À évaluer : contenu insuffisant (< 800 mots)'),
    updated_at = now()
WHERE status = 'published' AND coalesce(word_count, 0) < 800;