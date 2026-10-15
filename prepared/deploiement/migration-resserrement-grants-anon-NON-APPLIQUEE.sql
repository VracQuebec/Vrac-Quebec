-- ============================================================================
-- PRÉPARÉE — NE PAS APPLIQUER SANS AUTORISATION (phase finale, 15 oct. 2026)
-- Resserrement des privilèges du rôle anon sur le schéma public.
--
-- État actuel (mesuré le 15 oct. 2026) : anon détient arwdDxtm (SELECT,
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) sur TOUTES les
-- tables du schéma public. La protection réelle vient de la RLS (activée
-- partout), mais les privilèges de table inutilement larges sont une surface
-- d'attaque en cas de future politique mal écrite.
--
-- État proposé : anon ne conserve que les privilèges strictement nécessaires
-- aux fonctionnalités publiques, déduits des politiques RLS réellement
-- ouvertes à anon/{public} (audit du 15 oct. 2026) :
--
--   SELECT (lecture publique du site) :
--     - jsc_listings            (politique « Anon reads active listings » — liste publique des dompes)
--     - material_families, mkt_partner_photos, mkt_partner_services,
--       mkt_partner_territories, mkt_reviews, mkt_sender_identity
--                                 (politiques anon explicites)
--     - blog_authors, blog_categories, blog_post_related, blog_post_tags,
--       blog_posts, blog_seo_links, blog_tags
--                                 (politiques FOR public — blogue public)
--     - jsc_availability, jsc_marketplace_reviews, material_variants,
--       mkt_service_categories, seo_cities, seo_material_uses,
--       seo_materials, seo_pages, seo_services
--                                 (politiques FOR public — pages SEO et catalogue publics)
--
--   INSERT (formulaires et télémétrie publics) :
--     - submissions             (politique « Anon can submit » — demande de remblai)
--     - transport_requests      (politique « Anon can submit » — demande de dompe)
--     - seo_page_events         (politique « Anon can insert page events »)
--
--   Aucun UPDATE/DELETE pour anon, nulle part.
--
-- Ce qui NE change PAS :
--   - authenticated et service_role conservent leurs privilèges actuels.
--   - La RLS reste activée et inchangée sur toutes les tables : même avec le
--     SELECT conservé ci-dessus, anon ne lit que ce que les politiques
--     autorisent (ex. jsc_listings : annonces actives uniquement).
--   - Les lectures publiques de coordonnées de dompes passent par les
--     fonctions SECURITY DEFINER (dompe_public_point = calcul mathématique
--     sans table; blog_search, blog_increment_view, count_active_dumps_by_city
--     = SECURITY DEFINER) : elles s'exécutent avec les droits de leur
--     propriétaire et ne dépendent pas des privilèges anon sur les tables.
--
-- Vérifications AVANT application (obligatoires) :
--   1. Rejouer l'inventaire des politiques : toute politique FOR public ou
--      TO anon sur une table NON listée ci-dessus doit être ajoutée à la
--      liste blanche, sinon la fonctionnalité correspondante casse.
--   2. Parcourir en aperçu : recherche de dompes, fiche dompe, blogue
--      (liste + article), pages SEO locales, formulaires remblai et dompe
--      jusqu'au bouton d'envoi.
-- Vérifications APRÈS application (tests de fumée) : les mêmes parcours sur
-- le site en ligne, en navigation privée (rôle anon réel), plus soumission
-- d'une demande de test réelle UNIQUEMENT sur autorisation expresse.
--
-- Retour arrière : bloc en fin de fichier — redonne à anon l'état actuel
-- (tous privilèges sur toutes les tables public). C'est un retour arrière
-- complet car aucune donnée n'est modifiée par cette migration : seuls des
-- privilèges changent, de façon réversible.
-- ============================================================================

-- 1. Retirer tous les privilèges anon sur toutes les tables du schéma public.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;
END $$;

-- 2. Liste blanche : lectures publiques.
GRANT SELECT ON public.jsc_listings TO anon;
GRANT SELECT ON public.material_families TO anon;
GRANT SELECT ON public.mkt_partner_photos TO anon;
GRANT SELECT ON public.mkt_partner_services TO anon;
GRANT SELECT ON public.mkt_partner_territories TO anon;
GRANT SELECT ON public.mkt_reviews TO anon;
GRANT SELECT ON public.mkt_sender_identity TO anon;
GRANT SELECT ON public.blog_authors TO anon;
GRANT SELECT ON public.blog_categories TO anon;
GRANT SELECT ON public.blog_post_related TO anon;
GRANT SELECT ON public.blog_post_tags TO anon;
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT ON public.blog_seo_links TO anon;
GRANT SELECT ON public.blog_tags TO anon;
GRANT SELECT ON public.jsc_availability TO anon;
GRANT SELECT ON public.jsc_marketplace_reviews TO anon;
GRANT SELECT ON public.material_variants TO anon;
GRANT SELECT ON public.mkt_service_categories TO anon;
GRANT SELECT ON public.seo_cities TO anon;
GRANT SELECT ON public.seo_material_uses TO anon;
GRANT SELECT ON public.seo_materials TO anon;
GRANT SELECT ON public.seo_pages TO anon;
GRANT SELECT ON public.seo_services TO anon;

-- 3. Liste blanche : écritures publiques (formulaires + télémétrie).
GRANT INSERT ON public.submissions TO anon;
GRANT INSERT ON public.transport_requests TO anon;
GRANT INSERT ON public.seo_page_events TO anon;

-- ============================================================================
-- RETOUR ARRIÈRE (à exécuter manuellement si nécessaire) :
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
-- (Redonne l'état actuel, mesuré : anon = arwdDxtm partout.)
-- ============================================================================
