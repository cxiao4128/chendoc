#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  echo ".env not found. Put .env in the project root first."
  exit 1
fi

if [ -d "/www/server/nodejs" ]; then
  NODE_BIN="$(find /www/server/nodejs -maxdepth 3 -type f -name node 2>/dev/null | sort -V | tail -n 1 | xargs dirname || true)"
  if [ -n "${NODE_BIN:-}" ] && [ -d "$NODE_BIN" ]; then
    export PATH="$NODE_BIN:$PATH"
  fi
fi

NODE_EXEC="$(command -v node)"
export NODE_ENV=production
export CHENDOC_SERVE_ADMIN=false

echo "Node: $("$NODE_EXEC" -v)"
echo "Project: $(pwd)"
echo "Mode: API-only (CHENDOC_SERVE_ADMIN=false)"

"$NODE_EXEC" -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('Node.js 20+ is required.'); process.exit(1); }"

if [ ! -f "server/dist/server.js" ]; then
  echo "server/dist/server.js not found. Run bash ./deploy-backend.sh first."
  exit 1
fi

PM2="$(pwd)/node_modules/.bin/pm2"
if [ ! -x "$PM2" ]; then
  PM2="$(pwd)/server/node_modules/.bin/pm2"
fi
if [ ! -x "$PM2" ]; then
  echo "Pinned local PM2 is missing. Run npm ci --workspace @chendoc/server."
  exit 1
fi

read_env_value() {
  local name="$1"
  local value
  value="$( (grep -E "^[[:space:]]*(export[[:space:]]+)?${name}=" .env || true) | tail -n 1 | sed -E "s/^[[:space:]]*(export[[:space:]]+)?${name}=//" | sed -E "s/[[:space:]]+#.*$//" | sed -E "s/^['\"]//; s/['\"]$//")"
  printf "%s" "$value"
}

PORT_VALUE="${PORT:-$(read_env_value PORT)}"
PORT_VALUE="${PORT_VALUE:-8985}"
HEALTH_HOST="${CHENDOC_HEALTH_HOST:-127.0.0.1}"
BASE_URL="http://${HEALTH_HOST}:${PORT_VALUE}"

mkdir -p logs
"$PM2" startOrReload ecosystem.backend.config.cjs --only chendoc --update-env

for attempt in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 3 "${BASE_URL}/api/health" >/dev/null; then
    ROOT_STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 "${BASE_URL}/" || true)"
    LOGIN_STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 "${BASE_URL}/login" || true)"
    if [ "$ROOT_STATUS" != "404" ] || [ "$LOGIN_STATUS" != "404" ]; then
      echo "API-only isolation failed: /=${ROOT_STATUS:-unreachable}, /login=${LOGIN_STATUS:-unreachable}; expected 404."
      "$PM2" delete chendoc || true
      "$PM2" save || true
      exit 1
    fi
    "$PM2" save
    "$PM2" list
    echo "Backend health check passed on ${BASE_URL}."
    echo "Frontend isolation check passed: / and /login return 404."
    exit 0
  fi
  sleep 1
done

echo "Backend health check failed on ${BASE_URL}."
"$PM2" delete chendoc || true
"$PM2" save || true
exit 1
