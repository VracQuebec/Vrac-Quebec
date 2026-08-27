-- Fiches partenaires : le public ne voit plus les coordonnées directes (téléphone,
-- courriel, adresse précise, GPS). Ces champs restent lisibles par les comptes connectés.
REVOKE SELECT ON public.jsc_marketplace_profiles FROM anon;
GRANT SELECT (
  id, company_id, supplier_id, carrier_company_id, partner_type, name, slug, tagline,
  description, logo_url, photos, certifications, services, opening_hours, city, region,
  service_radius_km, website, rating_average, rating_count, is_featured, is_published,
  is_active, archived_at, created_at, updated_at
) ON public.jsc_marketplace_profiles TO anon;