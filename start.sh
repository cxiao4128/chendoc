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

echo "Node: $("$NODE_EXEC" -v)"
echo "Project: $(pwd)"

"$NODE_EXEC" -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('Node.js 20+ is required.'); process.exit(1); }"

if [ ! -f "server/dist/server.js" ]; then
  echo "server/dist/server.js not found. Run bash ./deploy.sh or npm run build first."
  exit 1
fi

PM2="$(pwd)/node_modules/.bin/pm2"
if [ ! -x "$PM2" ]; then
  echo "Pinned local PM2 is missing. Run npm ci --omit=dev during deployment."
  exit 1
fi

mkdir -p logs
"$PM2" startOrReload ecosystem.config.cjs --only chendoc --update-env
"$PM2" save

"$PM2" list
PORT_VALUE="$(grep -E '^[[:space:]]*PORT=' .env | tail -n 1 | cut -d= -f2- | tr -d '[:space:]\r\"' || true)"
PORT_VALUE="${PORT_VALUE:-8985}"
for attempt in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${PORT_VALUE}/api/health" >/dev/null; then
    echo "Health check passed on port ${PORT_VALUE}."
    exit 0
  fi
  sleep 1
done
echo "Health check failed on port ${PORT_VALUE}."
exit 1
