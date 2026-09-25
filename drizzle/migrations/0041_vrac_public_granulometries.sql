CREATE OR REPLACE FUNCTION public.vrac_public_granulometries()
RETURNS TABLE (id uuid, code text, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, code, label_fr FROM material_granulometries ORDER BY label_fr;
$$;
REVOKE ALL ON FUNCTION public.vrac_public_granulometries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vrac_public_granulometries() TO anon, authenticated, service_role;