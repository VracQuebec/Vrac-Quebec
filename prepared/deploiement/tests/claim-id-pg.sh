#!/usr/bin/env bash
# ============================================================================
# Test RÉEL PostgreSQL de guard_claim_id (anti-doublon durable) — base JETABLE locale.
# Crée un cluster PostgreSQL temporaire dans /tmp (aucune connexion à la
# production : PGHOST/PGUSER… sont écrasés), applique la migration préparée,
# puis exécute des requêtes concurrentes sur des CONNEXIONS DISTINCTES
# (processus psql séparés) — comme deux instances Edge différentes.
# Usage : bash prepared/deploiement/tests/concurrence-pg.sh
# ============================================================================
set -euo pipefail
# PostgreSQL refuse de s'exécuter en root : relance sous un compte non privilégié.
if [ "$(id -u)" = 0 ]; then
  D="$(dirname "$0")/.."; cp "$0" /tmp/claim-id-pg.sh; cp "$D/migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql" /tmp/mig-anti-doublon.sql; cp "$D/migration-guard-claim-id-NON-APPLIQUEE.sql" /tmp/mig-claim-id.sql
  chmod 644 /tmp/claim-id-pg.sh /tmp/mig-anti-doublon.sql /tmp/mig-claim-id.sql
  exec setpriv --reuid=1000 --regid=1000 --clear-groups env MIG=/tmp/mig-anti-doublon.sql MIG2=/tmp/mig-claim-id.sql PATH="$PATH" HOME=/tmp bash /tmp/claim-id-pg.sh
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="${MIG:-$HERE/../migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql}"
MIG2="${MIG2:-$HERE/../migration-guard-claim-id-NON-APPLIQUEE.sql}"
DIR="$(mktemp -d /tmp/pgtest.XXXX)"
PORT=54331
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
   CREATE TABLE public.submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fp text, created_at timestamptz DEFAULT now());
   CREATE TABLE public.jsc_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fp text, created_at timestamptz DEFAULT now());
   CREATE TABLE public.email_log_test (id serial, sid uuid);"


psql -X -v ON_ERROR_STOP=1 -q -f "$MIG"
psql -X -v ON_ERROR_STOP=1 -q -f "$MIG2"
psql -X -v ON_ERROR_STOP=1 -q -f "$MIG2" && check "migration guard_claim_id ré-exécutable" ok ok
check "colonnes nullables ajoutées" "$(q "select count(*) from information_schema.columns where column_name='guard_claim_id' and is_nullable='YES'")" 2
q "insert into submissions(fp) values('historique')"
check "historique intact (guard_claim_id NULL)" "$(q "select count(*) from submissions where guard_claim_id is null")" 1

PEND=${PEND:-600}
J() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(d.get(sys.argv[2]) or '')" "$1" "$2"; }
# Simulation de runClaimedCreate, une connexion psql par appel.
# $1 empreinte, $2 point d'arrêt : none | after_claim | after_insert | fail, $3 table
worker() {
  local fp=$1 stop=${2:-none} t=${3:-submissions} out st id stale sid
  out=$(q "select public.guard_claim('scope','client','$fp','{}',30,$PEND)")
  st=$(J "$out" state); id=$(J "$out" claim_id); stale=$(J "$out" stale_claim_id)
  [ "$st" = duplicate ] && { echo "duplicate:$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['result']['submission_id'])" "$out")"; return; }
  [ "$st" = new ] || { echo "$st"; return; }
  if [ -n "$stale" ]; then
    sid=$(q "select id from $t where guard_claim_id='$stale'")
    if [ -n "$sid" ]; then
      q "select public.guard_complete('$stale', jsonb_build_object('submission_id','$sid'))" >/dev/null
      q "select public.guard_release('$id','orphan_found')" >/dev/null
      echo "recovered:$sid"; return
    fi
  fi
  [ "$stop" = after_claim ] && { echo "crashed"; return; }
  [ "$stop" = fail ] && { q "select public.guard_release('$id','create_failed')" >/dev/null; echo failed; return; }
  sleep "${SLOW:-0}"
  sid=$(q "insert into $t(fp, guard_claim_id) values('$fp','$id') returning id")
  [ "$stop" = after_insert ] && { echo "crashed"; return; }
  q "select public.guard_complete('$id', jsonb_build_object('submission_id','$sid'))" >/dev/null
  q "insert into email_log_test(sid) values('$sid')"
  echo "created:$sid"
}
age() { q "update public_request_guard set created_at = created_at - interval '$2 seconds' where fingerprint='$1'"; }
rows() { q "select count(*) from ${2:-submissions} where fp='$1'"; }
mails() { q "select count(*) from email_log_test e join ${2:-submissions} s on s.id=e.sid where s.fp='$1'"; }

