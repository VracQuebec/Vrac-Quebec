CREATE OR REPLACE FUNCTION public.jsc_public_truck_capacity()
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT MAX(t.capacity_tonnes)::numeric
  FROM public.jsc_trucks t
  WHERE t.is_active AND t.archived_at IS NULL AND COALESCE(t.capacity_tonnes, 0) > 0;
$function$;

REVOKE ALL ON FUNCTION public.jsc_public_truck_capacity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsc_public_truck_capacity() TO anon, authenticated, service_role;