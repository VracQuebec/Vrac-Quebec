-- La vue filtre elle-même les lignes (invitation non exclue + mkt_is_member(auth.uid())) et masque les coordonnées;
-- en mode invoker, la RLS de mkt_quote_requests (client/admin seulement) la vidait pour tout partenaire invité.
ALTER VIEW public.mkt_requests_for_partners SET (security_invoker = false);
REVOKE ALL ON public.mkt_requests_for_partners FROM anon;
GRANT SELECT ON public.mkt_requests_for_partners TO authenticated;
COMMENT ON VIEW public.mkt_requests_for_partners IS 'Lecture partenaire : lignes limitées aux entreprises invitées (mkt_is_member), coordonnées masquées tant que non révélées. Définisseur requis car mkt_quote_requests n''est lisible que par client/admin.';