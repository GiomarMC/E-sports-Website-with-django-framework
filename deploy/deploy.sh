#!/bin/bash
# Updates the code and restarts the containers. Used by GitHub Actions on
# every push to main, and by hand on the server.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/esports}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "Missing $APP_DIR/.env (template: deploy/env.production.example)" >&2
  exit 1
fi

compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }

# Database backup before the new code applies its migrations. If it fails
# the deploy stops here, before changing anything. It only adds files: the
# data is never touched.
echo "==> Backup"
if [ -n "$(compose ps -q --status running db 2>/dev/null)" ]; then
  BACKUP_DIR="${BACKUP_DIR:-/var/backups/esports}"
  mkdir -p "$BACKUP_DIR"
  dump="$BACKUP_DIR/predeploy-db-$(date +%Y%m%d-%H%M%S).dump"
  # pg_restore --list reads the whole dump: an empty or cut file fails.
  if ! compose exec -T db sh -c \
      'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
      > "$dump" ||
    ! compose exec -T db pg_restore --list < "$dump" > /dev/null; then
    rm -f "$dump"
    echo "The backup failed: deploy cancelled, nothing was changed." >&2
    exit 1
  fi
  echo "Saved $dump ($(du -h "$dump" | cut -f1))"
  # Keeps the last 10 of these; the daily backups are apart (backup.sh).
  ls -1t "$BACKUP_DIR"/predeploy-db-*.dump | tail -n +11 | xargs -r rm -f --
else
  echo "The database is not running yet (first deploy): nothing to save."
fi

echo "==> Code"
git fetch --quiet origin main
git reset --hard origin/main

echo "==> Build and restart"
compose up -d --build --remove-orphans
compose ps

echo "==> Waiting for the API"
for _ in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' \
    "$(compose ps -q backend)" 2>/dev/null || echo starting)
  if [ "$status" = healthy ]; then
    echo "API healthy"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done

echo "The API did not become healthy. Last logs:" >&2
compose logs --tail 80 backend >&2
exit 1
