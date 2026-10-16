#!/usr/bin/env bash
# ============================================================================
# Test RÉEL PostgreSQL de la migration anti-doublon — base JETABLE locale.
# Crée un cluster PostgreSQL temporaire dans /tmp (aucune connexion à la
# production : PGHOST/PGUSER… sont écrasés), applique la migration préparée,
# puis exécute des requêtes concurrentes sur des CONNEXIONS DISTINCTES
# (processus psql séparés) — comme deux instances Edge différentes.
# Usage : bash prepared/deploiement/tests/concurrence-pg.sh
# ============================================================================
set -euo pipefail
# PostgreSQL refuse de s'exécuter en root : relance sous un compte non privilégié.
if [ "$(id -u)" = 0 ]; then
  cp "$0" /tmp/concurrence-pg.sh; cp "$(dirname "$0")/../migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql" /tmp/mig-anti-doublon.sql
  chmod 644 /tmp/concurrence-pg.sh /tmp/mig-anti-doublon.sql
  exec setpriv --reuid=nobody --regid=nogroup --clear-groups env MIG=/tmp/mig-anti-doublon.sql PATH="$PATH" HOME=/tmp bash /tmp/concurrence-pg.sh
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="${MIG:-$HERE/../migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql}"
DIR="$(mktemp -d /tmp/pgtest.XXXX)"
PORT=54329
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE
export PGHOST="$DIR" PGPORT=$PORT PGUSER=postgres PGDATABASE=postgres
cleanup() { pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

initdb -D "$DIR/data" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR/data" -o "-k $DIR -p $PORT -c listen_addresses=''" -l "$DIR/log" start >/dev/null
for _ in $(seq 1 50); do pg_isready -q && break; sleep 0.1; done

q() { psql -X -v ON_ERROR_STOP=1 -Atqc "$1"; }
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  OK   $1"; PASS=$((PASS+1)); else echo "  ÉCHEC $1 (attendu « $3 », obtenu « $2 »)"; FAIL=$((FAIL+1)); fi; }

# Copie fidèle de la structure de production (relevée le 16 oct. 2026).
q "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
   CREATE TABLE public.public_request_guard (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scope text NOT NULL,
     identity text NOT NULL, fingerprint text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
   CREATE TABLE public.submissions_test (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fp text, created_at timestamptz DEFAULT now());"

echo "== Application de la migration"
psql -X -v ON_ERROR_STOP=1 -q -f "$MIG"
echo "== Ré-application (idempotence)"
psql -X -v ON_ERROR_STOP=1 -q -f "$MIG" && check "migration ré-exécutable" ok ok

echo "== Validation des paramètres (échec explicite, aucune écriture)"
for args in "'s','i','',  '{}',30,120" "'s','i','   ','{}',30,120" "'s','i',NULL,'{}',30,120" \
            "'s','i','f','{}',0,120" "'s','i','f','{}',-5,120" "'s','i','f','{}',1441,120" \
            "'s','i','f','{}',NULL,120" "'','i','f','{}',30,120" "'s','i','f','[]',30,120" "'s','i','f','{}',30,5"; do
  if q "select public.guard_claim($args)" >/dev/null 2>&1; then check "refus guard_claim($args)" accepté refusé; else check "refus guard_claim($args)" refusé refusé; fi
done
if q "select public.guard_check_and_log('s','i','  ','{}',30)" >/dev/null 2>&1; then check "refus v1 empreinte vide" accepté refusé; else check "refus v1 empreinte vide" refusé refusé; fi
if q "select public.guard_check_and_log('s','i','f','{}',2000)" >/dev/null 2>&1; then check "refus v1 durée 2000" accepté refusé; else check "refus v1 durée 2000" refusé refusé; fi
check "aucune écriture après refus" "$(q 'select count(*) from public_request_guard')" 0
check "bornes acceptées 1 et 1440" "$(q "select (public.guard_claim('b','i','f1','{}',1,10)->>'state')||(public.guard_claim('b','i','f2','{}',1440,3600)->>'state')")" newnew
q "truncate public_request_guard"

echo "== Permissions EXECUTE"
for f in "guard_claim(text,text,text,jsonb,integer,integer)" "guard_complete(uuid,jsonb)" "guard_release(uuid,text)" "guard_check_and_log(text,text,text,jsonb,integer)"; do
  check "anon ne peut pas exécuter $f" "$(q "select has_function_privilege('anon','public.$f','execute')")" f
  check "authenticated ne peut pas exécuter $f" "$(q "select has_function_privilege('authenticated','public.$f','execute')")" f
  check "service_role peut exécuter $f" "$(q "select has_function_privilege('service_role','public.$f','execute')")" t
  check "search_path fixé $f" "$(q "select array_to_string(proconfig,',') from pg_proc where oid='public.$f'::regprocedure")" "search_path=public"
done

# Simulation fidèle de submit-parcours : 3 transactions séparées comme en
# production (claim → création lente → complete), une connexion par appel.
worker() { # $1 = empreinte, $2 = délai de création (s), $3 = échouer (0/1)
  local out st id sid
  out=$(q "select public.guard_claim('parcours-reception','client','$1','{}',30,120)")
  st=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['state'])" "$out")
  id=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['claim_id'])" "$out")
  if [ "$st" = "new" ]; then
    sleep "$2"
    if [ "$3" = "1" ]; then q "select public.guard_release('$id','create_failed')" >/dev/null; echo "failed"; return; fi
    sid=$(q "insert into submissions_test(fp) values('$1') returning id")
    q "select public.guard_complete('$id', jsonb_build_object('submission_id','$sid'))" >/dev/null
    echo "created:$sid"
  elif [ "$st" = "duplicate" ]; then
    echo "duplicate:$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['result']['submission_id'])" "$out")"
  else echo "$st"; fi
}

