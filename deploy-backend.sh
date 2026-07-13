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

export NODE_ENV=production
export CHENDOC_SERVE_ADMIN=false

echo "Node: $(node -v)"
echo "NPM: $(npm -v)"
echo "Mode: API-only (admin workspace is not installed or built)"

read_env_value() {
  local name="$1"
  local value
  value="$( (grep -E "^[[:space:]]*(export[[:space:]]+)?${name}=" .env || true) | tail -n 1 | sed -E "s/^[[:space:]]*(export[[:space:]]+)?${name}=//" | sed -E "s/[[:space:]]+#.*$//" | sed -E "s/^['\"]//; s/['\"]$//")"
  printf "%s" "$value"
}

flag_enabled() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

DATABASE_PROVIDER_VALUE="${DATABASE_PROVIDER:-$(read_env_value DATABASE_PROVIDER)}"
DATABASE_URL_VALUE="${DATABASE_URL:-$(read_env_value DATABASE_URL)}"
if [ "${DATABASE_PROVIDER_VALUE:-mysql}" != "mysql" ] || [[ "${DATABASE_URL_VALUE:-}" != mysql://* ]]; then
  echo "Backend production deployment requires DATABASE_PROVIDER=mysql and a mysql:// DATABASE_URL in .env."
  exit 1
fi

node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('Node.js 20+ is required.'); process.exit(1); }"
for command_name in mysql mysqldump curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name"
    exit 1
  fi
done

PORT_VALUE="${PORT:-$(read_env_value PORT)}"
PORT_VALUE="${PORT_VALUE:-8985}"
HEALTH_HOST="${CHENDOC_HEALTH_HOST:-127.0.0.1}"
BASE_URL="http://${HEALTH_HOST}:${PORT_VALUE}"

ROLLBACK_DIR=".deploy-rollback/backend-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$ROLLBACK_DIR/server"
HAD_PREVIOUS_DIST=0
HAD_ROOT_NODE_MODULES=0
HAD_SERVER_NODE_MODULES=0
DEPENDENCY_INSTALL_ATTEMPTED=0
DIST_SWAP_STARTED=0
BACKEND_DIST_ACTIVATED=0
APPS_MOVED_TO_ROLLBACK=0
PUBLIC_MOVED_TO_ROLLBACK=0
PRE_MIGRATION_BACKUP=""
POST_MIGRATION_BACKUP=""
DATABASE_MIGRATION_ATTEMPTED=0
START_ATTEMPTED=0

start_previous_build() {
  local pm2
  local config
  local root_status
  local login_status
  pm2="$(pwd)/node_modules/.bin/pm2"
  if [ ! -x "$pm2" ]; then
    pm2="$(pwd)/server/node_modules/.bin/pm2"
  fi
  if [ ! -x "$pm2" ]; then
    echo "Previous PM2 runtime is missing; the old build could not be restarted automatically."
    return 1
  fi

  config="$(pwd)/ecosystem.backend.config.cjs"
  if [ -f "$config" ]; then
    NODE_ENV=production CHENDOC_SERVE_ADMIN=false \
      "$pm2" startOrReload "$config" --only chendoc --update-env
  else
    "$pm2" delete chendoc >/dev/null 2>&1 || true
    NODE_ENV=production CHENDOC_SERVE_ADMIN=false \
      "$pm2" start server/dist/server.js --name chendoc --update-env
  fi
  "$pm2" save

  for attempt in $(seq 1 20); do
    if curl --fail --silent --show-error --max-time 3 "${BASE_URL}/api/health" >/dev/null; then
      root_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 "${BASE_URL}/" || true)"
      login_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 "${BASE_URL}/login" || true)"
      if [ "$root_status" = "404" ] && [ "$login_status" = "404" ]; then
        echo "Previous server build restored in API-only mode and healthy on ${BASE_URL}."
        return 0
      fi
      echo "Previous build violates API-only isolation: /=${root_status:-unreachable}, /login=${login_status:-unreachable}."
      "$pm2" delete chendoc >/dev/null 2>&1 || true
      "$pm2" save || true
      return 1
    fi
    sleep 1
  done
  echo "Previous server build was restored but its health check failed on ${BASE_URL}."
  return 1
}

