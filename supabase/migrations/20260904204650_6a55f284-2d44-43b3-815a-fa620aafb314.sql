-- Annonces publiques : retirer l'accès anonyme aux coordonnées directes.
REVOKE SELECT ON public.jsc_listings FROM anon;
GRANT SELECT (
  id, company_id, profile_id, listing_type, title, material_id, material_label,
  quantity, quantity_unit, price, price_unit, city, region,
  available_from, available_until, description, status, is_active,
  archived_at, created_at, updated_at
) ON public.jsc_listings TO anon;

-- Profils du réseau : retirer l'accès anonyme aux coordonnées directes.
REVOKE SELECT ON public.jsc_marketplace_profiles FROM anon;
GRANT SELECT (
  id, company_id, supplier_id, carrier_company_id, partner_type, name, slug,
  tagline, description, logo_url, photos, certifications, services,
  opening_hours, city, region, service_radius_km, website,
  rating_average, rating_count, is_featured, is_published, is_active,
  archived_at, created_at, updated_at
) ON public.jsc_marketplace_profiles TO anon;

GRANT SELECT ON public.jsc_listings TO authenticated;
GRANT SELECT ON public.jsc_marketplace_profiles TO authenticated;