echo "== 1. Arrêt du serveur après réservation (avant création)"
check "arrêt simulé" "$(worker A after_claim)" crashed
check "reprise immédiate : « en cours », pas de faux succès" "$(worker A)" in_progress
age A 601
check "après 10 min : nouvelle création" "$(worker A | cut -d: -f1)" created
check "1 seule demande" "$(rows A)" 1

echo "== 2. Arrêt après création, avant confirmation"
check "arrêt simulé" "$(worker B after_insert)" crashed
check "reprise dans la fenêtre : « en cours »" "$(worker B)" in_progress
age B 601
SB=$(q "select id from submissions where fp='B'")
check "reprise après fenêtre : demande EXACTE retrouvée" "$(worker B)" "recovered:$SB"
check "1 seule demande" "$(rows B)" 1
check "aucun courriel envoyé à la reprise" "$(mails B)" 0
check "réservation d'origine confirmée → répétition = doublon exact" "$(worker B)" "duplicate:$SB"

echo "== 3. Création plus longue que l'ancien délai (130 s)"
check "réservation en cours" "$( (SLOW=2 worker C &) ; sleep 0.5; age C 130; worker C)" in_progress
sleep 2
check "1 seule demande (fenêtre 600 s)" "$(rows C)" 1
check "contrôle : avec l'ancienne fenêtre 120 s ce cas aurait été accepté" "$(PEND=120 bash -c 'true'; q "select (now() - created_at > interval '120 seconds')::text from public_request_guard where fingerprint='C' limit 1")" true

echo "== 4. Cinq requêtes identiques simultanées (connexions distinctes)"
R=$( (for _ in 1 2 3 4 5; do SLOW=1 worker D & done; wait) | sort | tr '\n' ' ')
check "1 création + 4 en cours" "$(echo "$R" | grep -o created | wc -l)/$(echo "$R" | grep -o in_progress | wc -l)" "1/4"
check "1 seule demande" "$(rows D)" 1
check "1 seul courriel" "$(mails D)" 1

echo "== 5. Reprise après échec"
check "échec" "$(worker E fail)" failed
check "nouvelle tentative créée" "$(worker E | cut -d: -f1)" created
check "1 seule demande" "$(rows E)" 1

echo "== 6. Plusieurs demandes avec les mêmes détails"
q "insert into submissions(fp, guard_claim_id) values('F', gen_random_uuid()), ('F', gen_random_uuid())"
check "arrêt après création" "$(worker F after_insert)" crashed
age F 601
SF=$(q "select s.id from submissions s join public_request_guard g on g.id=s.guard_claim_id where s.fp='F' and g.payload->>'state'='pending'")
check "reprise : SEULE la demande de cette réservation est renvoyée" "$(worker F)" "recovered:$SF"
check "aucune demande ajoutée (3 au total)" "$(rows F)" 3

echo "== 7. Index unique : une réservation = une demande"
CID=$(q "select guard_claim_id from submissions where fp='A' and guard_claim_id is not null limit 1")
if q "insert into submissions(fp, guard_claim_id) values('A','$CID')" >/dev/null 2>&1; then check "seconde insertion refusée" acceptée refusée; else check "seconde insertion refusée" refusée refusée; fi

echo "== 8. Achat de vrac (jsc_requests), arrêt après création"
check "arrêt simulé" "$(worker G after_insert jsc_requests)" crashed
age G 601
SG=$(q "select id from jsc_requests where fp='G'")
check "reprise : demande exacte" "$(worker G none jsc_requests)" "recovered:$SG"
check "aucun courriel" "$(mails G jsc_requests)" 0

echo "RÉSULTAT : $PASS réussis, $FAIL échecs"
[ "$FAIL" = 0 ]
