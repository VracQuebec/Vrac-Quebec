-- ============================================================
-- RETOUR ARRIÈRE — NON APPLIQUÉ. Annule proposition-restriction-fonctions-anon.
-- 1) s'arrête si l'état courant n'est pas EXACTEMENT celui laissé par la proposition
--    (un relevé ancien ne doit jamais servir à « restaurer » un état différent);
-- 2) rétablit les droits relevés le 16 oct., sans rien ajouter;
-- 3) vérifie que les droits finaux sont identiques au relevé, sinon annule.
-- ============================================================
DO $avant$
DECLARE r record; a text; ecarts text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.seo_sync_cities_from_territories()',     '{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.seo_sync_cities_from_territories_impl()','{postgres=X/postgres}'),
    ('public.seo_optimization_counts()',              '{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.seo_optimization_candidates(text,integer,integer)', '{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.mkt_compute_commission(uuid)',           '{postgres=X/postgres,service_role=X/postgres}'),
    ('public.blog_increment_view(uuid)',              '{postgres=X/postgres,service_role=X/postgres}')
  ) AS t(sig, acl) LOOP
    SELECT array(SELECT x::text FROM unnest(proacl) x ORDER BY 1)::text INTO a
      FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF a IS DISTINCT FROM r.acl THEN ecarts := ecarts || format(E'\n%s : %s ≠ attendu %s', r.sig, coalesce(a,'absente'), r.acl); END IF;
  END LOOP;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.seo_sync_cities_from_territories_impl()')))
     IS DISTINCT FROM 'c7870f526ab498d7f2519c2becab3c38' THEN
    ecarts := ecarts || E'\ncorps de _impl différent du relevé';
  END IF;
  IF ecarts <> '' THEN RAISE EXCEPTION 'ARRÊT retour arrière — état inattendu, nouveau relevé requis :%', ecarts; END IF;
END
$avant$;

DROP FUNCTION public.seo_sync_cities_from_territories();
ALTER FUNCTION public.seo_sync_cities_from_territories_impl() RENAME TO seo_sync_cities_from_territories;
COMMENT ON FUNCTION public.seo_sync_cities_from_territories() IS NULL;
GRANT EXECUTE ON FUNCTION public.seo_sync_cities_from_territories() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seo_optimization_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.seo_optimization_candidates(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.blog_increment_view(uuid) TO anon, authenticated;

DO $apres$
DECLARE r record; a text; ecarts text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.seo_sync_cities_from_territories()', '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.seo_optimization_counts()',          '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.seo_optimization_candidates(text,integer,integer)', '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.mkt_compute_commission(uuid)',       '{=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.blog_increment_view(uuid)',          '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}')
  ) AS t(sig, acl) LOOP
    SELECT array(SELECT x::text FROM unnest(proacl) x ORDER BY 1)::text INTO a FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF a IS DISTINCT FROM r.acl THEN ecarts := ecarts || format(E'\n%s : %s ≠ relevé %s', r.sig, coalesce(a,'absente'), r.acl); END IF;
  END LOOP;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.seo_sync_cities_from_territories()'))) <> 'c7870f526ab498d7f2519c2becab3c38' THEN
    ecarts := ecarts || E'\ncorps restauré différent de l''original';
  END IF;
  IF ecarts <> '' THEN RAISE EXCEPTION 'ARRÊT — droits restaurés différents du relevé (annulé) :%', ecarts; END IF;
END
$apres$;
