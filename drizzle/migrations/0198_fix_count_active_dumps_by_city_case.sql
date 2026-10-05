CREATE OR REPLACE FUNCTION public.count_active_dumps_by_city(_city_slug text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int FROM public.submissions s
  WHERE trim(both '-' from regexp_replace(lower(public.unaccent_string(coalesce(s.city,''))), '[^a-z0-9]+', '-', 'g'))
        = trim(both '-' from regexp_replace(lower(public.unaccent_string(coalesce(_city_slug,''))), '[^a-z0-9]+', '-', 'g'))
    AND public.is_usable_fill_request(s, true);
$function$;