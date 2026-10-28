#!/usr/bin/env bash
# Run on the Mac. Builds Orbit's tables on the self-hosted Supabase from supabase/migrations
# (all of them, in order), then copies accounts + data from the hosted project if OLD_DB_URL is set.
# Needs Docker only (pg tools run in a container). Read-only on the old database.
#   OLD_DB_URL='postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres' \
#   NEW_DB_URL='postgresql://postgres.orbit:<pw>@host.docker.internal:5440/postgres' \
#   bash deploy/supabase/move-data.sh
set -euo pipefail

: "${NEW_DB_URL:?set NEW_DB_URL (self-hosted Supabase)}"
OLD_DB_URL="${OLD_DB_URL:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/deploy/supabase/.dump"   # gitignored; holds personal data, delete after the move
mkdir -p "$OUT"

pg() { docker run --rm -i -v "$OUT:/out" -v "$ROOT/supabase/migrations:/migrations:ro" postgres:17 "$@"; }

# Migrations aren't re-runnable, and loading twice would duplicate rows.
if [ "$(pg psql "$NEW_DB_URL" -tAc "select to_regclass('public.tasks') is not null")" = t ]; then
  echo "The new database already has Orbit's tables, so nothing was changed." >&2
  echo "To start over, wipe it on the server (cd ~/supabase && docker compose down -v && sudo rm -rf volumes/db/data) and run setup-server.sh again." >&2
  exit 1
fi

if [ -n "$OLD_DB_URL" ]; then
  echo "1/3 Dumping data from the old project…"
  pg pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
    --table=auth.users --table=auth.identities --table='public.*' -f /out/raw.sql
  # pg_dump 17 writes a setting older servers reject.
  grep -v transaction_timeout "$OUT/raw.sql" > "$OUT/data.sql"
fi

echo "2/3 Creating tables on the new server…"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$f")"
  pg psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -q -f "/migrations/$(basename "$f")"
done

if [ -z "$OLD_DB_URL" ]; then
  echo "Done. No OLD_DB_URL, so the database starts empty: add your account in Studio (Authentication → Add user)."
  exit 0
fi

echo "3/3 Loading data (triggers off so row order does not matter)…"
pg psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c 'SET session_replication_role = replica' -f /out/data.sql \
  -c "UPDATE auth.users SET confirmation_token = coalesce(confirmation_token, ''), recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''), email_change = coalesce(email_change, '')"
# ^ Sign-in fails with a 500 on users whose token columns are NULL (rows made by SQL rather than the Auth API).

echo "Done. Now run move-files.mjs for attachments, then delete $OUT."
