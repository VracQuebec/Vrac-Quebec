CREATE OR REPLACE FUNCTION public.jsc_public_material_units()
RETURNS TABLE(slug text, allowed_units text[], has_density boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.slug,
         COALESCE(NULLIF(m.allowed_units, '{}'::text[]), ARRAY['tonne']::text[]) AS allowed_units,
         (m.density_kg_per_m3 IS NOT NULL AND m.density_kg_per_m3 > 0) AS has_density
  FROM public.jsc_materials m
  WHERE m.is_active AND m.is_public AND m.archived_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.jsc_public_material_units() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsc_public_material_units() TO anon, authenticated, service_role;