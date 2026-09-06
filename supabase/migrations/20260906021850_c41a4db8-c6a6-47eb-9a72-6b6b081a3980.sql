
ALTER VIEW public.mkt_partners_public SET (security_invoker = on);

CREATE POLICY mkt_partners_public_read ON public.mkt_partners
FOR SELECT TO anon, authenticated
USING (is_public AND is_active AND archived_at IS NULL);

REVOKE SELECT ON public.mkt_partners FROM anon;
GRANT SELECT (company_id, legal_name, trade_name, description, logo_url, website,
  city, region, latitude, longitude, project_sizes, accepts_tenders,
  accepts_subcontracting, availability_status, is_public, is_verified, is_active, archived_at)
ON public.mkt_partners TO anon;

CREATE POLICY mkt_services_public_read ON public.mkt_partner_services
FOR SELECT TO anon, authenticated
USING (is_active AND EXISTS (SELECT 1 FROM public.mkt_partners p
  WHERE p.company_id = mkt_partner_services.company_id AND p.is_public AND p.is_active));

CREATE POLICY mkt_territories_public_read ON public.mkt_partner_territories
FOR SELECT TO anon, authenticated
USING (is_active AND EXISTS (SELECT 1 FROM public.mkt_partners p
  WHERE p.company_id = mkt_partner_territories.company_id AND p.is_public AND p.is_active));
