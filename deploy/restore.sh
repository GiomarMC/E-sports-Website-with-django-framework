#!/bin/bash
# Restores a backup made by backup.sh (or the local data exported with the
# commands of DEPLOY.md). Replaces the current database and files.
#   ./deploy/restore.sh db-XXXX.dump files-XXXX.tar.gz
set -euo pipefail

DB_DUMP=$(realpath "$1")
FILES=$(realpath "${2:-}" 2>/dev/null || true)
APP_DIR="${APP_DIR:-/opt/esports}"
cd "$APP_DIR"
compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }

read -r -p "This REPLACES the database and files of the site. Continue? [y/N] " answer
[ "$answer" = y ] || exit 1

compose up -d db
compose stop web backend

echo "==> Database"
compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < "$DB_DUMP"

if [ -n "$FILES" ]; then
  echo "==> Files"
  compose run --rm --no-deps -T --entrypoint sh backend \
    -c 'rm -rf /app/media/* /app/private_media/* && tar -xzf - -C /app' < "$FILES"
fi

compose up -d
echo "Restored. The API applies any pending migration on start."
