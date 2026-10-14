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

echo "==> Code"
git fetch --quiet origin main
git reset --hard origin/main

echo "==> Build and restart"
compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }
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
