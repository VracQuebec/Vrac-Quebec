-- PREPARED ONLY. Extend the existing privacy-safe result with declared municipality,
-- not the private address or exact coordinates. Existing eligibility stays authoritative.
CREATE FUNCTION public.exec03_search_sites() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('city',nullif(trim(s.city),''))),'[]'::jsonb)
 FROM public.get_entrepreneur_leads() d JOIN public.submissions s ON s.id=d.id;
$$;
REVOKE ALL ON FUNCTION public.exec03_search_sites() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exec03_search_sites() TO authenticated;