rollback_on_error() {
  local status="$?"
  trap - ERR
  set +e
  echo "Backend deployment failed. Restoring the previous server build."

  if [ "$START_ATTEMPTED" = "1" ]; then
    local pm2
    pm2="$(pwd)/node_modules/.bin/pm2"
    if [ ! -x "$pm2" ]; then
      pm2="$(pwd)/server/node_modules/.bin/pm2"
    fi
    if [ -x "$pm2" ]; then
      "$pm2" delete chendoc >/dev/null 2>&1 || true
    fi
  fi

  if [ "$APPS_MOVED_TO_ROLLBACK" = "1" ] && [ -d "$ROLLBACK_DIR/apps" ]; then
    rm -rf -- apps
    mv -- "$ROLLBACK_DIR/apps" apps
  fi
  if [ "$PUBLIC_MOVED_TO_ROLLBACK" = "1" ] && [ -d "$ROLLBACK_DIR/server/public" ]; then
    rm -rf -- server/public
    mv -- "$ROLLBACK_DIR/server/public" server/public
  fi

  if [ "$BACKEND_DIST_ACTIVATED" = "1" ] && [ -d server/dist ]; then
    rm -rf -- server/backend-dist
    mv -- server/dist server/backend-dist
  elif [ "$DIST_SWAP_STARTED" = "1" ]; then
    rm -rf -- server/dist
  fi
  if [ "$DIST_SWAP_STARTED" = "1" ] && [ "$HAD_PREVIOUS_DIST" = "1" ] && [ -d "$ROLLBACK_DIR/server/dist" ]; then
    cp -a "$ROLLBACK_DIR/server/dist" server/dist
  fi

  if [ "$DEPENDENCY_INSTALL_ATTEMPTED" = "1" ]; then
    rm -rf -- node_modules server/node_modules
  fi
  if [ "$HAD_ROOT_NODE_MODULES" = "1" ] && [ -d "$ROLLBACK_DIR/node_modules" ]; then
    rm -rf -- node_modules
    mv -- "$ROLLBACK_DIR/node_modules" node_modules
  fi
  if [ "$HAD_SERVER_NODE_MODULES" = "1" ] && [ -d "$ROLLBACK_DIR/server/node_modules" ]; then
    rm -rf -- server/node_modules
    mv -- "$ROLLBACK_DIR/server/node_modules" server/node_modules
  fi

  if [ "$START_ATTEMPTED" = "1" ]; then
    if [ "$HAD_PREVIOUS_DIST" = "1" ]; then
      start_previous_build || true
    fi
  fi
  if [ "$DATABASE_MIGRATION_ATTEMPTED" = "1" ]; then
    echo "Database migration was attempted and is not auto-reverted; inspect it before any manual restore."
  fi
  if [ -n "$PRE_MIGRATION_BACKUP" ]; then
    echo "Pre-migration backup: $PRE_MIGRATION_BACKUP"
  fi
  if [ -n "$POST_MIGRATION_BACKUP" ]; then
    echo "Post-migration backup: $POST_MIGRATION_BACKUP"
  fi
  echo "Code rollback: $ROLLBACK_DIR"
  exit "$status"
}
trap rollback_on_error ERR

# Keep the complete old runtime until the new API-only process is healthy. npm ci
# may remove dependencies required by a 3.3.0 all-in-one build, so node_modules is
# swapped transactionally instead of being destroyed in place.
if [ -d server/dist ]; then
  cp -a server/dist "$ROLLBACK_DIR/server/dist"
  HAD_PREVIOUS_DIST=1
fi
if [ -e node_modules ]; then
  mv -- node_modules "$ROLLBACK_DIR/node_modules"
  HAD_ROOT_NODE_MODULES=1
fi
if [ -e server/node_modules ]; then
  mv -- server/node_modules "$ROLLBACK_DIR/server/node_modules"
  HAD_SERVER_NODE_MODULES=1
fi

# Install only production API dependencies. The package already contains the
# compiled backend; apps/admin, TypeScript, Vitest, Playwright and Vite are absent.
DEPENDENCY_INSTALL_ATTEMPTED=1
if [ -f "package-lock.json" ]; then
  npm ci --workspace @chendoc/server
