
CREATE OR REPLACE FUNCTION public.is_usable_fill_request(_s public.submissions, _require_gps boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_fill_request_type(_s.request_type)
     AND COALESCE(_s.availability_status,'available') IN ('available','limited')
     AND (NOT _require_gps
          OR (COALESCE(_s.postal_latitude, _s.latitude) IS NOT NULL
              AND COALESCE(_s.postal_longitude, _s.longitude) IS NOT NULL))
     AND NOT public.is_blacklisted('submission', _s.id)
     -- Cohorte historique « perdu / archivé » : jamais réactivée automatiquement.
     -- Elle redevient utilisable uniquement après une confirmation humaine explicite.
     AND (lower(trim(coalesce(_s.status,''))) NOT IN ('perdu','archivé','archive')
          OR (_s.availability_updated_at IS NOT NULL
              AND _s.availability_confirmed_by IS NOT NULL));
$$;
