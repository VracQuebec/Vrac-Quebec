DROP FUNCTION IF EXISTS public.get_entrepreneur_leads();
CREATE FUNCTION public.get_entrepreneur_leads()
 RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[], other_material text, request_type text, property_type text, quantity text, tonnage text, deliver_or_remove text, contamination text, status text, priority text, postal_prefix text, latitude double precision, longitude double precision, machinery_available boolean, machinery_description text, accessibility text[], created_at timestamp with time zone, is_assigned boolean, availability_status text, availability_note text, truck_types_allowed text[], opening_hours text, remaining_capacity text, availability_updated_at timestamp with time zone, access_heavy_truck text, access_details jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.submission_number, s.dompe_number, s.materials, s.other_material,
    s.request_type, s.property_type, s.quantity, s.tonnage, s.deliver_or_remove,
    s.contamination, s.status, s.priority,
    LEFT(COALESCE(s.postal_code, ''), 3) AS postal_prefix,
    COALESCE(s.postal_latitude, s.latitude) AS latitude,
    COALESCE(s.postal_longitude, s.longitude) AS longitude,
    s.machinery_available, s.machinery_description, s.accessibility, s.created_at,
    (s.assigned_entrepreneur IS NOT NULL) AS is_assigned,
    COALESCE(s.availability_status, 'available') AS availability_status,
    s.availability_note, s.truck_types_allowed, s.opening_hours, s.remaining_capacity,
    s.availability_updated_at,
    s.access_heavy_truck,
    s.access_details
  FROM public.submissions s
  WHERE
    public.is_approved_entrepreneur(auth.uid())
    AND lower(trim(coalesce(s.request_type, ''))) = 'remblai'
    AND lower(trim(coalesce(s.status, ''))) = 'en attente de livraison'
$function$;