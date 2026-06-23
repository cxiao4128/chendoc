#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKER="# chendoc-maintenance"
if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab is unavailable. Install a cron service, then rerun this script."
  exit 1
fi
CURRENT="$(crontab -l 2>/dev/null | grep -vF "$MARKER" || true)"
{
  printf '%s\n' "$CURRENT"
  printf '17 * * * * cd %q && bash scripts/maintenance.sh hourly >> logs/maintenance.log 2>&1 %s\n' "$ROOT" "$MARKER"
  printf '23 3 * * * cd %q && bash scripts/maintenance.sh daily >> logs/maintenance.log 2>&1 %s\n' "$ROOT" "$MARKER"
} | crontab -
echo "ChenDoc maintenance cron installed."
