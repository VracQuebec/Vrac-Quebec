-- Le Centre de pilotage applique exactement la même QA que le Générateur
CREATE OR REPLACE FUNCTION public.seo_slot_rows(_city_slug text DEFAULT NULL)
RETURNS TABLE(city_slug text, city_name text, kind text, material_slug text, service_slug text, label text, page_id uuid, page_slug text, title text, page_status text, published_at timestamptz, word_count int, seo_score int, last_generated_at timestamptz, issues text[], gen_state text, pub_state text, task_status text, task_step text, task_attempts int, task_error text, task_updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH grid AS (
    SELECT e.city_slug, e.city_name, e.kind, e.material_slug, e.service_slug, e.label
    FROM public.seo_city_slots_expected(_city_slug) e
  ), withpage AS (
    SELECT g.*, p.id page_id, p.slug page_slug, p.title, p.status page_status, p.published_at,
           p.word_count, p.seo_score, p.last_generated_at, p.meta_title, p.meta_description, p.h1,
           p.content_html, p.noindex, p.faq, p.internal_link_count,
           p.city_slug AS page_city, p.material_slug AS page_material, p.service_slug AS page_service,
           (SELECT count(*) FROM public.seo_pages d WHERE d.slug = p.slug) AS slug_copies
    FROM grid g LEFT JOIN LATERAL (
      SELECT * FROM seo_pages p WHERE p.city_slug=g.city_slug AND p.material_slug IS NOT DISTINCT FROM g.material_slug AND p.service_slug IS NOT DISTINCT FROM g.service_slug ORDER BY p.updated_at DESC NULLS LAST LIMIT 1
    ) p ON true
  ), withtask AS (
    SELECT w.*, t.status task_status, t.step task_step, t.attempts task_attempts, t.last_error task_error, t.updated_at task_updated_at
    FROM withpage w LEFT JOIN LATERAL (
      SELECT * FROM seo_page_tasks t WHERE t.city_slug=w.city_slug AND t.material_slug IS NOT DISTINCT FROM w.material_slug AND t.service_slug IS NOT DISTINCT FROM w.service_slug ORDER BY t.updated_at DESC LIMIT 1
    ) t ON true
  ), checked AS (
    SELECT w.*, array_remove(ARRAY[
      CASE WHEN w.page_id IS NULL THEN NULL WHEN w.page_city = w.city_slug THEN NULL ELSE 'Relation ville incorrecte' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN w.page_material IS NOT DISTINCT FROM w.material_slug THEN NULL ELSE 'Relation matériau incorrecte' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN w.page_service IS NOT DISTINCT FROM w.service_slug THEN NULL ELSE 'Relation service incorrecte' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN w.page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN NULL ELSE 'URL invalide' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN length(coalesce(nullif(w.meta_title,''), w.title, '')) >= 30 THEN NULL ELSE 'Title trop court' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN coalesce(w.h1,'') <> '' THEN NULL ELSE 'H1 manquant' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN length(coalesce(w.meta_description,'')) >= 70 THEN NULL ELSE 'Meta description trop courte' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN NOT (w.page_status = 'published' AND coalesce(w.noindex,false)) THEN NULL ELSE 'Publiée mais noindex' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN coalesce(w.word_count,0) >= 300 THEN NULL ELSE 'Contenu insuffisant' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN coalesce(jsonb_array_length(coalesce(w.faq,'[]'::jsonb)),0) > 0 THEN NULL ELSE 'FAQ absente' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN coalesce(w.internal_link_count,0) >= 2 THEN NULL ELSE 'Liens internes insuffisants' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN coalesce(w.content_html,'') ILIKE '%soumission%' OR coalesce(w.content_html,'') ILIKE '%contact%' THEN NULL ELSE 'CTA absent' END,
      CASE WHEN w.page_id IS NULL THEN NULL WHEN coalesce(w.slug_copies,1) <= 1 THEN NULL ELSE 'URL en doublon' END,
      CASE WHEN w.page_id IS NULL AND w.task_status IN ('failed','needs_retry') THEN coalesce('Échec de génération : ' || w.task_error, 'Échec de génération') ELSE NULL END
    ], NULL) AS issues
    FROM withtask w
  )
  SELECT c.city_slug, c.city_name, c.kind, c.material_slug, c.service_slug, c.label, c.page_id, c.page_slug,
    c.title, c.page_status, c.published_at, c.word_count, c.seo_score, c.last_generated_at, c.issues,
    CASE WHEN c.page_id IS NULL THEN CASE WHEN c.task_status IN ('failed','needs_retry') THEN 'error' WHEN c.task_status IN ('queued','running') THEN 'pending' ELSE 'missing' END
         WHEN coalesce(array_length(c.issues,1),0) > 0 THEN 'invalid' ELSE 'ok' END,
    CASE WHEN c.page_id IS NULL THEN 'na' WHEN c.page_status='published' OR c.published_at IS NOT NULL THEN 'published' ELSE 'unpublished' END,
    c.task_status, c.task_step, c.task_attempts, c.task_error, c.task_updated_at
  FROM checked c;
$$;

REVOKE ALL ON FUNCTION public.seo_slot_rows(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_slot_rows(text) TO service_role;