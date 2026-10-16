-- ============================================================
-- PROPOSITION — NON APPLIQUÉE. Ne pas exécuter sans autorisation écrite.
-- Lot 1 : les 3 fonctions prioritaires + 3 outils SEO internes.
-- Constat (lecture seule, 16 oct. 2026) : la plupart des fonctions sont
-- exécutables via le pseudo-rôle PUBLIC (« =X/postgres »). Retirer « anon »
-- seul NE SUFFIT PAS : il faut révoquer PUBLIC puis réaccorder explicitement.
-- Retour arrière : section en fin de fichier (ACL d'origine relevées).
-- ============================================================

-- 1. seo_sync_cities_from_territories : écrit geo_territories et seo_cities,
--    aucun contrôle d'identité. Seul appelant : src/pages/AdminSeoManager.tsx (admin connecté).
--    Mécanisme d'autorisation existant confirmé : public.has_role(uuid, app_role)
--    (SECURITY DEFINER, table user_roles; 323 usages has_role(auth.uid(),'admin')
--    dans supabase/migrations; Login.tsx envoie le rôle 'admin' vers /admin).
--    La définition actuelle n'existe dans aucun fichier du dépôt : on ne la recopie
--    pas. On renomme la version en production (corps inchangé, octet pour octet)
--    et on place devant elle une enveloppe qui exige le rôle admin CÔTÉ SERVEUR.
--    L'appel .rpc("seo_sync_cities_from_territories") de l'interface reste identique.
ALTER FUNCTION public.seo_sync_cities_from_territories()
  RENAME TO seo_sync_cities_from_territories_impl;
REVOKE EXECUTE ON FUNCTION public.seo_sync_cities_from_territories_impl()
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.seo_sync_cities_from_territories_impl() IS
  'Corps d''origine — appelable uniquement via seo_sync_cities_from_territories() (garde admin).';

CREATE FUNCTION public.seo_sync_cities_from_territories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() est NULL pour anon et service_role : seuls les admins connectés passent.
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accès refusé : réservé aux administrateurs' USING ERRCODE = '42501';
  END IF;
  RETURN public.seo_sync_cities_from_territories_impl();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seo_sync_cities_from_territories() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seo_sync_cities_from_territories() TO authenticated, service_role;
-- Prérequis à vérifier juste avant application (non vérifiés ici) :
--   a) propriétaire de la fonction d'origine = postgres (l'enveloppe, créée par
--      le même rôle, peut alors appeler _impl malgré le REVOKE);
--   b) type de retour = jsonb (relevé inventaire 16 oct.);
--   c) aucune autre fonction SQL ne l'appelle (inventaire : aucun appelant SQL).
-- Test attendu : anon → 42501 ; connecté non admin → 42501 ; admin → même jsonb qu'avant.

-- 2. mkt_compute_commission : crée/modifie mkt_commissions pour tout _award_id.
--    Seul appelant : déclencheur mkt_award_commission_trg (SECURITY DEFINER,
--    propriétaire postgres) → aucun besoin pour anon ni authenticated.
REVOKE EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) TO service_role;

-- 3. blog_increment_view : UPDATE blog_posts.view_count sans limite.
--    Aucun appel trouvé dans le code actuel (src/, supabase/functions/).
REVOKE EXECUTE ON FUNCTION public.blog_increment_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.blog_increment_view(uuid) TO service_role;

-- 4. Outils SEO internes appelés seulement depuis src/components/seo (connecté)
REVOKE EXECUTE ON FUNCTION public.seo_optimization_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seo_optimization_counts() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.seo_optimization_candidates(text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seo_optimization_candidates(text, integer, integer) TO authenticated, service_role;

-- NE PAS TOUCHER : has_role, mkt_partner_is_public et les 25 autres fonctions
-- utilisées par des politiques RLS (colonne utilisee_par_politique_RLS = oui) :
-- has_role sert à 7 politiques ouvertes à anon/public (seo_pages, submissions…).

-- ---------------- Retour arrière exact (ACL relevées le 16 oct.) ----------------
-- seo_sync_cities_from_territories : ACL d'origine
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   (aucune entrée PUBLIC « =X/postgres »). Retour arrière : retirer l'enveloppe
--   et redonner son nom et ses droits au corps d'origine :
--   DROP FUNCTION public.seo_sync_cities_from_territories();
--   ALTER FUNCTION public.seo_sync_cities_from_territories_impl()
--     RENAME TO seo_sync_cities_from_territories;
--   COMMENT ON FUNCTION public.seo_sync_cities_from_territories() IS NULL;
--   GRANT EXECUTE ON FUNCTION public.seo_sync_cities_from_territories()
--     TO anon, authenticated, service_role;   -- postgres garde le droit propriétaire
-- mkt_compute_commission : {=X (PUBLIC), postgres, service_role}
--   GRANT EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) TO PUBLIC;
--   REVOKE EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) FROM authenticated; -- n'avait pas de droit direct
-- blog_increment_view : {postgres, anon, authenticated, service_role}
--   GRANT EXECUTE ON FUNCTION public.blog_increment_view(uuid) TO anon, authenticated;
-- seo_optimization_counts() : ACL d'origine relevée le 16 oct. (inventaire-fonctions-anon-2026-10-16.csv, l.122)
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   Aucune entrée PUBLIC : le REVOKE FROM PUBLIC ne retire rien, rien à rétablir pour PUBLIC.
--   authenticated et service_role restent accordés par la proposition.
--   GRANT EXECUTE ON FUNCTION public.seo_optimization_counts() TO anon;
-- seo_optimization_candidates(text, integer, integer) : même relevé (l.121), ACL identique
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   GRANT EXECUTE ON FUNCTION public.seo_optimization_candidates(text, integer, integer) TO anon;
-- Contrôle après retour arrière : proacl de chaque fonction doit être égal,
--   à l'ordre près, aux valeurs ci-dessus (inventaire-privileges-LECTURE-SEULE.sql).
--   Le relevé date du 16 oct. : le refaire juste avant application; tout écart = arrêt.
