-- Ajoute le nombre de pages valides au rapport détaillé d'une ville (lecture seule).
CREATE OR REPLACE FUNCTION public.seo_city_generation_report(_city_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _slots jsonb; _name text; _base jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT c.name INTO _name FROM public.seo_cities c WHERE c.slug = _city_slug;

  WITH slots AS (
    SELECT * FROM public.seo_city_slots_expected(_city_slug)
  ), joined AS (
    SELECT s.city_slug, s.kind, s.material_slug, s.service_slug, s.label,
           p.id AS page_id, p.slug AS page_slug, p.status, p.noindex, p.meta_title, p.title,
           p.meta_description, p.h1, p.word_count, p.internal_link_count, p.content_html,
           p.faq, p.seo_score, p.qa_last_score, p.last_generated_at, p.published_at,
           p.city_slug AS page_city, p.material_slug AS page_material, p.service_slug AS page_service,
           t.status AS task_status, t.last_error AS task_error, t.attempts AS task_attempts,
           (SELECT count(*) FROM public.seo_pages d WHERE d.slug = p.slug) AS slug_copies
    FROM slots s
    LEFT JOIN LATERAL (
      SELECT * FROM public.seo_pages p
      WHERE p.city_slug = s.city_slug
        AND p.material_slug IS NOT DISTINCT FROM s.material_slug
        AND p.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY p.updated_at DESC NULLS LAST LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT * FROM public.seo_page_tasks t
      WHERE t.city_slug = s.city_slug
        AND t.material_slug IS NOT DISTINCT FROM s.material_slug
        AND t.service_slug IS NOT DISTINCT FROM s.service_slug
      ORDER BY t.updated_at DESC LIMIT 1
    ) t ON true
  ), checked AS (
    SELECT j.*,
      array_remove(ARRAY[
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_city = j.city_slug THEN NULL ELSE 'Relation ville incorrecte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_material IS NOT DISTINCT FROM j.material_slug THEN NULL ELSE 'Relation matériau incorrecte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_service IS NOT DISTINCT FROM j.service_slug THEN NULL ELSE 'Relation service incorrecte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN j.page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN NULL ELSE 'URL invalide' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN length(coalesce(nullif(j.meta_title,''), j.title, '')) >= 30 THEN NULL ELSE 'Title trop court' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.h1,'') <> '' THEN NULL ELSE 'H1 manquant' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN length(coalesce(j.meta_description,'')) >= 70 THEN NULL ELSE 'Meta description trop courte' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN NOT (j.status = 'published' AND coalesce(j.noindex,false)) THEN NULL ELSE 'Publiée mais noindex' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.word_count,0) >= 300 THEN NULL ELSE 'Contenu insuffisant' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(jsonb_array_length(coalesce(j.faq,'[]'::jsonb)),0) > 0 THEN NULL ELSE 'FAQ absente' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.internal_link_count,0) >= 2 THEN NULL ELSE 'Liens internes insuffisants' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.content_html,'') ILIKE '%soumission%' OR coalesce(j.content_html,'') ILIKE '%contact%' THEN NULL ELSE 'CTA absent' END,
        CASE WHEN j.page_id IS NULL THEN NULL WHEN coalesce(j.slug_copies,1) <= 1 THEN NULL ELSE 'URL en doublon' END,
        CASE WHEN j.page_id IS NULL AND j.task_status IN ('failed','needs_retry') THEN coalesce('Échec de génération : ' || j.task_error, 'Échec de génération') ELSE NULL END
      ], NULL) AS problems
    FROM joined j
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kind', c.kind, 'material_slug', c.material_slug, 'service_slug', c.service_slug, 'label', c.label,
    'page_id', c.page_id, 'page_slug', c.page_slug, 'status', c.status, 'noindex', coalesce(c.noindex,false),
    'seo_score', c.seo_score, 'qa_score', c.qa_last_score, 'word_count', c.word_count,
    'internal_link_count', c.internal_link_count, 'last_generated_at', c.last_generated_at,
    'task_status', c.task_status, 'task_error', c.task_error, 'task_attempts', c.task_attempts,
    'problems', to_jsonb(c.problems),
    'state', CASE WHEN c.page_id IS NULL AND c.task_status IN ('queued','running') THEN 'pending'
                  WHEN c.page_id IS NULL AND c.task_status IN ('failed','needs_retry') THEN 'error'
                  WHEN c.page_id IS NULL THEN 'missing'
                  WHEN coalesce(array_length(c.problems,1),0) > 0 THEN 'invalid'
                  WHEN c.status = 'published' THEN 'published'
                  ELSE 'draft' END
  ) ORDER BY c.kind, c.label), '[]'::jsonb) INTO _slots FROM checked c;

  RETURN jsonb_build_object(
    'city_slug', _city_slug,
    'city_name', _name,
    'computed_at', now(),
    'slots', _slots,
    'summary', jsonb_build_object(
      'expected', jsonb_array_length(_slots),
      'existing', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'page_id' IS NOT NULL),
      'valid', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'page_id' IS NOT NULL AND e->>'state' NOT IN ('invalid','error')),
      'published', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'status' = 'published'),
      'drafts', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'page_id' IS NOT NULL AND coalesce(e->>'status','') <> 'published'),
      'missing', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'state' = 'missing'),
      'pending', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'state' = 'pending'),
      'errors', (SELECT count(*) FROM jsonb_array_elements(_slots) e WHERE e->>'state' IN ('error','invalid'))
    )
  );
END;
$function$;