
CREATE OR REPLACE FUNCTION public.entcrm_can_write(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire'), false) $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_field(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','mecanicien','chauffeur','operateur'), false) $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_finance(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','comptabilite','lecture'), false) $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_commercial(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','comptabilite','lecture'), false) $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_admin(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire'), false) $$;
