CREATE OR REPLACE FUNCTION public.entcrm_paid(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- L'assistance du super admin ne dépend pas de l'abonnement du partenaire.
  SELECT public.has_role(auth.uid(),'admin') OR coalesce((public.entcrm_access_status(_company_id)->>'paid')::boolean, false)
$function$

