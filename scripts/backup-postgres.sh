#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/echo-$timestamp.dump"

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$backup_file"
echo "Backup written to $backup_file"
