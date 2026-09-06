
DROP POLICY IF EXISTS mkt_partners_public_read ON public.mkt_partners;
DROP POLICY IF EXISTS mkt_services_public_read ON public.mkt_partner_services;
DROP POLICY IF EXISTS mkt_territories_public_read ON public.mkt_partner_territories;

CREATE OR REPLACE VIEW public.mkt_partners_public
WITH (security_invoker = off) AS
SELECT company_id, legal_name, trade_name, description, logo_url, website,
       city, region, latitude, longitude, project_sizes, accepts_tenders,
       accepts_subcontracting, availability_status, is_public, is_verified
FROM public.mkt_partners
WHERE is_active AND archived_at IS NULL;

REVOKE ALL ON public.mkt_partners_public FROM public;
GRANT SELECT ON public.mkt_partners_public TO anon, authenticated, service_role;
