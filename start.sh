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

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

pm2 delete chendoc >/dev/null 2>&1 || true
pm2 start server/dist/server.js --name chendoc --cwd "$(pwd)" --interpreter "$NODE_EXEC" --update-env --time
pm2 save

sleep 1
pm2 list
curl -I http://127.0.0.1:8985/login || true
