CREATE OR REPLACE FUNCTION public.seo_slot_availability(_city_slug text, _material_slug text, _service_slug text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _kind text; _slug text; _d text; _a text;
BEGIN
  _kind := CASE WHEN _service_slug IS NOT NULL THEN 'service' WHEN _material_slug IS NOT NULL THEN 'material' ELSE 'hub' END;
  _slug := coalesce(_service_slug, _material_slug);
  IF _material_slug IS NOT NULL AND _service_slug IS NOT NULL THEN RETURN 'inconnue'; END IF;
  IF _slug IS NOT NULL AND EXISTS (SELECT 1 FROM seo_generation_exclusions x WHERE x.active AND x.kind=_kind AND x.slug=_slug) THEN RETURN 'exclue'; END IF;
  SELECT decision INTO _d FROM seo_city_slot_decisions WHERE city_slug=_city_slug AND kind=_kind AND slug IS NOT DISTINCT FROM _slug ORDER BY decided_at DESC LIMIT 1;
  IF _d = 'exclue' THEN RETURN 'exclue'; END IF;
  IF _d = 'confirmee' THEN RETURN 'confirmee'; END IF;
  SELECT availability INTO _a FROM seo_city_slots_catalog(_city_slug) c
   WHERE c.kind=_kind AND c.material_slug IS NOT DISTINCT FROM _material_slug AND c.service_slug IS NOT DISTINCT FROM _service_slug LIMIT 1;
  RETURN CASE WHEN _a IN ('confirmee','exclue') THEN _a ELSE 'inconnue' END;
END $$;
REVOKE ALL ON FUNCTION public.seo_slot_availability(text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seo_slot_availability(text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_page_publish_validated(_page_id uuid, _expected_updated_at timestamp with time zone, _remove_noindex boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _p seo_pages; _issues text[]; _n int; _av text;
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