#!/usr/bin/env bash
# Empty disposable loopback fixture only; never consumes hosted connection settings.
set -euo pipefail
DIR=$(mktemp -d /tmp/remblai-form-XXXX)
chown 1000:1000 "$DIR"
cleanup(){ setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$DIR/pg" -U postgres -A trust >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DIR/pg" -o "-k $DIR -p 55438 -c listen_addresses='127.0.0.1'" -l "$DIR/log" start >/dev/null
REMBLAI_FORM_LOCAL=1 bunx vitest run --no-file-parallelism src/test/remblai-original-form.test.ts src/test/remblai-composition.test.ts src/test/remblai-exec01.test.ts src/test/remblai-exec01-handler.test.ts src/test/remblai-exec01b.test.ts src/test/remblai-lien-personnel.test.ts src/test/remblai-portal-errors.test.ts src/test/remblai-finalisation.test.ts src/test/remblai-activation.test.ts