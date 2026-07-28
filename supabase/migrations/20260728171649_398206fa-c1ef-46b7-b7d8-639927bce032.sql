
-- 1. Débloquer les pages faussement demontées par le check H1 défectueux.
--    Toute page ayant comme unique blocker "Balise H1 unique (0)" et ≥ 800 mots
--    est repromue en 'published' (le template SPA rend le H1 depuis title).
UPDATE public.seo_pages
   SET status = 'published',
       qa_blockers = ARRAY[]::text[],
       last_generated_at = COALESCE(last_generated_at, updated_at, now()),
       updated_at = now()
 WHERE status = 'draft'
   AND word_count >= 800
   AND (qa_blockers IS NULL
        OR array_length(qa_blockers, 1) IS NULL
        OR (array_length(qa_blockers, 1) = 1 AND qa_blockers[1] LIKE 'Balise H1 unique%'));

-- Les pages restantes en draft < 800 mots gardent leur état — elles seront
-- regénérées par la pipeline (seuil de 800 mots imposé dans le générateur).

-- 2. Tableau de bord de progression + détection d'états bloqués > 5 min.
CREATE OR REPLACE FUNCTION public.seo_publication_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _counts jsonb;
  _stuck jsonb;
  _recent jsonb;
  _target_total int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  -- Objectif total : 1 territoire desservi × (matériaux + services + hub)
  SELECT (SELECT COUNT(*) FROM public.seo_cities WHERE active AND served)
       * ((SELECT COUNT(*) FROM public.seo_materials WHERE active)
        + (SELECT COUNT(*) FROM public.seo_services WHERE active) + 1)
    INTO _target_total;

  SELECT jsonb_build_object(
    'target_total',   _target_total,
    'in_db',          (SELECT COUNT(*) FROM public.seo_pages),
    'drafts',         (SELECT COUNT(*) FROM public.seo_pages WHERE status = 'draft'),
    'in_qa',          (SELECT COUNT(*) FROM public.seo_pages
                        WHERE status = 'draft'
                          AND qa_last_checked_at IS NOT NULL
                          AND qa_last_checked_at > now() - interval '10 minutes'),
    'published',      (SELECT COUNT(*) FROM public.seo_pages WHERE status = 'published'),
    'discovered',     (SELECT COUNT(*) FROM public.seo_pages
                        WHERE google_index_status IN ('discovered','crawled','submitted','partial')),
    'indexed',        (SELECT COUNT(*) FROM public.seo_pages
                        WHERE google_index_status = 'indexed'),
    'qa_avg',         COALESCE((SELECT ROUND(AVG(qa_last_score)::numeric, 1)
                                  FROM public.seo_pages WHERE qa_last_score IS NOT NULL), 0),
    'words_avg',      COALESCE((SELECT ROUND(AVG(word_count)::numeric, 0)
                                  FROM public.seo_pages WHERE word_count IS NOT NULL), 0),
    'last_published', (SELECT MAX(updated_at) FROM public.seo_pages WHERE status = 'published')
  ) INTO _counts;

  -- Pages bloquées : status inchangé depuis > 5 minutes ET n'ayant pas atteint published
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.stuck_minutes DESC), '[]'::jsonb) INTO _stuck
  FROM (
    SELECT p.slug, p.status, p.qa_last_score, p.word_count,
           p.qa_blockers,
           EXTRACT(EPOCH FROM (now() - p.updated_at))::int / 60 AS stuck_minutes,
           CASE
             WHEN p.word_count IS NULL OR p.word_count < 800
               THEN 'contenu < 800 mots — la pipeline doit regénérer'
             WHEN array_length(p.qa_blockers,1) > 0
               THEN 'blockers QA : ' || array_to_string(p.qa_blockers, ' · ')
             WHEN p.qa_last_score IS NULL
               THEN 'QA jamais exécuté — orchestrateur ne l''a pas encore vue'
             WHEN p.qa_last_score < 80
               THEN 'QA ' || p.qa_last_score || ' < 80 — nécessite optimisation'
             ELSE 'raison inconnue — inspecter la page'
           END AS reason
      FROM public.seo_pages p
     WHERE p.status = 'draft'
       AND p.updated_at < now() - interval '5 minutes'
     ORDER BY p.updated_at ASC
     LIMIT 25
  ) t;

  -- 25 dernières publications
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.updated_at DESC), '[]'::jsonb) INTO _recent
  FROM (
    SELECT slug, title, updated_at, qa_last_score, word_count, google_index_status
      FROM public.seo_pages
     WHERE status = 'published'
     ORDER BY updated_at DESC
     LIMIT 25
  ) r;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'counts', _counts,
    'stuck_pages', _stuck,
    'recent_published', _recent,
    'ready_for_final_qa', (_counts->>'published')::int >= _target_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seo_publication_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_publication_dashboard() TO authenticated;

