-- 1) jsc_marketplace_profiles : plus de lecture anonyme des coordonnées
DROP POLICY IF EXISTS "Public reads published profiles" ON public.jsc_marketplace_profiles;

CREATE POLICY "Authenticated reads published profiles"
ON public.jsc_marketplace_profiles
FOR SELECT TO authenticated
USING (is_published AND is_active AND archived_at IS NULL);

CREATE OR REPLACE VIEW public.jsc_marketplace_profiles_public
WITH (security_invoker = off) AS
SELECT id, company_id, supplier_id, carrier_company_id, partner_type, name, slug,
       tagline, description, logo_url, photos, certifications, services, opening_hours,
       city, region, service_radius_km, website, rating_average, rating_count,
       is_featured, is_published, is_active, created_at, updated_at
FROM public.jsc_marketplace_profiles
WHERE is_published AND is_active AND archived_at IS NULL;

GRANT SELECT ON public.jsc_marketplace_profiles_public TO anon, authenticated;

-- 2) mkt_partners : l'annuaire public passe uniquement par la vue restreinte
DROP POLICY IF EXISTS "mkt_partners_public_read" ON public.mkt_partners;

DROP VIEW IF EXISTS public.mkt_partners_public;
CREATE VIEW public.mkt_partners_public
WITH (security_invoker = off) AS
SELECT company_id, legal_name, trade_name, description, logo_url, website,
       city, region, latitude, longitude, project_sizes, accepts_tenders,
       accepts_subcontracting, availability_status, is_public, is_verified
FROM public.mkt_partners
WHERE is_active AND archived_at IS NULL AND is_public;

GRANT SELECT ON public.mkt_partners_public TO anon, authenticated;

-- 3) mkt_quote_requests : coordonnées client masquées avant dévoilement
CREATE OR REPLACE FUNCTION public.mkt_contact_is_revealed(_request_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN r.contact_revealed_at IS NOT NULL THEN true
    ELSE (
      WITH regle AS (
        SELECT COALESCE(r.contact_visibility,
                        (SELECT s.contact_reveal_default FROM public.mkt_settings s WHERE s.id = 'global'),
                        'apres_attribution') AS v
      )
      SELECT CASE (SELECT v FROM regle)
        WHEN 'apres_soumission' THEN EXISTS (
          SELECT 1 FROM public.mkt_bids b
          WHERE b.request_id = r.id AND b.company_id = _company_id
            AND b.status <> 'brouillon')
        WHEN 'apres_preselection' THEN EXISTS (
          SELECT 1 FROM public.mkt_bids b
          WHERE b.request_id = r.id AND b.company_id = _company_id
            AND b.status IN ('preselectionnee','retenue'))
        WHEN 'apres_attribution' THEN EXISTS (
          SELECT 1 FROM public.mkt_awards a
          WHERE a.request_id = r.id AND a.company_id = _company_id
            AND a.status <> 'annulee')
        ELSE false
      END
    )
  END
  FROM public.mkt_quote_requests r
  WHERE r.id = _request_id
$$;

REVOKE ALL ON FUNCTION public.mkt_contact_is_revealed(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mkt_contact_is_revealed(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "mkt_req_invited_read" ON public.mkt_quote_requests;

CREATE OR REPLACE VIEW public.mkt_requests_for_partners
WITH (security_invoker = off) AS
SELECT r.id, r.request_number, r.client_type, r.organization_name,
       r.category_id, r.subcategory_id, r.title, r.description, r.answers,
       r.address, r.city, r.region, r.postal_code, r.latitude, r.longitude,
       r.desired_date, r.schedule_note, r.deadline_at,
       r.budget_min, r.budget_max, r.estimated_value,
       r.is_multi_lot, r.source, r.status, r.contact_visibility,
       r.contact_revealed_at, r.is_active, r.created_at, r.updated_at,
       i.company_id AS viewer_company_id,
       public.mkt_contact_is_revealed(r.id, i.company_id) AS contact_visible,
       CASE WHEN public.mkt_contact_is_revealed(r.id, i.company_id) THEN r.contact_name END AS contact_name,
       CASE WHEN public.mkt_contact_is_revealed(r.id, i.company_id) THEN r.contact_phone END AS contact_phone,
       CASE WHEN public.mkt_contact_is_revealed(r.id, i.company_id) THEN r.contact_email END AS contact_email
FROM public.mkt_quote_requests r
JOIN LATERAL (
  SELECT DISTINCT inv.company_id
  FROM public.mkt_invitations inv
  WHERE inv.request_id = r.id AND inv.status <> 'exclue' AND public.mkt_is_member(inv.company_id)
) i ON true
WHERE r.archived_at IS NULL;

GRANT SELECT ON public.mkt_requests_for_partners TO authenticated;