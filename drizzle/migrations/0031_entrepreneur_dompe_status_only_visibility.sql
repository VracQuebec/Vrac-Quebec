-- Regle metier entrepreneur : le SEUL critere de statut est « en attente de livraison ».
-- Le champ disponibilite (available/limited/unavailable/owner_closed) n'entre plus
-- dans la visibilite entrepreneur. Les regles admin/CRM restent inchangees.
CREATE OR REPLACE FUNCTION public.is_entrepreneur_visible_dompe(_s public.submissions)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_fill_request_type(_s.request_type)
     AND lower(trim(coalesce(_s.status, ''))) = 'en attente de livraison'
     AND _s.public_latitude IS NOT NULL
     AND _s.public_longitude IS NOT NULL
     AND NOT public.is_blacklisted('submission', _s.id);
$$;

COMMENT ON FUNCTION public.is_entrepreneur_visible_dompe(public.submissions) IS
  'Bassin unique entrepreneur : statut « en attente de livraison » + position publique anonymisee. Ignore volontairement availability_status.';
