#!/bin/sh
# Applies the migrations and collects the static files before starting the
# API, so every deploy leaves the database up to date.
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput --verbosity 0

exec "$@"
