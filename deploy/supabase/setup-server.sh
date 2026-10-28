#!/usr/bin/env bash
# Run ON the server (Ubuntu/Debian with Docker). Installs self-hosted Supabase in ~/supabase
# with fresh random secrets, then starts it. Safe to re-run: keeps an existing .env.
#   PUBLIC_URL=https://db.example.com bash setup-server.sh
set -euo pipefail

PUBLIC_URL="${PUBLIC_URL:?set PUBLIC_URL, e.g. https://db.example.com}"
PUBLIC_URL="${PUBLIC_URL%/}"
DIR="${SUPABASE_DIR:-$HOME/supabase}"
# Upstream's Docker setup changes often (gateway, key names); pin the version this script was tested with.
SUPABASE_REF=167c633ed06da4da7b545f083b999fd7d8c669c5

for tool in docker git openssl; do
  command -v "$tool" >/dev/null || { echo "Install $tool first." >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "Install the Docker Compose plugin (docker compose)." >&2; exit 1; }

if [ ! -d "$DIR" ]; then
  SRC=$(mktemp -d)
  git -C "$SRC" init -q
  git -C "$SRC" remote add origin https://github.com/supabase/supabase
  git -C "$SRC" sparse-checkout set docker # only the docker folder, not the whole monorepo
  git -C "$SRC" fetch -q --depth 1 --filter=blob:none origin "$SUPABASE_REF"
  git -C "$SRC" checkout -q FETCH_HEAD
  cp -r "$SRC/docker" "$DIR"
  rm -rf "$SRC"
fi
cd "$DIR"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { # role, secret -> HS256 token valid 10 years
  local h p now
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  now=$(date +%s)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$now" $((now + 315360000)) | b64url)
  printf '%s.%s.%s' "$h" "$p" "$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)"
}
set_env() { # only touches keys the upstream .env.example defines
  grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || true
}

if [ ! -f .env ]; then
  cp .env.example .env
  JWT_SECRET=$(openssl rand -hex 32)
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env JWT_SECRET "$JWT_SECRET"
  set_env ANON_KEY "$(jwt anon "$JWT_SECRET")"
  set_env SERVICE_ROLE_KEY "$(jwt service_role "$JWT_SECRET")"
  set_env DASHBOARD_PASSWORD "$(openssl rand -hex 16)"
  set_env SECRET_KEY_BASE "$(openssl rand -hex 32)"
  set_env VAULT_ENC_KEY "$(openssl rand -hex 16)"
  set_env PG_META_CRYPTO_KEY "$(openssl rand -hex 16)"
  set_env LOGFLARE_PUBLIC_ACCESS_TOKEN "$(openssl rand -hex 24)"
  set_env LOGFLARE_PRIVATE_ACCESS_TOKEN "$(openssl rand -hex 24)"
  set_env REALTIME_DB_ENC_KEY "$(openssl rand -hex 8)"
  set_env POOLER_TENANT_ID orbit
  set_env SITE_URL "$PUBLIC_URL"
  set_env API_EXTERNAL_URL "$PUBLIC_URL/auth/v1"
  set_env SUPABASE_PUBLIC_URL "$PUBLIC_URL"
  # ponytail: Orbit is single-user; accounts come over from the old project, no new sign-ups.
  set_env DISABLE_SIGNUP true
  chmod 600 .env
fi

# Docker publishes ports past the firewall (ufw), so bind them to localhost only.
# Caddy reaches the API on 127.0.0.1:8000 and move-data.sh reaches the database through an SSH tunnel.
cat > docker-compose.orbit.yml <<'YAML'
services:
  api-gw:
    ports: !override
      - 127.0.0.1:${API_GW_HTTP_PORT:-8000}:8000/tcp
  supavisor:
    ports: !override
      - 127.0.0.1:${POSTGRES_PORT}:5432
      - 127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543
YAML
set_env COMPOSE_FILE docker-compose.yml:docker-compose.orbit.yml

docker compose pull
docker compose up -d --wait --wait-timeout 600
echo "Supabase is up on 127.0.0.1:8000. Keys are in $DIR/.env (ANON_KEY, SERVICE_ROLE_KEY, POSTGRES_PASSWORD)."
