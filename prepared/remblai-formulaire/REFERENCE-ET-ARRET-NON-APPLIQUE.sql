-- PRÉPARATION UNIQUEMENT : contrôle sans modification, pas une migration.
-- Référence réelle lue le 22 octobre 2026 à 22:39 UTC ; aucune demande lue.
-- À composer avec le paquet final ; ce contrôle ne prépare ni n'exécute l'inverse.
-- Les correctifs 0231/0232 changent l'empreinte : après leur composition locale,
-- épingler les empreintes intermédiaires exactes, ne pas enlever ce verrou.
DO $reference$
BEGIN
 IF md5(pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure)) <> '2da0b80649cfacf5db57fe559adab3c2'
 OR md5(pg_get_functiondef('public.exec01_projection(uuid,boolean)'::regprocedure)) <> 'e4cec3f904e15ec6ef264a22f71298c1'
 THEN RAISE EXCEPTION 'reference_exacte_inconnue_STOP'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN ('public.exec01_dispatch(jsonb)'::regprocedure,'public.exec01_projection(uuid,boolean)'::regprocedure)
  AND (NOT p.prosecdef OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}'))
 THEN RAISE EXCEPTION 'droits_reference_inconnus_STOP'; END IF;
END $reference$;