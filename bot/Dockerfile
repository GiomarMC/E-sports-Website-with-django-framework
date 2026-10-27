# Discord bot: the standard library plus Pillow for the VS cards.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt && useradd --create-home --uid 1000 bot
COPY --chown=bot:bot app.py cards.py discord_api.py templates.py channels.json ./
COPY --chown=bot:bot assets ./assets
USER bot

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"
CMD ["python", "app.py"]
