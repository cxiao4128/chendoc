#!/usr/bin/env bash
set -euo pipefail

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed; nothing to stop."
  exit 0
fi

pm2 delete chendoc >/dev/null 2>&1 || true
pm2 save
pm2 list
