
-- Annonces : plus aucun accès anonyme à la table brute (la vue publique reste disponible)
DROP POLICY IF EXISTS "Anon reads active listings" ON public.jsc_listings;
REVOKE ALL ON public.jsc_listings FROM anon;

-- Journal d'audit : l'auteur ne peut pas être falsifié
CREATE OR REPLACE FUNCTION public.crm_audit_log_actor_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.actor_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_audit_log_actor_guard_trg ON public.crm_audit_log;
CREATE TRIGGER crm_audit_log_actor_guard_trg
  BEFORE INSERT ON public.crm_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.crm_audit_log_actor_guard();
