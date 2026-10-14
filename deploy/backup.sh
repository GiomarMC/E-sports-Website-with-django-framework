#!/bin/bash
# Backup of the database and the uploaded files (public and private).
# Keeps the last 14 days in /var/backups/esports. Copy them out of the
# server from time to time (scp): if the VM is lost, so are its backups.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/esports}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/esports}"
STAMP=$(date +%Y%m%d-%H%M)
cd "$APP_DIR"
compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }
mkdir -p "$BACKUP_DIR"
# The credentials are read inside the db container.
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$BACKUP_DIR/db-$STAMP.dump"
compose exec -T backend tar -czf - -C /app media private_media \
  > "$BACKUP_DIR/files-$STAMP.tar.gz"

find "$BACKUP_DIR" -name 'db-*.dump' -mtime +14 -delete
find "$BACKUP_DIR" -name 'files-*.tar.gz' -mtime +14 -delete
echo "$(date -Is) backup $STAMP ok"
