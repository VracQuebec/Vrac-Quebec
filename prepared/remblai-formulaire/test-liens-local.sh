#!/usr/bin/env bash
set -euo pipefail
mkdir -p /tmp/exec-correctifs
DIR=$(mktemp -d /tmp/exec-correctifs/simple-XXXX)
chown 1000:1000 "$DIR"
cleanup(){ setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$DIR/pg" -U lovable -A trust >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DIR/pg" -o "-k $DIR -p 55439 -c listen_addresses='127.0.0.1'" -l "$DIR/log" start >/dev/null
EXEC01B_LOCAL_TEST=1 bunx vitest run --no-file-parallelism src/test/remblai-correctif-15minutes.test.ts src/test/remblai-lien-personnel.test.ts src/test/remblai-exec01b.test.ts
EXEC01B_LOCAL_TEST=1 bun prepared/exec01-correctif-lien/verification-preparation-locale.ts