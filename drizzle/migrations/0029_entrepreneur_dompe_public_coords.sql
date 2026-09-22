ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS public_latitude double precision,
  ADD COLUMN IF NOT EXISTS public_longitude double precision,
  ADD COLUMN IF NOT EXISTS public_point_updated_at timestamptz;

COMMENT ON COLUMN public.submissions.public_latitude IS 'Position anonymisee (300-950 m) exposee aux entrepreneurs. Jamais la position reelle.';
COMMENT ON COLUMN public.submissions.public_longitude IS 'Position anonymisee (300-950 m) exposee aux entrepreneurs. Jamais la position reelle.';

CREATE OR REPLACE FUNCTION public.dompe_public_point(_id uuid, _lat double precision, _lng double precision)
RETURNS TABLE(lat double precision, lng double precision)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    _lat + (dist / 111320.0) * cos(theta),
    _lng + (dist / (111320.0 * GREATEST(cos(radians(_lat)), 0.05))) * sin(theta)
  FROM (
    SELECT
      300.0 + (('x' || substr(md5(_id::text || ':radius'), 1, 8))::bit(32)::bigint % 650)::double precision AS dist,
      radians((('x' || substr(md5(_id::text || ':bearing'), 1, 8))::bit(32)::bigint % 36000)::double precision / 100.0) AS theta
  ) q
  WHERE _lat IS NOT NULL AND _lng IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.submissions_set_public_point()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lat double precision;
  v_lng double precision;
  p record;
BEGIN
  v_lat := COALESCE(NEW.postal_latitude, NEW.latitude);
  v_lng := COALESCE(NEW.postal_longitude, NEW.longitude);
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.public_latitude IS NULL OR NEW.public_longitude IS NULL THEN
    SELECT * INTO p FROM public.dompe_public_point(NEW.id, v_lat, v_lng);
    NEW.public_latitude := p.lat;
    NEW.public_longitude := p.lng;
    NEW.public_point_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_public_point ON public.submissions;
CREATE TRIGGER trg_submissions_public_point
BEFORE INSERT OR UPDATE OF latitude, longitude, postal_latitude, postal_longitude
ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.submissions_set_public_point();

UPDATE public.submissions s
SET public_latitude = (SELECT lat FROM public.dompe_public_point(s.id, COALESCE(s.postal_latitude, s.latitude), COALESCE(s.postal_longitude, s.longitude))),
    public_longitude = (SELECT lng FROM public.dompe_public_point(s.id, COALESCE(s.postal_latitude, s.latitude), COALESCE(s.postal_longitude, s.longitude))),
    public_point_updated_at = now()
WHERE s.public_latitude IS NULL
  AND COALESCE(s.postal_latitude, s.latitude) IS NOT NULL
  AND COALESCE(s.postal_longitude, s.longitude) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_entrepreneur_visible_dompe(_s public.submissions)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.is_usable_fill_request(_s, false)
     AND lower(trim(coalesce(_s.status, ''))) = 'en attente de livraison'
     AND _s.public_latitude IS NOT NULL
     AND _s.public_longitude IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[], other_material text, request_type text, property_type text, quantity text, tonnage text, deliver_or_remove text, contamination text, status text, priority text, postal_prefix text, latitude double precision, longitude double precision, machinery_available boolean, machinery_description text, accessibility text[], created_at timestamp with time zone, is_assigned boolean, availability_status text, availability_note text, truck_types_allowed text[], opening_hours text, remaining_capacity text, availability_updated_at timestamp with time zone, access_heavy_truck text, access_details jsonb, freshness text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.submission_number, s.dompe_number, s.materials, s.other_material,
    s.request_type, s.property_type, s.quantity, s.tonnage, s.deliver_or_remove,
    s.contamination, s.status, s.priority,
    LEFT(COALESCE(s.postal_code,''),3),
    s.public_latitude, s.public_longitude,
    s.machinery_available, s.machinery_description, s.accessibility, s.created_at,
    (s.assigned_entrepreneur IS NOT NULL),
    COALESCE(s.availability_status,'available'), s.availability_note, s.truck_types_allowed,
    s.opening_hours, s.remaining_capacity, s.availability_updated_at,
    s.access_heavy_truck, s.access_details,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at)
  FROM public.submissions s
  WHERE public.is_approved_entrepreneur(auth.uid())
    AND public.is_entrepreneur_visible_dompe(s);
$$;

CREATE OR REPLACE FUNCTION public.get_public_dumps()
RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[], latitude double precision, longitude double precision, availability_status text, truck_types_allowed text[], opening_hours text, remaining_capacity text, accessibility text[], freshness text, availability_updated_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.submission_number, s.dompe_number, s.materials,
    s.public_latitude, s.public_longitude,
    COALESCE(s.availability_status,'available'),
    s.truck_types_allowed, s.opening_hours, s.remaining_capacity, s.accessibility,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at),
    s.availability_updated_at
  FROM public.submissions s
  WHERE public.is_entrepreneur_visible_dompe(s);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_dumps() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_entrepreneur_leads() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.dompe_public_point(uuid, double precision, double precision) FROM anon, authenticated;

DROP POLICY IF EXISTS "Approved entrepreneurs read active dumps" ON public.dumps;
