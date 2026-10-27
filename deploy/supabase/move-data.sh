#!/usr/bin/env bash
# Run on the Mac. Copies Orbit's schema + data from hosted Supabase to the self-hosted one.
# Needs Docker only (pg tools run in a container). Read-only on the old database.
#   OLD_DB_URL='postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres' \
#   NEW_DB_URL='postgresql://postgres:<pw>@<server>:5432/postgres' \
#   bash deploy/supabase/move-data.sh
set -euo pipefail

: "${OLD_DB_URL:?set OLD_DB_URL (hosted Supabase, session pooler, port 5432)}"
: "${NEW_DB_URL:?set NEW_DB_URL (self-hosted Supabase)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/deploy/supabase/.dump"   # gitignored; holds personal data, delete after the move
mkdir -p "$OUT"

pg() { docker run --rm -i -v "$OUT:/out" -v "$ROOT/supabase/migrations:/migrations:ro" postgres:17 "$@"; }

echo "1/3 Dumping data from the old project…"
pg pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  --table=auth.users --table=auth.identities --table='public.*' -f /out/raw.sql
# pg_dump 17 writes a setting older servers reject.
grep -v transaction_timeout "$OUT/raw.sql" > "$OUT/data.sql"

echo "2/3 Creating tables on the new server…"
for f in "$ROOT"/supabase/migrations/*.sql; do
  pg psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -q -f "/migrations/$(basename "$f")"
done

echo "3/3 Loading data (triggers off so row order does not matter)…"
pg psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c 'SET session_replication_role = replica' -f /out/data.sql

echo "Done. Now run move-files.mjs for attachments, then delete $OUT."