echo "== 2 requêtes identiques simultanées (connexions distinctes)"
R=$( (worker fpA 1 0 & worker fpA 1 0 & wait) | sort | tr '\n' ' ')
check "1 création + 1 en cours" "$(echo "$R" | grep -o 'created' | wc -l)/$(echo "$R" | grep -o 'in_progress' | wc -l)" "1/1"
check "1 seule demande en base" "$(q "select count(*) from submissions_test where fp='fpA'")" 1
SID=$(q "select id from submissions_test where fp='fpA'")
check "nouvelle tentative → référence exacte" "$(worker fpA 0 0)" "duplicate:$SID"

echo "== 5 requêtes identiques simultanées"
R=$( (for _ in 1 2 3 4 5; do worker fpB 1 0 & done; wait) | sort | tr '\n' ' ')
check "1 création + 4 en cours" "$(echo "$R" | grep -o 'created' | wc -l)/$(echo "$R" | grep -o 'in_progress' | wc -l)" "1/4"
check "1 seule demande en base" "$(q "select count(*) from submissions_test where fp='fpB'")" 1

echo "== 2 demandes différentes, même courriel, simultanées"
R=$( (worker fpC1 1 0 & worker fpC2 1 0 & wait) | grep -c created)
check "2 créations distinctes" "$R" 2

echo "== Échec de création puis nouvelle tentative"
check "1er essai échoue" "$(worker fpD 0 1)" failed
check "nouvelle tentative créée (pas de faux doublon)" "$(worker fpD 0 0 | cut -d: -f1)" created
check "1 seule demande" "$(q "select count(*) from submissions_test where fp='fpD'")" 1

echo "== Fenêtre de 30 minutes (horodatage vieilli dans la base jetable)"
q "update public_request_guard set created_at = now() - interval '31 minutes' where fingerprint='fpA'"
check "après 31 min : nouvelle demande" "$(worker fpA 0 0 | cut -d: -f1)" created
q "update public_request_guard set created_at = now() - interval '5 days' where fingerprint='fpB'"
check "après 5 jours : nouvelle demande" "$(worker fpB 0 0 | cut -d: -f1)" created

echo "== guard_complete : réservation exacte uniquement"
if q "select public.guard_complete(gen_random_uuid(), '{\"submission_id\":\"x\"}')" >/dev/null 2>&1; then check "réservation inconnue refusée" accepté refusé; else check "réservation inconnue refusée" refusé refusé; fi
CID=$(q "select id from public_request_guard where payload->>'state'='done' limit 1")
if q "select public.guard_complete('$CID', '{\"submission_id\":\"autre\"}')" >/dev/null 2>&1; then check "double confirmation refusée" accepté refusé; else check "double confirmation refusée" refusé refusé; fi
if q "select public.guard_complete('$CID', '{}')" >/dev/null 2>&1; then check "résultat sans référence refusé" accepté refusé; else check "résultat sans référence refusé" refusé refusé; fi

echo "== Retour arrière"
q "DROP FUNCTION IF EXISTS public.guard_release(uuid, text); DROP FUNCTION IF EXISTS public.guard_complete(uuid, jsonb);
   DROP FUNCTION IF EXISTS public.guard_claim(text, text, text, jsonb, integer, integer);
   DROP FUNCTION IF EXISTS public.guard_check_and_log(text, text, text, jsonb, integer);
   DROP FUNCTION IF EXISTS public.guard_validate_params(text, text, text, integer);"
check "fonctions retirées" "$(q "select count(*) from pg_proc where proname like 'guard\_%'")" 0
check "journal conservé" "$(q "select (count(*)>0)::text from public_request_guard")" true

echo "RÉSULTAT : $PASS réussis, $FAIL échecs"
[ "$FAIL" = 0 ]
