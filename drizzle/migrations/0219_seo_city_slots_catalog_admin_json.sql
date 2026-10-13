CREATE OR REPLACE FUNCTION public.seo_city_slots_availability_admin()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '60s' AS $$
DECLARE _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  SELECT coalesce(jsonb_object_agg(c.city_slug || '|' || c.kind || '|' || coalesce(c.material_slug, c.service_slug, ''), c.availability), '{}'::jsonb)
    INTO _r FROM public.seo_city_slots_catalog(NULL) c;
  RETURN _r;
END $$;
COMMENT ON FUNCTION public.seo_city_slots_availability_admin() IS 'Lecture admin seule : disponibilité serveur des 28 combinaisons × ville en un seul objet (clé ville|type|slug).';
REVOKE ALL ON FUNCTION public.seo_city_slots_availability_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_city_slots_availability_admin() TO authenticated, service_role;