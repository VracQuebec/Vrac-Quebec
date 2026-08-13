DROP FUNCTION IF EXISTS public.get_my_submissions();

CREATE OR REPLACE FUNCTION public.get_my_submissions()
RETURNS TABLE(
  id uuid, submission_number integer, created_at timestamptz, status text, request_type text,
  materials text[], other_material text, quantity text, tonnage text,
  city text, formatted_address text, address text, desired_date date,
  selected_site_id uuid, selected_site_label text, selected_site_address text,
  site_validated_at timestamptz,
  place_id text, latitude double precision, longitude double precision
)
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
    s.place_id, s.latitude, s.longitude
  FROM public.submissions s
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

REVOKE ALL ON FUNCTION public.get_my_submissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_submissions() TO authenticated;