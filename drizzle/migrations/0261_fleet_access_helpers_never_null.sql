CREATE OR REPLACE FUNCTION public.fleet_can_administer(_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.has_role(auth.uid(), 'admin')
      OR public.fleet_member_role(_company_id) IN ('proprietaire', 'admin', 'gestionnaire'), false)
$function$;
CREATE OR REPLACE FUNCTION public.fleet_can_manage(_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.has_role(auth.uid(), 'admin')
      OR public.fleet_member_role(_company_id) IN ('proprietaire', 'admin', 'gestionnaire', 'mecanicien'), false)
$function$;