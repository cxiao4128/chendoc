#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p logs

case "${1:-}" in
  hourly)
    bash scripts/rotate-logs.sh
    npm run uploads:cleanup
    ;;
  daily)
    npm run db:backup
    BACKUP_MARKER="backups/.latest-db-backup"
    if [ ! -s "$BACKUP_MARKER" ]; then
      echo "Database backup marker not found: $BACKUP_MARKER"
      exit 1
    fi
    BACKUP_PATH="$(tr -d '\r\n' < "$BACKUP_MARKER")"
    if [ ! -f "$BACKUP_PATH" ]; then
      echo "Encrypted database backup not found: $BACKUP_PATH"
      exit 1
    fi
    npm run db:backup:verify -- "$BACKUP_PATH"
    npm run r2:backup
    ;;
  *)
    echo "Usage: bash scripts/maintenance.sh <hourly|daily>"
    exit 2
    ;;
esac
