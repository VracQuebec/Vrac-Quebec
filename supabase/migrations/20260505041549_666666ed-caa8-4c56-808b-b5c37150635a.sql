
CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
 RETURNS TABLE(id uuid, submission_number integer, materials text[], other_material text, request_type text, property_type text, quantity text, tonnage text, deliver_or_remove text, contamination text, status text, postal_prefix text, latitude double precision, longitude double precision, description text, created_at timestamp with time zone, is_assigned boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.submission_number,
    s.materials,
    s.other_material,
    s.request_type,
    s.property_type,
    s.quantity,
    s.tonnage,
    s.deliver_or_remove,
    s.contamination,
    s.status,
    LEFT(COALESCE(s.postal_code, ''), 3) AS postal_prefix,
    ROUND(s.latitude::numeric, 2)::double precision AS latitude,
    ROUND(s.longitude::numeric, 2)::double precision AS longitude,
    s.description,
    s.created_at,
    (s.assigned_entrepreneur IS NOT NULL) AS is_assigned
  FROM public.submissions s
  WHERE
    public.has_role(auth.uid(), 'entrepreneur'::public.app_role)
    AND s.status NOT IN ('perdu', 'gagné', 'archivé')
    AND COALESCE(s.visible_to_entrepreneur, true) = true
$function$;
