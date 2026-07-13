#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKER="# chendoc-maintenance"
if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab is unavailable. Install a cron service, then rerun this script."
  exit 1
fi
NODE_BIN="$(dirname "$(command -v node)")"
BASH_BIN="$(command -v bash)"
CRON_PATH="${NODE_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
CURRENT="$(crontab -l 2>/dev/null | grep -vF "$MARKER" || true)"
{
  printf '%s\n' "$CURRENT"
  printf '17 * * * * PATH=%q; export PATH; cd %q && %q scripts/maintenance.sh hourly >> logs/maintenance.log 2>&1 %s\n' "$CRON_PATH" "$ROOT" "$BASH_BIN" "$MARKER"
  printf '23 3 * * * PATH=%q; export PATH; cd %q && %q scripts/maintenance.sh daily >> logs/maintenance.log 2>&1 %s\n' "$CRON_PATH" "$ROOT" "$BASH_BIN" "$MARKER"
} | crontab -
echo "ChenDoc maintenance cron installed."
