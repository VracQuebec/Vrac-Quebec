CREATE OR REPLACE FUNCTION public.is_entrepreneur_visible_dompe(_s submissions)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_fill_request_type(_s.request_type)
     AND lower(trim(coalesce(_s.status, ''))) = 'en attente de livraison'
     AND _s.public_latitude IS NOT NULL
     AND _s.public_longitude IS NOT NULL
     -- Identité CRM confirmée : numéro de dompe réel obligatoire
     AND coalesce(_s.dompe_number, '') ~* '^\s*(dompe\s*)?#?\s*\d+\s*$'
     -- Aucune fiche de test (adresses réservées)
     AND coalesce(_s.email, '') !~* '(@[^@]*\.invalid|\.test|\.example|@example\.com)$'
     AND NOT public.is_blacklisted('submission', _s.id);
$function$;