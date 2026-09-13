CREATE OR REPLACE FUNCTION public.matching_v2_network_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'algorithm_version', 'v2',
    'generated_at', now(),
    'remblai_total', count(*) FILTER (WHERE public.is_fill_request_type(s.request_type)),
    'remblai_usable', count(*) FILTER (WHERE public.is_usable_fill_request(s, false)),
    'without_capacity', count(*) FILTER (WHERE public.is_usable_fill_request(s, false) AND coalesce(s.remaining_capacity::text, '') = ''),
    'without_gps', count(*) FILTER (WHERE public.is_usable_fill_request(s, false) AND (s.latitude IS NULL OR s.longitude IS NULL)),
    'availability_unknown', count(*) FILTER (WHERE public.is_usable_fill_request(s, false) AND coalesce(s.availability_status, '') NOT IN ('available','lost','archived','unavailable'))
  )
  INTO result
  FROM public.submissions s;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.matching_v2_network_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matching_v2_network_overview() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_submissions_availability_status ON public.submissions (availability_status);
CREATE INDEX IF NOT EXISTS idx_submissions_lat_lng ON public.submissions (latitude, longitude);