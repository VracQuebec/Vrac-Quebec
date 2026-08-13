DROP FUNCTION IF EXISTS public.get_my_submissions();

CREATE FUNCTION public.get_my_submissions()
 RETURNS TABLE(id uuid, submission_number integer, created_at timestamp with time zone, status text, request_type text, materials text[], other_material text, quantity text, tonnage text, city text, formatted_address text, address text, desired_date date, selected_site_id uuid, selected_site_label text, selected_site_address text, site_validated_at timestamp with time zone, place_id text, latitude double precision, longitude double precision, quote_material text, quote_distance_km numeric, quote_duration_minutes integer, selection_updated_at timestamp with time zone, site_availability_status text, site_availability_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.submission_number, s.created_at, s.status, s.request_type,
    s.materials, s.other_material, s.quantity, s.tonnage,
    s.city, s.formatted_address, s.address, s.desired_date,
    s.selected_site_id, s.selected_site_label, s.selected_site_address,
    s.site_validated_at,
    s.place_id, s.latitude, s.longitude,
    s.quote_material, s.quote_distance_km, s.quote_duration_minutes,
    s.selection_updated_at,
    site.availability_status, site.availability_updated_at
  FROM public.submissions s
  LEFT JOIN public.submissions site ON site.id = s.selected_site_id
  WHERE auth.uid() IS NOT NULL
    AND (
      s.created_by = auth.uid()
      OR (
        s.email IS NOT NULL
        AND lower(trim(s.email)) = lower(trim(coalesce(public.current_user_email(), '')))
      )
    )
  ORDER BY s.created_at DESC
$function$;

REVOKE ALL ON FUNCTION public.get_my_submissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_submissions() TO authenticated;