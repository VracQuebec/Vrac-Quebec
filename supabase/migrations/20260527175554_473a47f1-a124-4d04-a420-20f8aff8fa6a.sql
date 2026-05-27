
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS geocoding_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS postal_latitude double precision,
  ADD COLUMN IF NOT EXISTS postal_longitude double precision;

CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
 RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[], other_material text, request_type text, property_type text, quantity text, tonnage text, deliver_or_remove text, contamination text, status text, priority text, postal_prefix text, latitude double precision, longitude double precision, machinery_available boolean, machinery_description text, accessibility text[], created_at timestamp with time zone, is_assigned boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Confidentialité: on part du centre du code postal si disponible,
    -- sinon de l'adresse exacte, puis on ajoute un offset déterministe
    -- (basé sur l'id) borné à ~1 km pour ne jamais révéler la position exacte.
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
    AND lower(trim(s.status)) = 'en attente de livraison'
    AND COALESCE(s.visible_to_entrepreneur, false) = true
$function$;
