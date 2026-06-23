#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  echo ".env not found. Copy .env.example to .env and set production secrets first."
  exit 1
fi

# Remove source files left by older in-place deployments. Release archives are
# overlaid on the project directory, so files deleted in newer versions would
# otherwise remain visible to vue-tsc and Vite.
LEGACY_SOURCE_FILES=(
  "apps/admin/src/api/crypto.ts"
  "apps/admin/src/pages/admin/DashboardPage.vue"
  "apps/admin/src/security/responseCrypto.ts"
  "apps/admin/src/assets/chendoc-logo.png"
  "apps/admin/src/pages/docs/trash.css"
  "apps/admin/public/site-assets/chendoc-logo.png"
  "apps/admin/public/site-assets/chendoc-logo-192.png"
  "apps/admin/public/site-assets/desktop-bg.png"
  "apps/admin/public/site-assets/chendoc-wallpaper-mirrored.jpg"
)
for legacy_file in "${LEGACY_SOURCE_FILES[@]}"; do
  if [ -f "$legacy_file" ]; then
    rm -f -- "$legacy_file"
    echo "Removed legacy source: $legacy_file"
  fi
done

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
BACKUP_MARKER="backups/.latest-db-backup"
if [ ! -s "$BACKUP_MARKER" ]; then
  echo "Database backup marker not found: $BACKUP_MARKER"
  exit 1
fi
BACKUP_PATH="$(tr -d '\r\n' < "$BACKUP_MARKER")"
npm run db:backup:verify -- "$BACKUP_PATH"

ROLLBACK_DIR=".deploy-rollback/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ROLLBACK_DIR/server/public"
if [ -d server/dist ]; then cp -a server/dist "$ROLLBACK_DIR/server/dist"; fi
if [ -d server/public/admin ]; then cp -a server/public/admin "$ROLLBACK_DIR/server/public/admin"; fi

npm run build
npm run db:migrate

if [ "${CHENDOC_INIT_ADMIN:-0}" = "1" ]; then
  echo "Initializing admin account..."
  npm run admin:init
  echo "Admin initialization finished."
else
  echo "Skip admin init. Set CHENDOC_INIT_ADMIN=1 for the first deployment."
fi

if ! bash ./start.sh; then
  echo "New build failed health check. Restoring previous generated build."
  if [ -d "$ROLLBACK_DIR/server/dist" ]; then
    rm -rf -- server/dist
    cp -a "$ROLLBACK_DIR/server/dist" server/dist
  fi
  if [ -d "$ROLLBACK_DIR/server/public/admin" ]; then
    rm -rf -- server/public/admin
    cp -a "$ROLLBACK_DIR/server/public/admin" server/public/admin
  fi
  bash ./start.sh || true
  exit 1
fi

bash scripts/install-maintenance-cron.sh
find .deploy-rollback -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +

echo "ChenDoc deployed. Set the BT reverse proxy to http://127.0.0.1:8985"
