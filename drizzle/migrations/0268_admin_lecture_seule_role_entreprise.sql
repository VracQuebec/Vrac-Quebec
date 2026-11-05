-- Compte « Administration — Lecture seule » : rôle entreprise 'lecture' (rôle existant sans écriture) dans toutes les entreprises.
CREATE OR REPLACE FUNCTION public.entcrm_role(_company_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role(auth.uid(),'admin') THEN 'support'
  WHEN public.is_admin_reader(auth.uid()) THEN 'lecture'
  ELSE (SELECT m.role FROM public.jsc_company_members m WHERE m.company_id=_company_id AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL LIMIT 1) END
$function$;