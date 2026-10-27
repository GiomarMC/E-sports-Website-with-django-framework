"""Outgoing webhooks: the site tells other services (a Discord bot, for
example) when something public happens, instead of them asking every few
minutes. Every active ``Webhook`` subscribed to the event receives a POST
with a JSON body signed with its secret.

Only public data is sent: teams, dates, streams and results. The links are
built with ``SITE_URL`` (the domain), never with the server address.
"""
import hashlib
import hmac
import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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


# ------------------------------------------------------------- payloads

def absolute(path):
    return f'{settings.SITE_URL}{path}'


def team_data(registration):
    if registration is None:
        return {'id': None, 'name': None, 'logo': None}
    return {
        'id': registration.id,
        'name': registration.display_name,
        'logo': absolute(registration.logo.url) if registration.logo
        else None,
    }


def stream_data(stream):
    return {
        'id': stream.id,
        'title': stream.title,
        'platform': stream.platform,
        'url': stream.url,
        'is_live': stream.is_live,
    }


def game_data(game):
    return {
        'id': game.id,
        'name': game.name,
        'url': absolute(f'/juegos/{game.id}'),
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
        'id': match.id,
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
        'tournament': {'id': tournament.id, 'name': tournament.name},
        'game': game_data(tournament.game),
        'teams': teams,
        'streams': [
            stream_data(s) for s in Stream.objects.filter(match=match)
        ],
        'schedule_url': absolute('/cronograma'),
    }


def result_data(match, corrected=False):
    data = match_data(match)
    winner = next(
        (t for t in data['teams'] if t['id'] == match.winner_id), None
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
