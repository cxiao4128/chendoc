#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PM2="$(pwd)/node_modules/.bin/pm2"
if [ ! -x "$PM2" ]; then
  echo "Pinned local PM2 is missing; nothing to stop."
  exit 0
fi

"$PM2" delete chendoc >/dev/null 2>&1 || true
"$PM2" save
"$PM2" list
