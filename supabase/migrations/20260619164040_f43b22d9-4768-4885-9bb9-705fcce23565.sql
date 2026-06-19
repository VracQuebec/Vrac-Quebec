ALTER TABLE public.user_roles ALTER COLUMN approved SET DEFAULT true;

UPDATE public.user_roles
SET approved = true
WHERE role = 'entrepreneur' AND approved IS DISTINCT FROM true;

CREATE OR REPLACE FUNCTION public.is_approved_entrepreneur(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _uid
      AND role = 'entrepreneur'
  )
$$;

DROP FUNCTION IF EXISTS public.get_entrepreneur_leads();

CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
RETURNS TABLE(
  id uuid,
  submission_number integer,
  dompe_number text,
  materials text[],
  other_material text,
  request_type text,
  property_type text,
  quantity text,
  tonnage text,
  deliver_or_remove text,
  contamination text,
  status text,
  priority text,
  postal_prefix text,
  latitude double precision,
  longitude double precision,
  machinery_available boolean,
  machinery_description text,
  accessibility text[],
  created_at timestamp with time zone,
  is_assigned boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id,
    s.submission_number,
    s.dompe_number,
    s.materials,
    s.other_material,
    s.request_type,
    s.property_type,
    s.quantity,
    s.tonnage,
    s.deliver_or_remove,
    s.contamination,
    s.status,
    s.priority,
    LEFT(COALESCE(s.postal_code, ''), 3) AS postal_prefix,
    CASE WHEN COALESCE(s.postal_latitude, s.latitude) IS NULL THEN NULL
      ELSE ROUND((COALESCE(s.postal_latitude, s.latitude)
        + ((mod(abs(hashtext(s.id::text || 'lat')), 2001) - 1000) / 1000.0) * 0.009
      )::numeric, 4)::double precision
    END AS latitude,
    CASE WHEN COALESCE(s.postal_longitude, s.longitude) IS NULL THEN NULL
      ELSE ROUND((COALESCE(s.postal_longitude, s.longitude)
        + ((mod(abs(hashtext(s.id::text || 'lng')), 2001) - 1000) / 1000.0) * 0.013
      )::numeric, 4)::double precision
    END AS longitude,
    s.machinery_available,
    s.machinery_description,
    s.accessibility,
    s.created_at,
    (s.assigned_entrepreneur IS NOT NULL) AS is_assigned
  FROM public.submissions s
  WHERE
    public.is_approved_entrepreneur(auth.uid())
    AND lower(trim(coalesce(s.request_type, ''))) = 'remblai'
    AND lower(trim(coalesce(s.status, ''))) = 'en attente de livraison'
$$;