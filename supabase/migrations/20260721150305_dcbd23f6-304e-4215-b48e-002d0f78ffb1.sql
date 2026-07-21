
CREATE OR REPLACE FUNCTION public.get_public_dumps()
RETURNS TABLE (
  id uuid,
  submission_number integer,
  dompe_number text,
  materials text[],
  latitude double precision,
  longitude double precision,
  availability_status text,
  truck_types_allowed text[],
  opening_hours text,
  remaining_capacity text,
  accessibility text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.submission_number,
    s.dompe_number,
    s.materials,
    COALESCE(s.postal_latitude, s.latitude) AS latitude,
    COALESCE(s.postal_longitude, s.longitude) AS longitude,
    COALESCE(s.availability_status, 'available') AS availability_status,
    s.truck_types_allowed,
    s.opening_hours,
    s.remaining_capacity,
    s.accessibility
  FROM public.submissions s
  WHERE lower(trim(coalesce(s.request_type, ''))) IN ('remblai','depot','dépôt','remblai / dépôt','remblai / depot')
    AND lower(trim(coalesce(s.status, ''))) = 'en attente de livraison'
    AND COALESCE(s.availability_status, 'available') <> 'unavailable'
    AND COALESCE(s.postal_latitude, s.latitude) IS NOT NULL
    AND COALESCE(s.postal_longitude, s.longitude) IS NOT NULL
    AND NOT public.is_blacklisted('submission', s.id)
$$;

GRANT EXECUTE ON FUNCTION public.get_public_dumps() TO anon, authenticated;
