#!/usr/bin/env bash
# Test RÉEL sur base PostgreSQL JETABLE locale (aucune connexion à la production).
# Fonctions fictives; empreintes forcées pour reproduire le relevé du 16 oct.
set -uo pipefail
D_PREP=$(cd "$(dirname "$0")/.." && pwd)
if [ "$(id -u)" = 0 ]; then
  for f in proposition-restriction-fonctions-anon-NON-APPLIQUEE.sql retour-arriere-restriction-fonctions-NON-APPLIQUE.sql; do cp "$D_PREP/$f" /tmp/$f; chmod 644 /tmp/$f; done
  cp "$0" /tmp/restriction-pg.sh; chmod 644 /tmp/restriction-pg.sh
  exec setpriv --reuid=1000 --regid=1000 --clear-groups env PATH="$PATH" HOME=/tmp SQLDIR=/tmp bash /tmp/restriction-pg.sh
fi
SQLDIR=${SQLDIR:-$D_PREP}; PROP=$SQLDIR/proposition-restriction-fonctions-anon-NON-APPLIQUEE.sql; RB=$SQLDIR/retour-arriere-restriction-fonctions-NON-APPLIQUE.sql
PASS=0; FAIL=0
check(){ if [ "$2" = "$3" ]; then echo "  OK    $1"; PASS=$((PASS+1)); else echo "  ÉCHEC $1 (attendu « $3 », obtenu « $2 »)"; FAIL=$((FAIL+1)); fi; }
boot(){
  D=$(mktemp -d); export PGHOST=$D PGPORT=54340 PGUSER=postgres PGDATABASE=postgres
  initdb -D $D/d -U postgres -A trust >/dev/null; pg_ctl -D $D/d -o "-k $D -p 54340 -c listen_addresses=''" -l $D/l start >/dev/null
  for _ in $(seq 50); do pg_isready -q && break; sleep 0.1; done
  # Corps choisis pour que md5(prosrc) = empreinte relevée n'est pas reproductible :
  # on remplace l'empreinte attendue par celle de la fonction fictive (sed sur copie).
  psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE SCHEMA auth; CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles(user_id uuid, role app_role);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('t.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE FUNCTION public.has_role(u uuid, r app_role) RETURNS bool LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT exists(SELECT 1 FROM user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.seo_sync_cities_from_territories() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN '{"ok":1}'; END $$;
CREATE FUNCTION public.seo_optimization_counts() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'select ''{}''::jsonb';
CREATE FUNCTION public.seo_optimization_candidates(text,integer,integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'select ''{}''::jsonb';
CREATE FUNCTION public.mkt_compute_commission(uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'select null::uuid';
CREATE FUNCTION public.blog_increment_view(uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS '';
REVOKE EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) FROM anon, authenticated; GRANT EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) TO PUBLIC;
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-000000000001','admin');
SQL
  # Adapter les empreintes (type/corps) aux fonctions fictives, droits et propriétaires inchangés.
  SRC=$(psql -X -Atc "select md5(prosrc) from pg_proc where proname='seo_sync_cities_from_territories'")
  CAND=$(psql -X -Atc "select md5(pg_get_function_result('public.seo_optimization_candidates(text,integer,integer)'::regprocedure))")
  MKT=$(psql -X -Atc "select md5(pg_get_function_result('public.mkt_compute_commission(uuid)'::regprocedure))")
  BLOG=$(psql -X -Atc "select md5(pg_get_function_result('public.blog_increment_view(uuid)'::regprocedure))")
  sed -e "s/c7870f526ab498d7f2519c2becab3c38/$SRC/g" -e "s/bd4c805f32f5b58790a6e289f3e271cd/$CAND/" -e "s/ef7c876f00f3acddd00fa671f52d0b1f/$MKT/" -e "s/cab8111fd0b710a336c898e539090e34/$BLOG/" "$PROP" > $D/prop.sql
  sed -e "s/c7870f526ab498d7f2519c2becab3c38/$SRC/g" "$RB" > $D/rb.sql
}
stop(){ pg_ctl -D $D/d -m immediate stop >/dev/null 2>&1; rm -rf $D; }
q(){ psql -X -Atqc "$1" 2>&1 | tail -1; }
acl(){ q "select array(select x::text from unnest(proacl) x order by 1)::text from pg_proc where oid=to_regprocedure('$1')"; }
run(){ psql -X -q -1 -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>$D/err && echo ok || echo erreur; }

echo "Scénario 1 : application, garde admin, retour arrière exact"
boot
AV=$(for f in 'public.seo_sync_cities_from_territories()' 'public.seo_optimization_counts()' 'public.seo_optimization_candidates(text,integer,integer)' 'public.mkt_compute_commission(uuid)' 'public.blog_increment_view(uuid)'; do acl "$f"; done)
check "migration appliquée" "$(run $D/prop.sql)" ok
check "anon refusé" "$(q "set role anon; select public.seo_sync_cities_from_territories()" | grep -c 'permission denied')" 1
check "connecté non admin refusé" "$(q "set t.uid='00000000-0000-0000-0000-000000000002'; set role authenticated; select public.seo_sync_cities_from_territories()" | grep -c 'Accès refusé')" 1
check "service_role refusé (pas d'identité)" "$(q "set role service_role; select public.seo_sync_cities_from_territories()" | grep -c 'Accès refusé')" 1
check "admin accepté" "$(q "set t.uid='00000000-0000-0000-0000-000000000001'; set role authenticated; select public.seo_sync_cities_from_territories()")" '{"ok": 1}'
check "_impl inaccessible même à l'admin" "$(q "set t.uid='00000000-0000-0000-0000-000000000001'; set role authenticated; select public.seo_sync_cities_from_territories_impl()" | grep -c 'permission denied')" 1
check "droits par défaut neutralisés sur l'enveloppe" "$(acl 'public.seo_sync_cities_from_territories()')" '{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'
check "retour arrière appliqué" "$(run $D/rb.sql)" ok
AP=$(for f in 'public.seo_sync_cities_from_territories()' 'public.seo_optimization_counts()' 'public.seo_optimization_candidates(text,integer,integer)' 'public.mkt_compute_commission(uuid)' 'public.blog_increment_view(uuid)'; do acl "$f"; done)
check "droits identiques avant/après" "$AV" "$AP"
check "_impl disparue" "$(q "select to_regprocedure('public.seo_sync_cities_from_territories_impl()') is null")" t
stop

echo "Scénario 2 : droits différents du relevé → migration annulée, rien modifié"
boot
psql -X -qc "REVOKE EXECUTE ON FUNCTION public.blog_increment_view(uuid) FROM authenticated"
B=$(acl 'public.seo_sync_cities_from_territories()')
check "migration refusée" "$(run $D/prop.sql)" erreur
check "message d'arrêt" "$(grep -c 'ARRÊT' $D/err)" 1
check "aucun changement (transaction annulée)" "$(acl 'public.seo_sync_cities_from_territories()')" "$B"
check "_impl non créée" "$(q "select to_regprocedure('public.seo_sync_cities_from_territories_impl()') is null")" t
stop

echo "Scénario 3 : retour arrière sur un état qui a dérivé → refusé, rien modifié"
boot
run $D/prop.sql >/dev/null
psql -X -qc "GRANT EXECUTE ON FUNCTION public.seo_optimization_counts() TO anon"
check "retour arrière refusé" "$(run $D/rb.sql)" erreur
check "message d'arrêt" "$(grep -c 'ARRÊT retour arrière' $D/err)" 1
check "enveloppe toujours en place" "$(q "select to_regprocedure('public.seo_sync_cities_from_territories_impl()') is not null")" t
stop

echo "Scénario 4 : propriétaire différent → migration annulée"
boot
psql -X -qc "CREATE ROLE autre; ALTER FUNCTION public.seo_sync_cities_from_territories() OWNER TO autre"
check "migration refusée" "$(run $D/prop.sql)" erreur
check "motif propriétaire" "$(grep -c 'propriétaire' $D/err)" 1
stop
echo "Résultat : $PASS réussis, $FAIL échoués"; [ $FAIL = 0 ]
