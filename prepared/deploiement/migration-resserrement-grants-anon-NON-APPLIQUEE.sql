-- ============================================================================
-- PRÉPARÉE — NE PAS APPLIQUER SANS AUTORISATION (version 2, 16 oct. 2026)
-- Resserrement des privilèges du rôle anon sur le schéma public.
--
-- Relevé en lecture seule du 16 oct. 2026 (production) :
--   * Tables/vues : anon = arwdDxtm sur toutes (sauf material_matching_candidates
--     sans anon, seo_bulk_candidates sans SELECT). RLS activée partout.
--   * 17 vues, TOUTES security_invoker (vérifié une à une) : elles appliquent
--     la RLS des tables sous-jacentes, aucune vue matérialisée.
--   * 18 séquences : anon = rwU (lecture, setval, nextval).
--   * Privilèges PAR DÉFAUT dans public :
--       postgres       → tables r = arwdDxtm, séquences S = rwU, fonctions f = X à anon ;
--       supabase_admin → mêmes défauts (r, S, f) à anon.
--   * Fonctions : 805 SECURITY DEFINER, 194 exécutables par anon, 0 sans
--     search_path. NON modifiées ici (voir section D, décision requise).
--
-- Ce que fait la migration (anon uniquement ; authenticated et service_role
-- inchangés ; RLS et politiques inchangées ; aucune donnée touchée) :
--   A. RELEVÉ EXACT des privilèges actuels dans le schéma privé
--      acl_backup_20261016 (aucun accès anon/authenticated) — base du retour
--      arrière exact (fichier restauration-grants-anon-NON-APPLIQUEE.sql).
--   B. Tables/vues : REVOKE ALL FROM anon partout, puis liste blanche.
--   C. Séquences : REVOKE ALL FROM anon, puis USAGE sur la seule séquence
--      requise par l'insertion publique (submissions_submission_number_seq,
--      utilisée par le Questionnaire de l'accueil qui insère en anon).
--   D. Privilèges par défaut du propriétaire postgres : plus de droits anon
--      automatiques sur les NOUVELLES tables et séquences.
--
-- Liste blanche — justification (politique anon/{public} relevée) :
--   SELECT : blog_authors, blog_categories, blog_post_related, blog_post_tags,
--     blog_posts, blog_seo_links, blog_tags, jsc_availability, jsc_listings,
--     jsc_marketplace_reviews, material_families, material_variants,
--     mkt_partner_photos, mkt_partner_services, mkt_partner_territories,
--     mkt_reviews, mkt_sender_identity, mkt_service_categories, seo_cities,
--     seo_material_uses, seo_materials, seo_pages, seo_services ;
--   SELECT (dépendances) : jsc_marketplace_profiles, mkt_partners — lues par
--     les politiques de jsc_availability / mkt_partner_* et par les vues
--     security_invoker ; sans ce droit, ces lectures publiques passeraient de
--     « 0 ligne » à « permission refusée » (aucune politique anon sur elles :
--     anon n'y lit toujours rien) ;
--   SELECT (vues publiques) : jsc_listings_public (PlaceDeMarche),
--     jsc_marketplace_profiles_public (Reseau, ReseauProfil), mkt_partners_public ;
--   INSERT : submissions (Questionnaire de l'accueil et pages SEO),
--     transport_requests, seo_page_events (télémétrie).
--
-- Tables de courriel (email_send_log, email_send_state,
-- email_unsubscribe_tokens, suppressed_emails) : politiques FOR public mais
-- USING / WITH CHECK = auth.role() = 'service_role'. Un visiteur anonyme NE
-- PEUT PAS y insérer ni lire (vérifié : aucun chemin anon). Le retrait des
-- droits SQL anon est une défense en profondeur, sans effet fonctionnel.
--
-- LIMITES (à ne pas surestimer) :
--   * Les défauts de supabase_admin ne peuvent pas être modifiés par le rôle
--     de migration (postgres n'est pas membre de supabase_admin) : un objet
--     créé par supabase_admin dans public héritera encore des droits anon.
--   * Les fonctions ne sont pas resserrées (194 exécutables par anon) :
--     certaines sont des RPC publiques légitimes (blog_search,
--     jsc_public_*, vrac_public_*, entcrm_public_*, count_active_dumps_by_city,
--     dompe_public_point, site_chat_poll…). Inventaire fonction par fonction
--     requis avant toute décision (section D, commentée).
--   * Après application, toute nouvelle table publique devra recevoir un
--     GRANT anon explicite si une page publique la lit (règle déjà en vigueur).
--
-- Échec volontaire si un objet de la liste blanche a disparu (pas de
-- resserrement partiel silencieux). Ré-exécutable (idempotente) : le relevé
-- n'est pris qu'une seule fois (le premier état est conservé).
-- ============================================================================

-- A. Relevé exact ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS acl_backup_20261016;
REVOKE ALL ON SCHEMA acl_backup_20261016 FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS acl_backup_20261016.relations (
  relname text PRIMARY KEY, relkind "char" NOT NULL, relacl aclitem[], taken_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS acl_backup_20261016.default_acls (
  owner_role text NOT NULL, objtype "char" NOT NULL, defaclacl aclitem[], taken_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_role, objtype)
);
REVOKE ALL ON ALL TABLES IN SCHEMA acl_backup_20261016 FROM PUBLIC, anon, authenticated;

INSERT INTO acl_backup_20261016.relations (relname, relkind, relacl)
SELECT c.relname, c.relkind, c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
   -- Relevé pris UNE SEULE FOIS : une ré-exécution n'y ajoute jamais
   -- l'état déjà resserré ni les objets créés ensuite.
   AND NOT EXISTS (SELECT 1 FROM acl_backup_20261016.relations);

INSERT INTO acl_backup_20261016.default_acls (owner_role, objtype, defaclacl)
SELECT d.defaclrole::regrole::text, d.defaclobjtype, d.defaclacl
  FROM pg_default_acl d
 WHERE d.defaclnamespace = 'public'::regnamespace
   AND NOT EXISTS (SELECT 1 FROM acl_backup_20261016.default_acls);

-- B. Tables et vues ----------------------------------------------------------
DO $$
DECLARE
  t record;
  sel text[] := ARRAY[
    'blog_authors','blog_categories','blog_post_related','blog_post_tags','blog_posts','blog_seo_links','blog_tags',
    'jsc_availability','jsc_listings','jsc_marketplace_reviews','material_families','material_variants',
    'mkt_partner_photos','mkt_partner_services','mkt_partner_territories','mkt_reviews','mkt_sender_identity',
    'mkt_service_categories','seo_cities','seo_material_uses','seo_materials','seo_pages','seo_services',
    'jsc_marketplace_profiles','mkt_partners',
    'jsc_listings_public','jsc_marketplace_profiles_public','mkt_partners_public'];
  ins text[] := ARRAY['submissions','transport_requests','seo_page_events'];
  x text;
BEGIN
  FOREACH x IN ARRAY sel || ins LOOP
    IF to_regclass('public.' || quote_ident(x)) IS NULL THEN
      RAISE EXCEPTION 'Liste blanche : objet public.% introuvable — migration arrêtée', x;
    END IF;
  END LOOP;

  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.relname);
  END LOOP;

  FOREACH x IN ARRAY sel LOOP EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', x); END LOOP;
  FOREACH x IN ARRAY ins LOOP EXECUTE format('GRANT INSERT ON TABLE public.%I TO anon', x); END LOOP;
END $$;

-- C. Séquences ---------------------------------------------------------------
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'S'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', s.relname);
  END LOOP;
END $$;
GRANT USAGE ON SEQUENCE public.submissions_submission_number_seq TO anon;

-- D. Privilèges par défaut (propriétaire postgres seulement) -----------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
-- Fonctions : NON appliqué — décision requise (une RPC publique future
-- devrait alors recevoir GRANT EXECUTE ... TO anon explicitement).
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Retour arrière : voir restauration-grants-anon-NON-APPLIQUEE.sql
-- (restaure EXACTEMENT le relevé A ; jamais de GRANT ALL ON ALL TABLES).
