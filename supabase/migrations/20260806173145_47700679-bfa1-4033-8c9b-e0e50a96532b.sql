CREATE OR REPLACE FUNCTION public.jsc_public_trucks()
RETURNS TABLE(id uuid, name text, truck_type text, capacity_tonnes numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.truck_type::text, t.capacity_tonnes::numeric
  FROM public.jsc_trucks t
  WHERE t.is_active
    AND t.archived_at IS NULL
    AND COALESCE(t.capacity_tonnes, 0) > 0
    AND COALESCE(t.hourly_rate, 0) > 0
  ORDER BY t.capacity_tonnes ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.jsc_public_trucks() TO anon, authenticated, service_role;