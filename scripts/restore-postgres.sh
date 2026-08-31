#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Usage: DATABASE_URL=... bash scripts/restore-postgres.sh ./backups/echo-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

pg_restore --dbname="$DATABASE_URL" --format=custom --no-owner --exit-on-error "$backup_file"
echo "Restore complete from $backup_file"
