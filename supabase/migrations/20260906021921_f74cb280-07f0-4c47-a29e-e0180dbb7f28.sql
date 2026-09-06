
REVOKE SELECT ON public.mkt_partners FROM authenticated;
GRANT SELECT (company_id, legal_name, trade_name, description, logo_url, website,
  city, region, latitude, longitude, project_sizes, accepts_tenders,
  accepts_subcontracting, availability_status, is_public, is_verified, is_active,
  archived_at, min_project_amount, max_project_amount, max_distance_km)
ON public.mkt_partners TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_partner_full(_company_id uuid)
RETURNS public.mkt_partners
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.mkt_partners p
  WHERE p.company_id = _company_id
    AND (public.mkt_is_member(_company_id) OR public.mkt_is_admin());
$$;
REVOKE ALL ON FUNCTION public.mkt_partner_full(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_partner_full(uuid) TO authenticated, service_role;
