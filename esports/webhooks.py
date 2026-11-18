"""Outgoing webhooks: the site tells other services (a Discord bot, for
example) when something public happens, instead of them asking every few
minutes. Every active ``Webhook`` subscribed to the event receives a POST
with a JSON body signed with its secret.

Only public data is sent: teams, dates, streams and results. The links are
built with ``SITE_URL`` (the domain), never with the server address.
"""
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings
from django.db import connections, transaction
from django.utils import timezone

from .models import MatchParticipant, Stream, Webhook

logger = logging.getLogger(__name__)

USER_AGENT = 'Esports-Webhooks/1.0'
TIMEOUT_SECONDS = 5
# Seconds to wait before each attempt: a bot that is restarting gets a
# second chance.
RETRY_DELAYS = (0, 3, 15)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='webhooks')


# ------------------------------------------------------------ addresses
# The site makes these requests from inside the server: an address must
# not reach the services that are only open to the internal network
# (database, API, cloud metadata...). That attack is called SSRF.

INVALID_URL = 'Escribe una dirección válida.'


def internal_hosts():
    """Internal services (docker names) that may receive the events."""
    return {host.lower() for host in settings.WEBHOOK_INTERNAL_HOSTS}


def addresses(host):
    """IP addresses of ``host`` (empty when it does not resolve: then it
    cannot be reached either)."""
    try:
        return {ipaddress.ip_address(host)}
    except ValueError:
        pass
    try:
        return {
            ipaddress.ip_address(info[4][0].split('%')[0])
            for info in socket.getaddrinfo(host, None)
        }
    except (socket.gaierror, UnicodeError, ValueError):
        return set()


def blocked_reason(url):
    """Why the site must not send requests to ``url`` (None: allowed)."""
    try:
        parts = urlsplit(url)
        parts.port  # Raises on an invalid port.
    except ValueError:
        return INVALID_URL
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        return INVALID_URL
    host = parts.hostname.lower()
    if host in internal_hosts() or settings.DEBUG:
        return None
    if parts.scheme != 'https':
        names = ', '.join(f'http://{h}' for h in sorted(internal_hosts()))
        return (
            'La dirección debe empezar con https:// (o ser un servicio '
            f'interno permitido: {names or "ninguno"}).'
        )
    if any(not ip.is_global for ip in addresses(host)):
        return 'La dirección apunta a la red interna del servidor.'
    return None


