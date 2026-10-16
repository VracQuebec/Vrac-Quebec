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
REVOKE EXECUTE ON FUNCTION public.seo_sync_cities_from_territories() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seo_sync_cities_from_territories() TO authenticated, service_role;
-- + contrôle admin dans le corps (même logique, garde ajoutée en tête) :
--   IF NOT public.has_role(auth.uid(), 'admin') THEN
--     RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
--   (à intégrer en recopiant la définition actuelle mot pour mot — non fait ici
--    pour éviter toute divergence avec la version en production)

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
-- seo_sync_cities_from_territories : {postgres, anon, authenticated, service_role}
--   GRANT EXECUTE ON FUNCTION public.seo_sync_cities_from_territories() TO anon;
-- mkt_compute_commission : {=X (PUBLIC), postgres, service_role}
--   GRANT EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) TO PUBLIC;
--   REVOKE EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) FROM authenticated; -- n'avait pas de droit direct
-- blog_increment_view : {postgres, anon, authenticated, service_role}
--   GRANT EXECUTE ON FUNCTION public.blog_increment_view(uuid) TO anon, authenticated;
-- seo_optimization_counts / _candidates : relever leur ACL juste avant application
--   (inventaire-privileges-LECTURE-SEULE.sql) et restaurer à l'identique.
