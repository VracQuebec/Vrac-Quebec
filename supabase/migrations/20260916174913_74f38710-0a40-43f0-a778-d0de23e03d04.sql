CREATE OR REPLACE FUNCTION public.get_entrepreneur_directory()
RETURNS TABLE (
  id uuid,
  company text,
  city text,
  province text,
  province_name text,
  region text,
  postal_sector text,
  truck_types text[],
  truck_count text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
         e.company,
         e.city,
         e.province,
         e.province_name,
         e.region,
         e.postal_sector,
         e.truck_types::text[],
         e.truck_count::text
  FROM public.entrepreneurs e
  WHERE auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(), 'admin'::app_role)
    AND e.is_network_visible = true
    AND e.company IS NOT NULL
    AND btrim(e.company) <> ''
  ORDER BY e.company ASC
$$;

REVOKE ALL ON FUNCTION public.get_entrepreneur_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entrepreneur_directory() TO authenticated, service_role;