"""Discord bot of the event: receives the webhooks of the site (match
scheduled, started, stream live, official result) and posts them in the
channel of each game with the templates of ``templates.py``.

The site and the bot only share the event format (WEBHOOKS.md): the site
knows nothing about Discord. Only Python's standard library.

    DISCORD_TOKEN=... DISCORD_GUILD_ID=... BOT_WEBHOOK_SECRET=... \\
        python app.py
"""
import hashlib
import hmac
import json
import logging
import os
import queue
import threading
import time
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cards
import templates
from discord_api import Discord, DiscordError

logger = logging.getLogger('bot')

MAX_AGE_SECONDS = 300
MAX_BODY_BYTES = 1_000_000
REMEMBERED_IDS = 1000


def valid_signature(secret, timestamp, signature, body, now=None):
    try:
        age = abs((now or time.time()) - int(timestamp))
    except (TypeError, ValueError):
        return False
    if age > MAX_AGE_SECONDS:
        return False
    expected = hmac.new(
        secret.encode(), f'{timestamp}.'.encode() + body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature or '', f'sha256={expected}')


class Router:
    """Picks the channel of each message from channels.json."""

    def __init__(self, config):
        self.fallback = config.get('fallback')
        self.games = config.get('games', [])

    def game(self, game_name):
        name = (game_name or '').lower()
        return next((
            game for game in self.games
            if any(word.lower() in name for word in game['match'])
        ), {})

    def channel(self, event, game_name):
        return self.game(game_name).get('events', {}).get(
            event, self.fallback
        )

    def art(self, game_name):
        return self.game(game_name).get('art')


class Bot:
    def __init__(self, secret, discord, router):
        self.secret, self.discord, self.router = secret, discord, router
        self.queue = queue.Queue()
        self.seen = OrderedDict()
        self.seen_lock = threading.Lock()

    def first_time(self, delivery_id):
        """Retries of the site send the same id: post it only once."""
        with self.seen_lock:
            if delivery_id in self.seen:
                return False
            self.seen[delivery_id] = True
            if len(self.seen) > REMEMBERED_IDS:
                self.seen.popitem(last=False)
            return True

    def images(self, game, specs):
        """The VS cards of a message. One that fails is left out (the
        message still goes, without that image)."""
        files = []
        for name, match, mode in specs:
            try:
                files.append(
                    (name, cards.render(match, mode, self.router.art(game)))
                )
            except Exception:
                logger.exception('Tarjeta %s', name)
        return files

    def publish(self, event, data):
        for game, body, specs in templates.render(event, data):
            channel = self.router.channel(event, game)
            if not channel:
                logger.warning('%s: sin canal para %s', event, game)
                continue
            files = self.images(game, specs)
            sent = {name for name, _ in files}
            for item in body['embeds']:
                image = item.get('image', {}).get('url', '')
                if image.startswith('attachment://') and \
                        image[len('attachment://'):] not in sent:
                    del item['image']
            try:
                self.discord.send(channel, body, files)
                logger.info('%s publicado en #%s', event, channel)
            except DiscordError as error:
                logger.error('%s: %s', event, error)

    def work(self):
        while True:
            event, data = self.queue.get()
            try:
                self.publish(event, data)
            except Exception:
                logger.exception('%s: error inesperado', event)
            finally:
                self.queue.task_done()


def make_handler(bot):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'EsportsBot/1.0'

        def reply(self, code, text=''):
            body = text.encode()
            self.send_response(code)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == '/health':
                return self.reply(200, 'ok')
            self.reply(404)

        def do_POST(self):
            if self.path != '/events':
                return self.reply(404)
            if bot is None:
                return self.reply(503, 'Bot sin configurar')
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= MAX_BODY_BYTES:
                return self.reply(413)
            body = self.rfile.read(length)
            if not valid_signature(
                    bot.secret, self.headers.get('X-Esports-Timestamp'),
                    self.headers.get('X-Esports-Signature'), body):
                return self.reply(401, 'Firma inválida')
            try:
                payload = json.loads(body)
            except ValueError:
                return self.reply(400)
            # Reply right away; Discord is called in the background.
            if bot.first_time(payload.get('id')) and \
                    payload.get('event') in templates.RENDERERS:
                bot.queue.put((payload['event'], payload['data']))
            self.reply(202)

        def log_message(self, format, *args):
            logger.debug(format, *args)

    return Handler


def main():
    logging.basicConfig(
        level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s'
    )
    token = os.environ.get('DISCORD_TOKEN', '')
    guild_id = os.environ.get('DISCORD_GUILD_ID', '')
    secret = os.environ.get('BOT_WEBHOOK_SECRET', '')
    port = int(os.environ.get('BOT_PORT', '8080'))
    config_path = os.environ.get('BOT_CHANNELS') or os.path.join(
        os.path.dirname(__file__), 'channels.json'
    )

    bot = None
    if token and guild_id and secret:
        with open(config_path, encoding='utf-8') as file:
            router = Router(json.load(file))
        bot = Bot(secret, Discord(token, guild_id), router)
        threading.Thread(target=bot.work, daemon=True).start()
        logger.info('Bot listo en el puerto %s', port)
    else:
        # Keeps running (healthy) so the deploy does not fail before the
        # .env has the Discord data.
        logger.warning(
            'Falta DISCORD_TOKEN, DISCORD_GUILD_ID o BOT_WEBHOOK_SECRET: '
            'los avisos se rechazan hasta configurarlos.'
        )
    ThreadingHTTPServer(('0.0.0.0', port), make_handler(bot)).serve_forever()


if __name__ == '__main__':
    main()
