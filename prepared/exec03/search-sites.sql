-- PREPARED ONLY. Extend the existing privacy-safe result with declared municipality,
-- not the private address or exact coordinates. Existing eligibility stays authoritative.
CREATE FUNCTION public.exec03_search_sites() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(d||jsonb_build_object('city',nullif(trim(s.city),''),'region',public.exec03_region(s.city))),'[]'::jsonb)
 FROM (
  SELECT to_jsonb(l) d FROM public.get_entrepreneur_leads() l
  UNION ALL
  SELECT to_jsonb(v) d FROM public.get_public_dumps() v
  WHERE NOT EXISTS(SELECT 1 FROM public.get_entrepreneur_leads())
 ) visible JOIN public.submissions s ON s.id=(d->>'id')::uuid;
$$;
REVOKE ALL ON FUNCTION public.exec03_search_sites() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exec03_search_sites() TO authenticated;