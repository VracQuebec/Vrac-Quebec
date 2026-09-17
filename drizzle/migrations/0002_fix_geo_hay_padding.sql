CREATE OR REPLACE FUNCTION public.geo_hay(_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ' ' || btrim(regexp_replace(
           regexp_replace(
             regexp_replace(' ' || coalesce(public.geo_normalize(_txt), '') || ' ',
                            ' ste ', ' sainte ', 'g'),
             ' st ', ' saint ', 'g'),
           '\s+', ' ', 'g')) || ' '
$$;