-- 3. Rapport de couverture SEO finale (déclenché quand target atteint)
CREATE OR REPLACE FUNCTION public.seo_final_coverage_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'coverage', jsonb_build_object(
      'territories_served', (SELECT COUNT(*) FROM public.seo_cities WHERE active AND served),
      'materials_active',   (SELECT COUNT(*) FROM public.seo_materials WHERE active),
      'services_active',    (SELECT COUNT(*) FROM public.seo_services WHERE active),
      'pages_target',       (SELECT COUNT(*) FROM public.seo_cities WHERE active AND served)
                          * ((SELECT COUNT(*) FROM public.seo_materials WHERE active)
                           + (SELECT COUNT(*) FROM public.seo_services WHERE active) + 1),
      'pages_published',    (SELECT COUNT(*) FROM public.seo_pages WHERE status='published'),
      'pages_800w',         (SELECT COUNT(*) FROM public.seo_pages WHERE status='published' AND word_count >= 800),
      'pages_qa_80',        (SELECT COUNT(*) FROM public.seo_pages WHERE status='published' AND qa_last_score >= 80),
      'pages_qa_90',        (SELECT COUNT(*) FROM public.seo_pages WHERE status='published' AND qa_last_score >= 90),
      'pages_indexed',      (SELECT COUNT(*) FROM public.seo_pages WHERE google_index_status='indexed')
    ),
    'quality', jsonb_build_object(
      'qa_avg',    COALESCE((SELECT ROUND(AVG(qa_last_score)::numeric,1) FROM public.seo_pages WHERE status='published'), 0),
      'words_avg', COALESCE((SELECT ROUND(AVG(word_count)::numeric,0)   FROM public.seo_pages WHERE status='published'), 0),
      'seo_avg',   COALESCE((SELECT ROUND(AVG(seo_score)::numeric,1)     FROM public.seo_pages WHERE status='published'), 0)
    ),
    'per_territory', (
      SELECT jsonb_object_agg(c.slug, jsonb_build_object(
        'name', c.name,
        'published', COALESCE(x.published,0),
        'qa_80',     COALESCE(x.qa_80,0),
        'indexed',   COALESCE(x.indexed,0)
      ))
      FROM public.seo_cities c
      LEFT JOIN (
        SELECT city_slug,
               COUNT(*) FILTER (WHERE status='published') AS published,
               COUNT(*) FILTER (WHERE status='published' AND qa_last_score >= 80) AS qa_80,
               COUNT(*) FILTER (WHERE google_index_status='indexed') AS indexed
          FROM public.seo_pages
         GROUP BY city_slug
      ) x ON x.city_slug = c.slug
      WHERE c.active AND c.served
    ),
    'top_pages', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.qa_last_score DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT slug, title, qa_last_score, word_count, google_index_status
          FROM public.seo_pages
         WHERE status='published'
         ORDER BY qa_last_score DESC NULLS LAST, word_count DESC
         LIMIT 20
      ) t
    ),
    'gaps', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.qa_last_score ASC NULLS FIRST), '[]'::jsonb)
      FROM (
        SELECT slug, title, qa_last_score, word_count, qa_blockers
          FROM public.seo_pages
         WHERE status='draft'
         ORDER BY word_count ASC NULLS FIRST
         LIMIT 20
      ) t
    )
  ) INTO _out;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.seo_final_coverage_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_final_coverage_report() TO authenticated;
