# Django API (gunicorn). Built on the server itself (ARM or x86).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Unprivileged user. The folders exist in the image with the right owner so
# the named volumes mounted on them start writable.
RUN useradd --create-home --uid 1000 app \
    && mkdir -p media private_media staticfiles .cache \
    && chown -R app:app /app

COPY --chown=app:app manage.py ./
COPY --chown=app:app core ./core
COPY --chown=app:app esports ./esports
COPY --chown=app:app deploy/entrypoint.sh /entrypoint.sh

USER app
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
# Workers: WEB_CONCURRENCY in .env (2 for 1 GB of RAM, 4+ with 4 GB).
ENV WEB_CONCURRENCY=2
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", \
     "--threads", "4", "--timeout", "60", "--access-logfile", "-"]
