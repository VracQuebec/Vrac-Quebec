ALTER VIEW public.jsc_listings_public SET (security_invoker = on);
ALTER VIEW public.material_matching_candidates SET (security_invoker = on);

-- L'anonyme ne conserve un accès qu'aux colonnes publiques de jsc_listings
REVOKE SELECT ON public.jsc_listings FROM anon;
GRANT SELECT (id, title, listing_type, material_label, quantity, quantity_unit,
              price, price_unit, city, region, description, available_from,
              status, is_active, archived_at, created_at, updated_at)
  ON public.jsc_listings TO anon;

DROP POLICY IF EXISTS "Anon reads active listings" ON public.jsc_listings;
CREATE POLICY "Anon reads active listings"
  ON public.jsc_listings FOR SELECT TO anon
  USING (is_active AND status = 'active' AND archived_at IS NULL);