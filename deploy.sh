#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  echo ".env not found. Copy .env.example to .env and set production secrets first."
  exit 1
fi

if [ -d "/www/server/nodejs" ]; then
  NODE_BIN="$(find /www/server/nodejs -maxdepth 3 -type f -name node 2>/dev/null | sort -V | tail -n 1 | xargs dirname || true)"
  if [ -n "${NODE_BIN:-}" ] && [ -d "$NODE_BIN" ]; then
    export PATH="$NODE_BIN:$PATH"
  fi
fi

echo "Node: $(node -v)"
echo "NPM: $(npm -v)"
echo "Database: MySQL runtime required (set DATABASE_PROVIDER=mysql in .env)"

node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('Node.js 20+ is required.'); process.exit(1); }"
node scripts/preflight-deploy.js

if [ -f "package-lock.json" ]; then
  npm ci --workspaces --include-workspace-root
else
  npm install --workspaces --include-workspace-root
fi

npm run build
npm run db:migrate

if [ "${CHENDOC_INIT_ADMIN:-0}" = "1" ]; then
  npm run admin:init
else
  echo "Skip admin init. Set CHENDOC_INIT_ADMIN=1 for the first deployment."
fi

bash ./start.sh

echo "ChenDoc deployed. Set the BT reverse proxy to http://127.0.0.1:8985"
