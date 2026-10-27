#!/usr/bin/env bash
# Run ON the server (Ubuntu/Debian with Docker). Installs self-hosted Supabase in ~/supabase
# with fresh random secrets, then starts it. Safe to re-run: keeps an existing .env.
#   PUBLIC_URL=https://db.example.com bash setup-server.sh
set -euo pipefail

PUBLIC_URL="${PUBLIC_URL:?set PUBLIC_URL, e.g. https://db.example.com}"
DIR="$HOME/supabase"

if [ ! -d "$DIR" ]; then
  git clone --depth 1 https://github.com/supabase/supabase /tmp/supabase-src
  cp -r /tmp/supabase-src/docker "$DIR"
  rm -rf /tmp/supabase-src
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
  set_env SITE_URL "$PUBLIC_URL"
  set_env API_EXTERNAL_URL "$PUBLIC_URL"
  set_env SUPABASE_PUBLIC_URL "$PUBLIC_URL"
  # ponytail: Orbit is single-user; accounts come over from the old project, no new sign-ups.
  set_env DISABLE_SIGNUP true
  chmod 600 .env
fi

docker compose pull
docker compose up -d
echo "Supabase is up on port 8000. Keys are in $DIR/.env (ANON_KEY, SERVICE_ROLE_KEY, POSTGRES_PASSWORD)."