class NoRedirect(HTTPRedirectHandler):
    """A receiver cannot send the request somewhere else (an allowed
    address answering "go to http://db:5432" would skip the checks)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HTTPError(
            req.full_url, code, f'Redirección a {newurl}', headers, fp
        )


_opener = build_opener(NoRedirect)


def urlopen(request, timeout):
    return _opener.open(request, timeout=timeout)


# ------------------------------------------------------------- payloads

def absolute(path):
    return f'{settings.SITE_URL}{path}'


def team_data(registration):
    if registration is None:
        return {'id': None, 'name': None, 'logo': None}
    return {
        'id': registration.public_id,
        'name': registration.display_name,
        'logo': absolute(registration.logo.url) if registration.logo
        else None,
    }


def stream_data(stream):
    return {
        'id': stream.public_id,
        'title': stream.title,
        'platform': stream.platform,
        'url': stream.url,
        'is_live': stream.is_live,
    }


def game_data(game):
    return {
        'id': game.public_id,
        'name': game.name,
        'url': absolute(f'/juegos/{game.public_id}'),
    }


def match_data(match):
    """Public data of a match. Scores only once it is completed."""
    stage = match.stage
    tournament = stage.tournament
    completed = match.status == 'completed'
    teams = []
    # Not the related managers: they may be prefetched with old data (the
    # streams that a match turns on, for example).
    entries = MatchParticipant.objects.filter(match=match).select_related(
        'registration'
    ).order_by('slot', 'id')
    for entry in entries:
        team = team_data(entry.registration)
        if completed:
            team['score'] = entry.score
            team['placement'] = entry.placement
        teams.append(team)
    return {
        'id': match.public_id,
        'label': match.label,
        'stage': stage.name,
        'group': match.group.name if match.group_id else None,
        'round': match.round,
        'bracket': match.bracket or None,
        'best_of': match.best_of,
        'status': match.status,
        'scheduled_at': (
            match.scheduled_at.isoformat() if match.scheduled_at else None
        ),
        'tournament': {
            'id': tournament.public_id, 'name': tournament.name,
        },
        'game': game_data(tournament.game),
        'teams': teams,
        'streams': [
            stream_data(s) for s in Stream.objects.filter(match=match)
        ],
        'schedule_url': absolute('/cronograma'),
    }


def result_data(match, corrected=False):
    data = match_data(match)
    winner_id = match.winner.public_id if match.winner_id else None
    winner = next(
        (t for t in data['teams']
         if winner_id is not None and t['id'] == winner_id), None
    )
    data.update({
        'winner': winner,
        'losers': [t for t in data['teams'] if t is not winner]
        if winner else [],
        'draw': winner is None,
        # The admin fixed a result that had already been announced.
        'corrected': corrected,
    })
    return data


# ------------------------------------------------------------- delivery

def emit(event, data):
    """Sends ``event`` to the webhooks subscribed to it once the current
    transaction is committed (a change that is rolled back is never
    announced). The request that caused it does not wait for the bots."""
    hooks = [h for h in Webhook.objects.filter(active=True) if h.wants(event)]
    if not hooks:
        return
    body = encode(event, data)

    def send():
        for hook in hooks:
            if settings.WEBHOOKS_ASYNC:
                _executor.submit(deliver_in_thread, hook, event, body)
            else:
                deliver(hook, event, body)

    transaction.on_commit(send)


def encode(event, data):
    payload = {
        'id': str(uuid.uuid4()),
        'event': event,
        'created_at': timezone.now().isoformat(),
        'data': data,
    }
    return json.dumps(payload, ensure_ascii=False).encode()


def sign(secret, timestamp, body):
    message = f'{timestamp}.'.encode() + body
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def deliver_in_thread(hook, event, body):
    try:
        deliver(hook, event, body)
    except Exception:
        logger.exception('Webhook %s: unexpected error', hook.name)
    finally:
        # Threads open their own database connection.
        connections.close_all()


def deliver(hook, event, body, delays=RETRY_DELAYS):
    """POSTs ``body`` to the hook, retrying when it is down or fails on its
    side. Returns (ok, status) and saves the status in the hook."""
    # Checked again on every delivery: the name may point to another IP
    # since the address was saved.
    reason = blocked_reason(hook.url)
    if reason:
        status = f'Bloqueado: {reason}'[:200]
        logger.warning('Webhook %s blocked: %s', hook.name, reason)
        Webhook.objects.filter(pk=hook.pk).update(
            last_delivery_at=timezone.now(), last_status=status
        )
        return False, status
    timestamp = str(int(time.time()))
    request = Request(hook.url, data=body, method='POST', headers={
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Esports-Event': event,
        'X-Esports-Timestamp': timestamp,
        'X-Esports-Signature': f'sha256={sign(hook.secret, timestamp, body)}',
    })
    ok, status = False, ''
    for delay in delays:
        if delay:
            time.sleep(delay)
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                ok, status = True, f'HTTP {response.status}'
                break
        except HTTPError as error:
            status = f'HTTP {error.code}'
            # The receiver rejected it: sending it again will not help.
            if error.code < 500 and error.code != 429:
                break
        except (URLError, OSError) as error:
            reason = getattr(error, 'reason', error)
            status = f'Sin conexión: {reason}'[:200]
    if not ok:
        logger.warning('Webhook %s (%s) failed: %s', hook.name, event, status)
    Webhook.objects.filter(pk=hook.pk).update(
        last_delivery_at=timezone.now(), last_status=status
    )
    return ok, status
