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

read_env_value() {
  local name="$1"
  local value
  value="$( (grep -E "^[[:space:]]*(export[[:space:]]+)?${name}=" .env || true) | tail -n 1 | sed -E "s/^[[:space:]]*(export[[:space:]]+)?${name}=//" | sed -E "s/[[:space:]]+#.*$//" | sed -E "s/^['\"]//; s/['\"]$//")"
  printf "%s" "$value"
}

DATABASE_PROVIDER_VALUE="$(read_env_value DATABASE_PROVIDER)"
DATABASE_URL_VALUE="$(read_env_value DATABASE_URL)"
if [ "${DATABASE_PROVIDER_VALUE:-mysql}" != "mysql" ] || [[ "${DATABASE_URL_VALUE:-}" != mysql://* ]]; then
  echo "Production server uses MySQL. Set DATABASE_PROVIDER=mysql and DATABASE_URL=mysql://... in .env before deployment."
  exit 1
fi

node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('Node.js 20+ is required.'); process.exit(1); }"
if [ -f "package-lock.json" ]; then
  npm ci --workspaces --include-workspace-root
else
  npm install --workspaces --include-workspace-root
fi

node scripts/preflight-deploy.js

NPM_AUDIT_REGISTRY="${NPM_AUDIT_REGISTRY:-https://registry.npmjs.org}"
npm --registry="$NPM_AUDIT_REGISTRY" audit --omit=dev
npm run db:backup
npm run db:migrate
npm run build

if [ "${CHENDOC_INIT_ADMIN:-0}" = "1" ]; then
  echo "Initializing admin account..."
  npm run admin:init
  echo "Admin initialization finished."
else
  echo "Skip admin init. Set CHENDOC_INIT_ADMIN=1 for the first deployment."
fi

bash ./start.sh

echo "ChenDoc deployed. Set the BT reverse proxy to http://127.0.0.1:8985"
