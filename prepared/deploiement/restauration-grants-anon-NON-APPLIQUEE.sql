-- ============================================================================
-- RETOUR ARRIÈRE EXACT de migration-resserrement-grants-anon (v2).
-- NE PAS EXÉCUTER SANS AUTORISATION.
-- Restaure, pour le rôle anon UNIQUEMENT, les privilèges relevés dans
-- acl_backup_20261016 au moment de la migration :
--   * objets existants AVANT l'opération : privilèges anon remis à
--     l'identique (aucun privilège plus large que l'état initial) ;
--   * objets créés APRÈS l'opération : non touchés (listés par NOTICE) ;
--   * objets supprimés depuis : ignorés (NOTICE) ;
--   * privilèges par défaut du propriétaire postgres : remis à l'identique.
-- authenticated / service_role : jamais modifiés par ce script.
-- ============================================================================
DO $$
DECLARE
  r record; a record; kw text; privs text;
BEGIN
  IF to_regclass('acl_backup_20261016.relations') IS NULL THEN
    RAISE EXCEPTION 'Relevé acl_backup_20261016 absent : restauration impossible';
  END IF;

  FOR r IN SELECT * FROM acl_backup_20261016.relations LOOP
    IF to_regclass('public.' || quote_ident(r.relname)) IS NULL THEN
      RAISE NOTICE 'Objet supprimé depuis le relevé, ignoré : %', r.relname; CONTINUE;
    END IF;
    kw := CASE WHEN r.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END;
    EXECUTE format('REVOKE ALL ON %s public.%I FROM anon', kw, r.relname);
    SELECT string_agg(e.privilege_type, ', ') INTO privs
      FROM aclexplode(coalesce(r.relacl, '{}'::aclitem[])) e
     WHERE e.grantee = 'anon'::regrole;
    IF privs IS NOT NULL THEN
      EXECUTE format('GRANT %s ON %s public.%I TO anon', privs, kw, r.relname);
    END IF;
  END LOOP;

  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S')
              AND c.relname NOT IN (SELECT relname FROM acl_backup_20261016.relations) LOOP
    RAISE NOTICE 'Objet créé après le relevé, non modifié : %', r.relname;
  END LOOP;

  FOR a IN SELECT * FROM acl_backup_20261016.default_acls WHERE owner_role = 'postgres' AND objtype IN ('r','S') LOOP
    kw := CASE a.objtype WHEN 'r' THEN 'TABLES' ELSE 'SEQUENCES' END;
    SELECT string_agg(e.privilege_type, ', ') INTO privs
      FROM aclexplode(coalesce(a.defaclacl, '{}'::aclitem[])) e WHERE e.grantee = 'anon'::regrole;
    IF privs IS NOT NULL THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT %s ON %s TO anon', privs, kw);
    END IF;
  END LOOP;
END $$;
-- Le schéma acl_backup_20261016 est CONSERVÉ (preuve et ré-exécution possible).
