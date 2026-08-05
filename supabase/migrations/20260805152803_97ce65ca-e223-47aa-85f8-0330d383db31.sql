-- ============================================================
-- MODULE 2 — ÉTAPE 1 : structure des données d'approvisionnement
-- Chaque matériau utilise TOUJOURS la carrière qui lui est assignée.
-- Aucune sélection automatique du fournisseur le moins cher.
-- ============================================================

ALTER TABLE public.jsc_suppliers
  ADD COLUMN IF NOT EXISTS supplier_type text NOT NULL DEFAULT 'carriere';

ALTER TABLE public.jsc_pickup_locations
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'carriere',
  ADD COLUMN IF NOT EXISTS is_base boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jsc_suppliers_supplier_type_check') THEN
    ALTER TABLE public.jsc_suppliers
      ADD CONSTRAINT jsc_suppliers_supplier_type_check
      CHECK (supplier_type IN ('carriere','sabliere','depot','garage','recyclage','autre'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jsc_pickup_locations_location_type_check') THEN
    ALTER TABLE public.jsc_pickup_locations
      ADD CONSTRAINT jsc_pickup_locations_location_type_check
      CHECK (location_type IN ('carriere','sabliere','depot','garage','recyclage','autre'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- Fiche consolidée : matériau -> point d'approvisionnement assigné
-- security_invoker : les règles d'accès des tables sources s'appliquent.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.jsc_material_supply_v
WITH (security_invoker = true) AS
SELECT
  m.id                              AS material_id,
  m.slug                            AS material_slug,
  m.name                            AS material_name,
  m.unit                            AS material_unit,
  m.density_kg_per_m3,
  m.is_taxable,
  m.selling_price                   AS price_per_tonne,
  m.purchase_price                  AS cost_per_tonne,
  m.is_active                       AS material_is_active,
  m.archived_at                     AS material_archived_at,
  m.company_id,
  p.id                              AS pickup_location_id,
  p.name                            AS pickup_name,
  COALESCE(p.location_type, 'carriere') AS pickup_type,
  p.address                         AS pickup_address,
  p.city                            AS pickup_city,
  p.postal_code                     AS pickup_postal_code,
  p.latitude                        AS pickup_latitude,
  p.longitude                       AS pickup_longitude,
  p.loading_time_minutes            AS pickup_loading_time_minutes,
  p.is_active                       AS pickup_is_active,
  s.id                              AS supplier_id,
  s.name                            AS supplier_name,
  COALESCE(s.supplier_type, 'carriere') AS supplier_type,
  (
    m.is_active
    AND m.archived_at IS NULL
    AND p.id IS NOT NULL
    AND p.is_active
    AND p.archived_at IS NULL
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND COALESCE(m.selling_price, 0) > 0
  )                                 AS is_ready
FROM public.jsc_materials m
LEFT JOIN public.jsc_pickup_locations p ON p.id = m.pickup_location_id
LEFT JOIN public.jsc_suppliers s ON s.id = p.supplier_id;

GRANT SELECT ON public.jsc_material_supply_v TO authenticated;
GRANT SELECT ON public.jsc_material_supply_v TO service_role;

-- ------------------------------------------------------------
-- Sélection automatique : fiche d'approvisionnement d'un matériau.
-- Recherche par identifiant OU par slug. Aucune règle de prix ici.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jsc_material_supply(
  _material_id uuid DEFAULT NULL,
  _slug text DEFAULT NULL
)
RETURNS SETOF public.jsc_material_supply_v
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.jsc_material_supply_v
  WHERE (_material_id IS NOT NULL AND material_id = _material_id)
     OR (_material_id IS NULL AND _slug IS NOT NULL AND material_slug = _slug)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.jsc_material_supply(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Vérification administrateur : état d'approvisionnement de tous
-- les matériaux actifs (données manquantes, carrière non assignée...).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jsc_supply_readiness()
RETURNS TABLE (
  material_id uuid,
  material_name text,
  material_slug text,
  pickup_name text,
  supplier_name text,
  supplier_type text,
  price_per_tonne numeric,
  is_ready boolean,
  issues text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    v.material_id, v.material_name, v.material_slug, v.pickup_name,
    v.supplier_name, v.supplier_type, v.price_per_tonne, v.is_ready,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN v.pickup_location_id IS NULL THEN 'carriere_non_assignee' END,
      CASE WHEN v.pickup_location_id IS NOT NULL AND (v.pickup_latitude IS NULL OR v.pickup_longitude IS NULL) THEN 'coordonnees_manquantes' END,
      CASE WHEN v.pickup_location_id IS NOT NULL AND NOT v.pickup_is_active THEN 'carriere_inactive' END,
      CASE WHEN COALESCE(v.price_per_tonne, 0) <= 0 THEN 'prix_tonne_manquant' END,
      CASE WHEN v.supplier_id IS NULL THEN 'fournisseur_non_renseigne' END
    ], NULL) AS issues
  FROM public.jsc_material_supply_v v
  WHERE v.material_archived_at IS NULL AND v.material_is_active
  ORDER BY v.material_name;
$$;

GRANT EXECUTE ON FUNCTION public.jsc_supply_readiness() TO authenticated, service_role;