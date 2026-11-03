CREATE OR REPLACE FUNCTION public.mkt_can_bid(_request_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.mkt_is_member(_company_id) AND EXISTS (
    SELECT 1 FROM public.mkt_invitations i
    WHERE i.request_id = _request_id AND i.company_id = _company_id
      AND i.status IN ('envoyee','vue','interessee','soumise'));
$$;
REVOKE ALL ON FUNCTION public.mkt_can_bid(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_can_bid(uuid,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS mkt_bids_partner ON public.mkt_bids;
CREATE POLICY mkt_bids_partner_read ON public.mkt_bids FOR SELECT TO authenticated
  USING (public.mkt_is_member(company_id) OR public.mkt_is_admin());
CREATE POLICY mkt_bids_admin_write ON public.mkt_bids FOR ALL TO authenticated
  USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE POLICY mkt_bids_partner_insert ON public.mkt_bids FOR INSERT TO authenticated
  WITH CHECK (public.mkt_can_bid(request_id, company_id) AND status IN ('brouillon','envoyee'));
CREATE POLICY mkt_bids_partner_update ON public.mkt_bids FOR UPDATE TO authenticated
  USING (public.mkt_can_bid(request_id, company_id) AND status IN ('brouillon','envoyee'))
  WITH CHECK (public.mkt_can_bid(request_id, company_id) AND status IN ('brouillon','envoyee'));
CREATE POLICY mkt_bids_partner_delete ON public.mkt_bids FOR DELETE TO authenticated
  USING (public.mkt_is_member(company_id) AND status = 'brouillon');