"""Minimal Discord REST client: the bot only posts messages, so it does not
keep a gateway connection open (less memory, nothing to reconnect)."""
import json
import logging
import threading
import time
import urllib.error
import urllib.request

API = 'https://discord.com/api/v10'
TEXT_CHANNELS = (0, 5)  # text and announcement channels
USER_AGENT = 'DiscordBot (https://esports.subepe.app, 1.0)'

logger = logging.getLogger(__name__)


class DiscordError(Exception):
    pass


def normalize(name):
    """'📢・avisos-l4d' and 'avisos-l4d' are the same channel."""
    return name.split('・')[-1].strip().lower()


class Discord:
    def __init__(self, token, guild_id):
        self.token, self.guild_id = token, guild_id
        self.channels = {}
        self.lock = threading.Lock()

    def call(self, method, path, body=None):
        request = urllib.request.Request(
            API + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                'Authorization': f'Bot {self.token}',
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT,
            })
        for _ in range(5):
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    data = response.read()
                    return json.loads(data) if data else None
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    data = json.loads(error.read() or b'{}')
                    time.sleep(float(data.get('retry_after', 1)) + 0.2)
                    continue
                raise DiscordError(
                    f'{method} {path} -> {error.code}: {error.read().decode()}'
                ) from error
        raise DiscordError(f'{method} {path}: too many rate limits')

    def load_channels(self):
        channels = self.call('GET', f'/guilds/{self.guild_id}/channels')
        self.channels = {
            normalize(c['name']): c['id']
            for c in channels if c['type'] in TEXT_CHANNELS
        }

    def channel_id(self, name):
        key = normalize(name)
        with self.lock:
            # A channel created or renamed after start: read them again.
            if key not in self.channels:
                self.load_channels()
            return self.channels.get(key)

    def send(self, channel, body):
        channel_id = self.channel_id(channel)
        if channel_id is None:
            raise DiscordError(f'No existe el canal "{channel}"')
        # Never ping @everyone or roles from data written in the site.
        message = {**body, 'allowed_mentions': {'parse': []}}
        return self.call('POST', f'/channels/{channel_id}/messages', message)
