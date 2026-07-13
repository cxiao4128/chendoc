#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p logs
MAX_BYTES="${CHENDOC_PM2_LOG_MAX_BYTES:-20971520}"

for log_file in logs/chendoc-out.log logs/chendoc-error.log logs/chendoc-backend-out.log logs/chendoc-backend-error.log logs/maintenance.log; do
  [ -f "$log_file" ] || continue
  size="$(wc -c < "$log_file")"
  if [ "$size" -lt "$MAX_BYTES" ]; then continue; fi
  archive="${log_file}.$(date +%Y%m%d-%H%M%S)"
  cp -- "$log_file" "$archive"
  : > "$log_file"
  gzip -- "$archive"
done

find logs -maxdepth 1 -type f -name '*.log.*.gz' -mtime +14 -delete
