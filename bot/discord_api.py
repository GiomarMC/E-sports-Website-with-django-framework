"""Minimal Discord REST client: the bot only posts messages, so it does not
keep a gateway connection open (less memory, nothing to reconnect)."""
import json
import logging
import threading
import time
import urllib.error
import urllib.request
import uuid

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

    def call(self, method, path, body=None, files=()):
        """``files``: [(name, bytes)] uploaded with the message (images
        that the embeds show with attachment://name)."""
        if files:
            data, content_type = multipart(body, files)
        else:
            data = json.dumps(body).encode() if body is not None else None
            content_type = 'application/json'
        request = urllib.request.Request(
            API + path, method=method, data=data, headers={
                'Authorization': f'Bot {self.token}',
                'Content-Type': content_type,
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

    def send(self, channel, body, files=()):
        channel_id = self.channel_id(channel)
        if channel_id is None:
            raise DiscordError(f'No existe el canal "{channel}"')
        # Never ping @everyone or roles from data written in the site.
        message = {**body, 'allowed_mentions': {'parse': []}}
        if files:
            message['attachments'] = [
                {'id': index, 'filename': name}
                for index, (name, _) in enumerate(files)
            ]
        return self.call(
            'POST', f'/channels/{channel_id}/messages', message, files
        )


def multipart(body, files):
    boundary = uuid.uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; '
        f'name="payload_json"\r\nContent-Type: application/json\r\n\r\n'
        .encode() + json.dumps(body).encode() + b'\r\n'
    ]
    for index, (name, content) in enumerate(files):
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; '
            f'name="files[{index}]"; filename="{name}"\r\n'
            f'Content-Type: image/jpeg\r\n\r\n'.encode()
            + content + b'\r\n'
        )
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), f'multipart/form-data; boundary={boundary}'
