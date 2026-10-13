CREATE OR REPLACE FUNCTION public.seo_city_slots_catalog_admin(_city_slug text DEFAULT NULL)
RETURNS TABLE(city_slug text, kind text, material_slug text, service_slug text, availability text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  RETURN QUERY SELECT c.city_slug, c.kind, c.material_slug, c.service_slug, c.availability
    FROM public.seo_city_slots_catalog(_city_slug) c;
END $$;
COMMENT ON FUNCTION public.seo_city_slots_catalog_admin(text) IS 'Lecture admin seule de la disponibilité du catalogue (même règle que seo_slot_availability) pour les compteurs du tableau de bord.';
REVOKE ALL ON FUNCTION public.seo_city_slots_catalog_admin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_slots_catalog_admin(text) TO authenticated, service_role;