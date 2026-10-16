-- ============================================================
-- PRÉCONTRÔLE — LECTURE SEULE (aucune écriture, aucun droit modifié).
-- Valeurs attendues = relevé du 16 oct. 2026 (13 h 50 UTC, catalogue pg_proc).
-- Ce bloc est AUSSI placé en tête de la proposition de restriction : si un seul
-- écart est observé, l'exception annule toute la migration (même transaction).
-- Comparaison : propriétaire, SECURITY DEFINER, md5 du type de résultat,
-- md5 du corps (prosrc) pour la fonction renommée, ACL triée.
-- ============================================================
DO $pre$
DECLARE
  r record; obs record; ecarts text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.seo_sync_cities_from_territories()', 'postgres', true, 'cd8a1292080b231b3e9a85d440b02023', 'c7870f526ab498d7f2519c2becab3c38',
     '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.seo_optimization_counts()', 'postgres', true, 'cd8a1292080b231b3e9a85d440b02023', NULL,
     '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.seo_optimization_candidates(text,integer,integer)', 'postgres', true, 'bd4c805f32f5b58790a6e289f3e271cd', NULL,
     '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.mkt_compute_commission(uuid)', 'postgres', true, 'ef7c876f00f3acddd00fa671f52d0b1f', NULL,
     '{=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.blog_increment_view(uuid)', 'postgres', true, 'cab8111fd0b710a336c898e539090e34', NULL,
     '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}')
  ) AS t(sig, owner, secdef, res_md5, src_md5, acl) LOOP
    SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef,
           md5(pg_get_function_result(p.oid)) AS res_md5, md5(p.prosrc) AS src_md5,
           array(SELECT x::text FROM unnest(p.proacl) x ORDER BY 1)::text AS acl
      INTO obs FROM pg_proc p WHERE p.oid = to_regprocedure(r.sig);
    IF NOT FOUND THEN ecarts := ecarts || format(E'\n%s : fonction absente', r.sig); CONTINUE; END IF;
    IF obs.owner  <> r.owner  THEN ecarts := ecarts || format(E'\n%s : propriétaire %s ≠ %s', r.sig, obs.owner, r.owner); END IF;
    IF obs.secdef <> r.secdef THEN ecarts := ecarts || format(E'\n%s : SECURITY DEFINER modifié', r.sig); END IF;
    IF obs.res_md5 <> r.res_md5 THEN ecarts := ecarts || format(E'\n%s : type de résultat modifié', r.sig); END IF;
    IF r.src_md5 IS NOT NULL AND obs.src_md5 <> r.src_md5 THEN ecarts := ecarts || format(E'\n%s : corps modifié depuis le relevé', r.sig); END IF;
    IF obs.acl <> r.acl THEN ecarts := ecarts || format(E'\n%s : droits %s ≠ relevé %s', r.sig, obs.acl, r.acl); END IF;
  END LOOP;
  IF to_regprocedure('public.seo_sync_cities_from_territories_impl()') IS NOT NULL THEN
    ecarts := ecarts || E'\nseo_sync_cities_from_territories_impl existe déjà';
  END IF;
  -- Aucun autre objet SQL ne doit appeler la fonction renommée.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%seo_sync_cities_from_territories%'
             AND oid <> to_regprocedure('public.seo_sync_cities_from_territories()')) THEN
    ecarts := ecarts || E'\nune fonction SQL appelle seo_sync_cities_from_territories';
  END IF;
  IF ecarts <> '' THEN
    RAISE EXCEPTION 'ARRÊT — état différent du relevé du 16 oct. :%', ecarts;
  END IF;
END
$pre$;
