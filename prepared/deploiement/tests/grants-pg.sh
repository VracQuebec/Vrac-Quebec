#!/usr/bin/env bash
# Test RÉEL (base PostgreSQL jetable locale) de la migration de permissions
# et de sa restauration exacte. Aucune connexion à la production.
set -euo pipefail
if [ "$(id -u)" = 0 ]; then
  D=$(cd "$(dirname "$0")/.." && pwd)
  cp "$0" /tmp/grants-pg.sh; cp "$D/migration-resserrement-grants-anon-NON-APPLIQUEE.sql" /tmp/mig-grants.sql; cp "$D/restauration-grants-anon-NON-APPLIQUEE.sql" /tmp/rest-grants.sql
  chmod 644 /tmp/grants-pg.sh /tmp/mig-grants.sql /tmp/rest-grants.sql
  exec setpriv --reuid=1000 --regid=1000 --clear-groups env PATH="$PATH" HOME=/tmp MIG=/tmp/mig-grants.sql REST=/tmp/rest-grants.sql bash /tmp/grants-pg.sh
fi
DIR="$(mktemp -d /tmp/pggr.XXXX)"; PORT=54331
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE
export PGHOST="$DIR" PGPORT=$PORT PGUSER=postgres PGDATABASE=postgres
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
initdb -D "$DIR/data" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR/data" -o "-k $DIR -p $PORT -c listen_addresses=''" -l "$DIR/log" start >/dev/null
for _ in $(seq 1 50); do pg_isready -q && break; sleep 0.1; done
q() { psql -X -v ON_ERROR_STOP=1 -Atqc "$1"; }
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  OK   $1"; PASS=$((PASS+1)); else echo "  ÉCHEC $1 (attendu « $3 », obtenu « $2 »)"; FAIL=$((FAIL+1)); fi; }

# Reproduction de l'état de production : défauts larges pour anon.
q "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;"
for t in blog_authors blog_categories blog_post_related blog_post_tags blog_posts blog_seo_links blog_tags jsc_availability jsc_listings jsc_marketplace_reviews material_families material_variants mkt_partner_photos mkt_partner_services mkt_partner_territories mkt_reviews mkt_sender_identity mkt_service_categories seo_cities seo_material_uses seo_materials seo_pages seo_services jsc_marketplace_profiles mkt_partners transport_requests seo_page_events email_send_log suppressed_emails email_unsubscribe_tokens clients_prives; do
  q "CREATE TABLE public.$t (id int)"; done
q "CREATE TABLE public.submissions (id int, submission_number serial);
   CREATE VIEW public.jsc_listings_public WITH (security_invoker=on) AS SELECT * FROM public.jsc_listings;
   CREATE VIEW public.jsc_marketplace_profiles_public WITH (security_invoker=on) AS SELECT * FROM public.jsc_marketplace_profiles;
   CREATE VIEW public.mkt_partners_public WITH (security_invoker=on) AS SELECT * FROM public.mkt_partners;
   CREATE SEQUENCE public.dompe_number_seq;
   REVOKE INSERT ON public.blog_tags FROM anon;"  # un état initial non uniforme
BEFORE=$(q "select string_agg(relname||'='||coalesce(relacl::text,''), ';' order by relname) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','S')")
DEF_BEFORE=$(q "select string_agg(defaclobjtype::text||'='||defaclacl::text, ';' order by defaclobjtype) from pg_default_acl")

psql -X -v ON_ERROR_STOP=1 -q -f "$MIG"
check "anon ne lit plus une table privée" "$(q "select has_table_privilege('anon','public.clients_prives','SELECT')")" f
check "anon ne peut plus insérer dans suppressed_emails" "$(q "select has_table_privilege('anon','public.suppressed_emails','INSERT')")" f
check "anon lit blog_posts" "$(q "select has_table_privilege('anon','public.blog_posts','SELECT')")" t
check "anon ne modifie pas blog_posts" "$(q "select has_table_privilege('anon','public.blog_posts','UPDATE')")" f
check "anon insère dans submissions" "$(q "select has_table_privilege('anon','public.submissions','INSERT')")" t
check "anon USAGE séquence submissions" "$(q "select has_sequence_privilege('anon','public.submissions_submission_number_seq','USAGE')")" t
check "anon sans setval sur dompe_number_seq" "$(q "select has_sequence_privilege('anon','public.dompe_number_seq','UPDATE')")" f
check "anon lit la vue publique" "$(q "select has_table_privilege('anon','public.jsc_listings_public','SELECT')")" t
check "authenticated inchangé" "$(q "select has_table_privilege('authenticated','public.clients_prives','DELETE')")" t
q "CREATE TABLE public.nouvelle_table (id int)"
check "nouvelle table : aucun droit anon par défaut" "$(q "select has_table_privilege('anon','public.nouvelle_table','SELECT')")" f
check "nouvelle table : authenticated conserve ses défauts" "$(q "select has_table_privilege('authenticated','public.nouvelle_table','SELECT')")" t
psql -X -v ON_ERROR_STOP=1 -q -f "$MIG" && check "migration ré-exécutable" ok ok
check "relevé initial conservé (pas écrasé)" "$(q "select (relacl::text like '%anon=arwdDxtm%')::text from acl_backup_20261016.relations where relname='clients_prives'")" true
check "anon ne lit pas le relevé" "$(q "select has_schema_privilege('anon','acl_backup_20261016','USAGE')")" f

echo "== Restauration exacte"
OUT=$(psql -X -v ON_ERROR_STOP=1 -f "$REST" 2>&1) || { echo "$OUT"; exit 1; }
check "objet créé après le relevé signalé et non modifié" "$(echo "$OUT" | grep -c 'nouvelle_table')" 1
q "DROP TABLE public.nouvelle_table"
AFTER=$(q "select string_agg(relname||'='||coalesce(relacl::text,''), ';' order by relname) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','S')")
DEF_AFTER=$(q "select string_agg(defaclobjtype::text||'='||defaclacl::text, ';' order by defaclobjtype) from pg_default_acl")
check "ACL de tous les objets identiques à l'état initial" "$([ "$BEFORE" = "$AFTER" ] && echo identique || echo différent)" identique
check "privilèges par défaut identiques" "$([ "$DEF_BEFORE" = "$DEF_AFTER" ] && echo identique || echo différent)" identique
check "blog_tags sans INSERT anon (pas plus large qu'avant)" "$(q "select has_table_privilege('anon','public.blog_tags','INSERT')")" f

echo "== Liste blanche incomplète : arrêt"
q "DROP VIEW public.mkt_partners_public"
if psql -X -v ON_ERROR_STOP=1 -q -f "$MIG" >/dev/null 2>&1; then check "arrêt si objet manquant" continue arrêt; else check "arrêt si objet manquant" arrêt arrêt; fi
echo "RÉSULTAT : $PASS réussis, $FAIL échecs"; [ "$FAIL" = 0 ]
