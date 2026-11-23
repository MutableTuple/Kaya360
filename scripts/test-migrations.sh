#!/usr/bin/env bash
# Runs all Supabase migrations against a throwaway local PostgreSQL with a
# minimal stub of Supabase's auth/storage schemas, then runs tests/db/*.sql.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
DATA="$(mktemp -d)"; PORT="${PGPORT_TEST:-55432}"
AS_PG=0; if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; AS_PG=1; fi
run() { if [ "$AS_PG" = "1" ]; then sudo -u postgres "$@"; else "$@"; fi; }
run "$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
run "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses="  -l "$DATA/log" start >/dev/null
trap 'run "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null; rm -rf "$DATA"' EXIT
sleep 1
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"; export PGOPTIONS="-c client_min_messages=warning"
$PSQL -c "create database kaya_test"
$PSQL -d kaya_test -f "$ROOT/tests/db/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "-> applying $(basename "$f")"; $PSQL -d kaya_test -f "$f"; done
for f in "$ROOT"/tests/db/[0-9]*.sql; do echo "-> test $(basename "$f")"; $PSQL -d kaya_test -f "$f"; done
echo "ALL DATABASE TESTS PASSED"
