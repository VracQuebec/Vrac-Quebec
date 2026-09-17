-- Additive, non-destructive: territory relevance scoring + controlled draft workflow.
-- Never publishes, never deletes/overwrites existing seo_pages or URLs.

CREATE OR REPLACE FUNCTION public.seo_territory_opportunity_scan()
RETURNS TABLE(inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      gt.id                AS territory_id,
      gt.seo_city_slug     AS city_slug,
      gts.service_key,
      gs.category          AS service_category,
      gts.status           AS territory_service_status,
      gts.request_count    AS service_request_count,
      gt.request_count     AS territory_request_count,
      gts.evidence
    FROM geo_territories gt
    JOIN geo_territory_services gts ON gts.territory_id = gt.id
    JOIN geo_services gs ON gs.service_key = gts.service_key
    WHERE gt.status = 'active'
      AND gt.seo_city_slug IS NOT NULL
      AND gts.status IN ('ACTIVE','PARTIELLE')
  ),
  gaps AS (
    SELECT c.*
    FROM candidates c
    LEFT JOIN seo_pages sp
      ON sp.city_slug = c.city_slug
     AND sp.service_slug = c.service_key
     AND sp.material_slug IS NULL
    WHERE sp.id IS NULL
  ),
  scored AS (
    SELECT
      g.*,
      LEAST(100, GREATEST(
        10,
        20
        + CASE WHEN g.service_category = 'A_OFFERT' THEN 30
               WHEN g.service_category = 'B_MISE_EN_RELATION' THEN 15
               WHEN g.service_category = 'C_CONNEXE' THEN 8
               ELSE 0 END
        + CASE WHEN g.territory_service_status = 'ACTIVE' THEN 15 ELSE 5 END
        + LEAST(25, COALESCE(g.service_request_count,0) * 3)
        + LEAST(10, COALESCE(g.territory_request_count,0))
      )) AS impact_score
    FROM gaps g
  )
  INSERT INTO seo_opportunities (
    type, entity_type, entity_slug, target_city_slug, target_service_slug,
    title, rationale, suggested_action, impact_score, effort_score,
    evidence, status
  )
  SELECT
    'territory_service_gap',
    'city_service',
    s.city_slug || '/' || s.service_key,
    s.city_slug,
    s.service_key,
    'Couverture manquante: ' || s.service_key || ' pour ' || s.city_slug,
    'Territoire actif avec service ' || s.territory_service_status
      || ' (demande service=' || COALESCE(s.service_request_count,0)
      || ', demande territoire=' || COALESCE(s.territory_request_count,0)
      || ') mais aucune page SEO publiée pour cette combinaison ville/service.',
    'Créer une ébauche de page (draft) pour évaluation manuelle avant publication.',
    s.impact_score,
    30,
    jsonb_build_object(
      'territory_id', s.territory_id,
      'service_category', s.service_category,
      'territory_service_status', s.territory_service_status,
      'service_request_count', s.service_request_count,
      'territory_request_count', s.territory_request_count,
      'source_evidence', s.evidence
    ),
    'open'
  FROM scored s
  WHERE NOT EXISTS (
    SELECT 1 FROM seo_opportunities existing
    WHERE existing.type = 'territory_service_gap'
      AND existing.target_city_slug = s.city_slug
      AND existing.target_service_slug = s.service_key
      AND existing.status = 'open'
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

COMMENT ON FUNCTION public.seo_territory_opportunity_scan() IS
  'Read-derived, additive: scans active territories vs. geo_territory_services (CRM-sourced request evidence) '
  'against existing seo_pages coverage and inserts scored gap rows into seo_opportunities (status=open). '
  'Never creates or modifies seo_pages. Idempotent: skips combos already open.';

CREATE OR REPLACE FUNCTION public.seo_opportunity_create_draft(_opportunity_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp seo_opportunities%ROWTYPE;
  v_page_id uuid;
  v_slug text;
BEGIN
  SELECT * INTO v_opp FROM seo_opportunities WHERE id = _opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity % not found', _opportunity_id;
  END IF;
  IF v_opp.status NOT IN ('open') THEN
    RAISE EXCEPTION 'opportunity % is not open (status=%)', _opportunity_id, v_opp.status;
  END IF;
  IF v_opp.target_city_slug IS NULL THEN
    RAISE EXCEPTION 'opportunity % has no target city';
  END IF;

  v_slug := v_opp.target_city_slug
    || COALESCE('-' || v_opp.target_service_slug, '')
    || COALESCE('-' || v_opp.target_material_slug, '');

  -- Additive only: unique combo/slug constraints on seo_pages guarantee
  -- no existing published page or URL is ever touched or duplicated.
  INSERT INTO seo_pages (
    slug, city_slug, material_slug, service_slug, title, status
  )
  VALUES (
    v_slug, v_opp.target_city_slug, v_opp.target_material_slug, v_opp.target_service_slug,
    v_opp.title, 'draft'
  )
  ON CONFLICT (city_slug, material_slug, service_slug) DO NOTHING
  RETURNING id INTO v_page_id;

  IF v_page_id IS NULL THEN
    SELECT id INTO v_page_id FROM seo_pages
    WHERE city_slug = v_opp.target_city_slug
      AND material_slug IS NOT DISTINCT FROM v_opp.target_material_slug
      AND service_slug IS NOT DISTINCT FROM v_opp.target_service_slug;
  END IF;

  UPDATE seo_opportunities
  SET status = 'drafted', page_id = v_page_id, updated_at = now()
  WHERE id = _opportunity_id;

  RETURN v_page_id;
END;
$$;

COMMENT ON FUNCTION public.seo_opportunity_create_draft(uuid) IS
  'Controlled, explicit draft creation from a single approved opportunity. '
  'Inserts exactly one seo_pages row with status=draft (never published), '
  'relies on seo_pages_combo_unique to avoid duplicating/overwriting any existing page or URL. '
  'No auto-generation loop or bulk trigger calls this function.';
