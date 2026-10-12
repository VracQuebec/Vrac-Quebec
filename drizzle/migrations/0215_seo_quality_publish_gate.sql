-- 1) Empreinte du contenu au moment de chaque contrôle qualité (note « périmée » si le contenu a changé).
ALTER TABLE public.seo_qa_reports ADD COLUMN IF NOT EXISTS content_hash text;

CREATE OR REPLACE FUNCTION public.seo_page_content_hash(_page_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT md5(concat_ws('␟', coalesce(title,''), coalesce(meta_title,''), coalesce(meta_description,''), coalesce(h1,''),
                        coalesce(intro,''), coalesce(content_html,''), coalesce(faq::text,''), coalesce(slug,'')))
  FROM seo_pages WHERE id = _page_id
$$;
REVOKE ALL ON FUNCTION public.seo_page_content_hash(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seo_page_content_hash(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_qa_reports_set_hash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN NEW.content_hash := public.seo_page_content_hash(NEW.page_id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS seo_qa_reports_set_hash ON public.seo_qa_reports;
CREATE TRIGGER seo_qa_reports_set_hash BEFORE INSERT ON public.seo_qa_reports
  FOR EACH ROW EXECUTE FUNCTION public.seo_qa_reports_set_hash();

-- 2) État de qualité d'une page : dernière note, fraîcheur (même contenu), blocages.
CREATE OR REPLACE FUNCTION public.seo_page_quality_state(_page_ids uuid[])
RETURNS TABLE(page_id uuid, score integer, fresh boolean, blockers text[], checked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, r.score, (r.content_hash IS NOT NULL AND r.content_hash = public.seo_page_content_hash(p.id)),
         r.blockers, r.checked_at
  FROM seo_pages p
  LEFT JOIN LATERAL (SELECT q.score, q.content_hash, q.blockers, q.checked_at FROM seo_qa_reports q
                     WHERE q.page_id = p.id ORDER BY q.checked_at DESC LIMIT 1) r ON true
  WHERE p.id = ANY(_page_ids) AND public.has_role(auth.uid(), 'admin'::app_role)
$$;
REVOKE ALL ON FUNCTION public.seo_page_quality_state(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seo_page_quality_state(uuid[]) TO authenticated, service_role;

-- 3) Preuves de disponibilité d'une ville (lecture admin) : nature exacte de chaque demande source.
CREATE OR REPLACE FUNCTION public.seo_slot_evidence(_city_slug text)
RETURNS TABLE(submission_number text, material_slug text, evidence text, origin text, materials text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH s AS (
    SELECT sb.submission_number::text num, sb.materials, substring(sb.description from 'provenant de (/[a-z-]+)') origin
    FROM submissions sb JOIN geo_territories g ON g.id = sb.territory_id
    WHERE g.seo_city_slug = _city_slug AND g.type = 'municipalite' AND g.status = 'active'
      AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  SELECT s.num, m.slug,
         CASE WHEN EXISTS (SELECT 1 FROM unnest(s.materials) x WHERE public.seo_slugify(x) = public.seo_slugify(m.name)
                            OR EXISTS (SELECT 1 FROM unnest(coalesce(m.keywords,'{}'::text[])) k WHERE public.seo_slugify(k) = public.seo_slugify(x)))
              THEN 'directe' ELSE 'terre_seulement' END,
         coalesce(s.origin, 'non_indiquee'), s.materials
  FROM s JOIN seo_materials m ON m.active
  WHERE EXISTS (SELECT 1 FROM unnest(s.materials) x WHERE public.seo_slugify(x) = public.seo_slugify(m.name)
                 OR EXISTS (SELECT 1 FROM unnest(coalesce(m.keywords,'{}'::text[])) k WHERE public.seo_slugify(k) = public.seo_slugify(x)))
     OR (m.slug = 'remblai' AND EXISTS (SELECT 1 FROM unnest(s.materials) x WHERE public.seo_slugify(x) LIKE 'terre%'))
$$;
REVOKE ALL ON FUNCTION public.seo_slot_evidence(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seo_slot_evidence(text) TO authenticated, service_role;

-- 4) Disponibilité : la conversion « Terre » vers « Remblai » n'est plus une preuve.
--    Seules une demande nommant réellement le matériau, un service configuré ou une décision explicite confirment.
CREATE OR REPLACE FUNCTION public.seo_city_slots_catalog(_city_slug text DEFAULT NULL::text)
 RETURNS TABLE(city_slug text, city_name text, kind text, material_slug text, service_slug text, label text, availability text, page_slug text, page_status text, page_count integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug)
      g.id AS territory_id, g.seo_city_slug AS slug, c.name
    FROM public.geo_territories g
    JOIN public.seo_cities c ON c.slug = g.seo_city_slug AND c.active = true
    WHERE g.type = 'municipalite' AND g.status = 'active' AND g.seo_city_slug IS NOT NULL
      AND (_city_slug IS NULL OR g.seo_city_slug = _city_slug)
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ), raw_materials AS (
    SELECT r.slug AS city_slug, public.seo_slugify(x.material) AS term
    FROM registry r
    JOIN public.submissions s ON s.territory_id = r.territory_id
    CROSS JOIN LATERAL unnest(coalesce(s.materials, '{}'::text[])) AS x(material)
    WHERE nullif(btrim(x.material), '') IS NOT NULL
      AND public.seo_slugify(x.material) <> 'je-ne-suis-pas-certain'
  ), material_slots AS (
    SELECT DISTINCT rm.city_slug, m.slug, m.name
    FROM raw_materials rm
    JOIN public.seo_materials m ON m.active = true AND (
      public.seo_slugify(m.name) = rm.term
      OR EXISTS (SELECT 1 FROM unnest(coalesce(m.keywords, '{}'::text[])) k WHERE public.seo_slugify(k) = rm.term)
    )
  ), service_slots AS (
    SELECT DISTINCT r.slug AS city_slug, ss.slug, ss.name
    FROM registry r
    JOIN public.geo_territory_services gts ON gts.territory_id = r.territory_id
    JOIN LATERAL (
      SELECT s.slug, s.name FROM public.seo_services s
      WHERE s.active = true AND s.slug = CASE gts.service_key
        WHEN 'recherche_dompe' THEN 'dompe'
        WHEN 'point_de_depot' THEN 'recherche-point-de-depot'
        WHEN 'disposition_remblai' THEN 'recherche-point-de-depot'
        WHEN 'transport' THEN 'transport-vrac'
        WHEN 'courtage_materiaux' THEN 'courtage-materiaux'
        ELSE replace(gts.service_key, '_', '-')
      END
    ) ss ON true
    WHERE gts.status IN ('ACTIVE', 'PARTIELLE') AND gts.request_count > 0
  ), confirmed AS (
    SELECT r.slug AS city_slug, 'hub'::text AS kind, NULL::text AS material_slug, NULL::text AS service_slug FROM registry r
    UNION SELECT ms.city_slug, 'material', ms.slug, NULL FROM material_slots ms
    UNION SELECT sv.city_slug, 'service', NULL, sv.slug FROM service_slots sv
  ), grid AS (
    SELECT r.slug, r.name, 'hub'::text AS kind, NULL::text AS m, NULL::text AS s, 'Page ville (hub)'::text AS label FROM registry r
    UNION ALL SELECT r.slug, r.name, 'material', m.slug, NULL, m.name FROM registry r CROSS JOIN public.seo_materials m WHERE m.active
    UNION ALL SELECT r.slug, r.name, 'service', NULL, s.slug, s.name FROM registry r CROSS JOIN public.seo_services s WHERE s.active
  )
  SELECT g.slug, g.name, g.kind, g.m, g.s, g.label,
    CASE WHEN EXISTS (SELECT 1 FROM public.seo_generation_exclusions x WHERE x.active AND x.kind = g.kind AND x.slug = coalesce(g.m, g.s)) THEN 'exclue'
         WHEN EXISTS (SELECT 1 FROM confirmed c WHERE c.city_slug = g.slug AND c.kind = g.kind
                      AND c.material_slug IS NOT DISTINCT FROM g.m AND c.service_slug IS NOT DISTINCT FROM g.s) THEN 'confirmee'
         ELSE 'inconnue' END,
    p.slug, p.status, coalesce(pc.n, 0)
  FROM grid g
  LEFT JOIN LATERAL (SELECT sp.slug, sp.status FROM public.seo_pages sp WHERE sp.city_slug = g.slug
       AND sp.material_slug IS NOT DISTINCT FROM g.m AND sp.service_slug IS NOT DISTINCT FROM g.s
       ORDER BY sp.updated_at DESC NULLS LAST LIMIT 1) p ON true
  LEFT JOIN LATERAL (SELECT count(*)::int n FROM public.seo_pages sp WHERE sp.city_slug = g.slug
       AND sp.material_slug IS NOT DISTINCT FROM g.m AND sp.service_slug IS NOT DISTINCT FROM g.s) pc ON true
$function$;

-- 5) Publication : qualité >= 90 sur le contenu ACTUEL, sans blocage, en plus des contrôles existants.
CREATE OR REPLACE FUNCTION public.seo_page_publish_validated(_page_id uuid, _expected_updated_at timestamp with time zone, _remove_noindex boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _p seo_pages; _issues text[]; _n int; _av text; _q record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO _p FROM seo_pages WHERE id = _page_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Page introuvable']); END IF;
  IF _p.status = 'published' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF _p.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Brouillon modifié depuis la lecture — aucune publication']);
  END IF;
  _av := public.seo_slot_availability(_p.city_slug, _p.material_slug, _p.service_slug);
  IF _av IS DISTINCT FROM 'confirmee' THEN
    RETURN jsonb_build_object('ok', false, 'availability', _av, 'issues', ARRAY['Disponibilité ' || coalesce(_av,'inconnue') || ' — publication refusée (décision ou preuve requise)']);
  END IF;
  SELECT q.score, q.content_hash, q.blockers INTO _q FROM seo_qa_reports q WHERE q.page_id = _page_id ORDER BY q.checked_at DESC LIMIT 1;
  IF _q.score IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'quality', 'absente', 'issues', ARRAY['Note de qualité absente — recalcul requis avant publication']);
  END IF;
  IF _q.content_hash IS DISTINCT FROM public.seo_page_content_hash(_page_id) THEN
    RETURN jsonb_build_object('ok', false, 'quality', 'perimee', 'issues', ARRAY['Note de qualité périmée (contenu modifié depuis) — recalcul requis']);
  END IF;
  IF _q.score < 90 THEN
    RETURN jsonb_build_object('ok', false, 'quality', _q.score, 'issues', ARRAY['Note de qualité ' || _q.score || '/100 inférieure à 90 — publication refusée']);
  END IF;
  IF coalesce(array_length(_q.blockers,1),0) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Contrôle qualité bloquant : ' || array_to_string(_q.blockers, ', ')]);
  END IF;
  IF _remove_noindex AND _p.noindex_volontaire THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Noindex volontaire — décision distincte requise']);
  END IF;
  _issues := public.seo_validate_page_fields(_p.meta_title, _p.meta_description, _p.h1, _p.content_html,
              _p.slug, _p.city_slug, (SELECT count(*) FROM seo_pages d WHERE d.slug = _p.slug) > 1);
  IF coalesce(array_length(_issues,1),0) > 0 THEN RETURN jsonb_build_object('ok', false, 'issues', _issues); END IF;
  UPDATE seo_pages SET status = 'published', published_at = coalesce(published_at, now()), updated_at = now(),
         noindex = CASE WHEN _remove_noindex AND NOT noindex_volontaire THEN false ELSE noindex END
   WHERE id = _page_id AND status <> 'published';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('ok', _n = 1);
END $function$;