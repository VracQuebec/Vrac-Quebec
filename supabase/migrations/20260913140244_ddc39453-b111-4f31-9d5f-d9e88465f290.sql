
-- Accès anonyme restreint aux colonnes publiques uniquement
GRANT SELECT (id, title, listing_type, material_label, quantity, quantity_unit,
              price, price_unit, city, region, description, available_from,
              status, created_at, updated_at, is_active, archived_at)
  ON public.jsc_listings TO anon;

DROP POLICY IF EXISTS "Anon reads active listings" ON public.jsc_listings;
CREATE POLICY "Anon reads active listings" ON public.jsc_listings
  FOR SELECT TO anon
  USING (is_active AND status = 'active' AND archived_at IS NULL);

-- Fonctions internes : inexécutables sans session
REVOKE EXECUTE ON FUNCTION public.matching_lab_candidates(numeric, numeric, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.jsc_user_controls_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matching_lab_candidates(numeric, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jsc_user_controls_company(uuid) TO authenticated;
