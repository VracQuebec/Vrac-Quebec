-- ============================================================================
-- INVENTAIRE EN LECTURE SEULE des privilèges (aucune écriture).
-- À exécuter avant ET après chaque migration de permissions ; comparer les
-- sorties. Chaque requête est un SELECT pur.
-- ============================================================================

-- 1. Tables, vues, vues matérialisées, tables étrangères : ACL + RLS + invoker
SELECT c.relname, c.relkind, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_force,
       c.reloptions, c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
 ORDER BY c.relkind, c.relname;

-- 2. Privilèges effectifs anon / authenticated par objet
SELECT c.relname, r.rolname,
       has_table_privilege(r.oid, c.oid, 'SELECT') sel, has_table_privilege(r.oid, c.oid, 'INSERT') ins,
       has_table_privilege(r.oid, c.oid, 'UPDATE') upd, has_table_privilege(r.oid, c.oid, 'DELETE') del,
       has_table_privilege(r.oid, c.oid, 'TRUNCATE') trunc
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 CROSS JOIN pg_roles r
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f') AND r.rolname IN ('anon','authenticated')
 ORDER BY 1, 2;

-- 3. Vues : définition et dépendances
SELECT v.relname AS vue, r.relname AS depend_de, v.reloptions
  FROM pg_rewrite rw JOIN pg_class v ON v.oid = rw.ev_class
  JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
  JOIN pg_class r ON r.oid = d.refobjid AND r.oid <> v.oid
  JOIN pg_namespace n ON n.oid = v.relnamespace
 WHERE n.nspname = 'public' AND v.relkind IN ('v','m')
 GROUP BY 1, 2, 3 ORDER BY 1, 2;

-- 4. Séquences
SELECT c.relname, c.relacl,
       has_sequence_privilege('anon', c.oid, 'USAGE') anon_usage,
       has_sequence_privilege('anon', c.oid, 'UPDATE') anon_setval
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY 1;

-- 5. Fonctions : EXECUTE, SECURITY DEFINER, search_path
SELECT p.oid::regprocedure AS fonction, p.prosecdef AS security_definer,
       (SELECT c FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%') AS search_path,
       has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' ORDER BY anon_exec DESC, 1;

-- 6. Privilèges par défaut, par rôle propriétaire et schéma
SELECT d.defaclrole::regrole AS proprietaire, d.defaclnamespace::regnamespace AS schema,
       d.defaclobjtype AS type, d.defaclacl
  FROM pg_default_acl d ORDER BY 1, 2, 3;

-- 7. Appartenance aux rôles (droits hérités)
SELECT r.rolname AS role, m.rolname AS membre_de
  FROM pg_auth_members am JOIN pg_roles r ON r.oid = am.member JOIN pg_roles m ON m.oid = am.roleid
 WHERE r.rolname IN ('anon','authenticated','service_role','authenticator') ORDER BY 1, 2;

-- 8. Politiques RLS complètes (USING / WITH CHECK)
SELECT c.relname, p.polname, p.polcmd, p.polpermissive,
       coalesce(nullif(array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)), ','), ''), 'public') AS roles,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' ORDER BY 1, 2;

-- 9. Tables publiques SANS RLS (doit être vide)
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