else
  npm install --workspace @chendoc/server
fi

node scripts/preflight-deploy.js

NPM_AUDIT_REGISTRY="${NPM_AUDIT_REGISTRY:-https://registry.npmjs.org}"
npm --registry="$NPM_AUDIT_REGISTRY" audit --omit=dev --workspace @chendoc/server

run_backup() {
  npm run db:backup >&2
  local marker="backups/.latest-db-backup"
  if [ ! -s "$marker" ]; then
    echo "Database backup marker not found: $marker"
    return 1
  fi
  local path
  path="$(tr -d '\r\n' < "$marker")"
  if [ ! -s "$path" ] || [ ! -s "${path}.json" ]; then
    echo "Database backup or checksum metadata is missing."
    return 1
  fi
  printf "%s" "$path"
}

# An established database is always backed up and fully restore-verified before
# the new server build or migration touches the deployment. A truly empty first
# install has no schema or data to preserve and is backed up after initialization.
DATABASE_STATE="$(node --input-type=module <<'NODE'
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: ".env", override: false, quiet: true });
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  console.log(Number(rows[0]?.table_count ?? 0) === 0 ? "fresh" : "existing");
} finally {
  await connection.end();
}
NODE
)"

INIT_ADMIN_VALUE="${CHENDOC_INIT_ADMIN:-$(read_env_value CHENDOC_INIT_ADMIN)}"
if [ "$DATABASE_STATE" = "fresh" ] && ! flag_enabled "$INIT_ADMIN_VALUE"; then
  echo "Fresh database requires CHENDOC_INIT_ADMIN=1 for the first backend deployment."
  false
fi

if [ "$DATABASE_STATE" != "fresh" ]; then
  PRE_MIGRATION_BACKUP="$(run_backup)"
  node scripts/verify-backup.js "$PRE_MIGRATION_BACKUP"
  echo "Pre-migration backup restore verification passed."
else
  echo "Fresh empty database detected; no pre-migration data exists to back up."
fi

if [ ! -f "server/backend-dist/server.js" ]; then
  echo "Compiled backend payload is missing: server/backend-dist/server.js"
  false
fi
DIST_SWAP_STARTED=1
rm -rf -- server/dist
mv -- server/backend-dist server/dist
BACKEND_DIST_ACTIVATED=1
DATABASE_MIGRATION_ATTEMPTED=1
npm run db:migrate

if flag_enabled "$INIT_ADMIN_VALUE"; then
  echo "Initializing or repairing the admin account..."
  npm --prefix server run admin:init
  echo "Admin initialization finished."
else
  echo "Admin initialization skipped. Set CHENDOC_INIT_ADMIN=1 for the first deployment."
fi

# Capture and restore-verify a second recovery point for the migrated schema.
POST_MIGRATION_BACKUP="$(run_backup)"
node scripts/verify-backup.js "$POST_MIGRATION_BACKUP"

bash scripts/install-maintenance-cron.sh

START_ATTEMPTED=1
bash ./start-backend.sh

# Frontend remnants stay available for automatic rollback until the new backend
# passes both health and route-isolation checks. Atomic moves make partial cleanup
# recoverable; the rollback directory is deleted after cleanup succeeds.
if [ -d apps ]; then
  mv -- apps "$ROLLBACK_DIR/apps"
  APPS_MOVED_TO_ROLLBACK=1
fi
if [ -d server/public ]; then
  mv -- server/public "$ROLLBACK_DIR/server/public"
  PUBLIC_MOVED_TO_ROLLBACK=1
fi
if [ -e apps ] || [ -e server/public ]; then
  echo "Frontend cleanup failed: apps or server/public still exists."
  false
fi

trap - ERR
rm -rf -- "$ROLLBACK_DIR"
find .deploy-rollback -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +

echo "ChenDoc backend deployed. Reverse proxy api.w92.pw to the configured local port."
echo "Frontend assets were not installed, built, copied, or served."
echo "Post-migration backup: $POST_MIGRATION_BACKUP"
