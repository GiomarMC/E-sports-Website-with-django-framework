"""Discord messages for each event of the site (see WEBHOOKS.md). Every
function returns a list of (game name, message body, cards): the router
picks the channel of each game and the cards are the VS images
(file name, match, mode) the message shows as attachments."""
import os
from collections import defaultdict
from datetime import datetime

EVENT_NAME = os.environ.get('BOT_EVENT_NAME', 'Esports SemCom 2026')
SITE_URL = os.environ.get('BOT_SITE_URL', 'https://esports.subepe.app')

# Site design tokens (frontend/src/index.css)
ACCENT = 0xE5484D
WARN = 0xE2A336
WIN = 0x3FB27F
MUTED = 0x8B8B96

# Discord limit: 10 embeds (and images) per message.
EMBEDS_PER_MESSAGE = 10


def team_name(team):
    return team.get('name') or 'Por definir'


def versus(teams):
    return ' vs '.join(f'**{team_name(t)}**' for t in teams) or 'Por definir'


def when(iso):
    """Discord shows <t:…> in the time zone of each reader."""
    if not iso:
        return 'Sin fecha'
    unix = int(datetime.fromisoformat(iso).timestamp())
    return f'<t:{unix}:F> (<t:{unix}:R>)'


def context(match):
    parts = [match['tournament']['name'], match['stage']]
    if match.get('group'):
        parts.append(match['group'])
    if match.get('label'):
        parts.append(match['label'])
    parts.append(f"Bo{match['best_of']}")
    return ' · '.join(parts)


def watch_url(match):
    streams = match.get('streams') or []
    live = [s for s in streams if s.get('is_live')]
    return (live or streams or [{}])[0].get('url')


def buttons(*links):
    """Link buttons (label, url); the ones without url are skipped."""
    items = [
        {'type': 2, 'style': 5, 'label': label, 'url': url}
        for label, url in links if url and url.startswith('http')
    ]
    return [{'type': 1, 'components': items}] if items else []


def embed(title, description, color, card=None):
    """``card``: file name of the attached VS image shown in the embed."""
    body = {
        'description': description[:4096],
        'color': color,
        'footer': {'text': EVENT_NAME},
    }
    if title:
        body['title'] = title[:256]
    if card:
        body['image'] = {'url': f'attachment://{card}'}
    return body


def card_name(match, mode):
    return f"{mode}-{match['id']}.jpg"


def schedule_url(match):
    return match.get('schedule_url') or f'{SITE_URL}/cronograma'


# --------------------------------------------------------------- events

def match_started(data):
    card = card_name(data, 'live')
    body = {
        'embeds': [embed(
            '🔴 ¡Comenzó el enfrentamiento!',
            f"{versus(data['teams'])}\n{context(data)}", ACCENT, card,
        )],
        'components': buttons(
            ('Ver transmisión', watch_url(data)),
            ('Página del juego', data['game'].get('url')),
        ),
    }
    return [(data['game']['name'], body, [(card, data, 'live')])]


def stream_live(data):
    stream, match, game = data['stream'], data.get('match'), data.get('game')
    lines = [f"**{stream['title']}**"]
    cards = []
    if match:
        lines += [versus(match['teams']), context(match)]
        cards.append((card_name(match, 'live'), match, 'live'))
    body = {
        'embeds': [embed(
            '📺 ¡Estamos en vivo!', '\n'.join(lines), ACCENT,
            cards[0][0] if cards else None,
        )],
        'components': buttons(('Ver transmisión', stream['url'])),
    }
    return [(game['name'] if game else None, body, cards)]


def match_result(data):
    teams = data['teams']
    if data['draw']:
        title = '🤝 Empate'
    elif len(teams) > 2:
        title = f"🏆 {team_name(data['winner'])} gana la partida"
    else:
        losers = ', '.join(team_name(t) for t in data['losers'])
        title = f"🏆 Victoria de {team_name(data['winner'])} sobre {losers}"
    if data.get('corrected'):
        title = f'✏️ Resultado corregido · {title}'

    if len(teams) > 2:
        # Free for all: the table by placement.
        ranked = sorted(teams, key=lambda t: t.get('placement') or 999)
        score = '\n'.join(
            f"{t.get('placement') or '-'}. **{team_name(t)}**"
            f" · {t.get('score', 0)} pts" for t in ranked
        )
    else:
        score = ' – '.join(
            f"**{team_name(t)}** {t.get('score', 0)}" for t in teams
        )
    card = card_name(data, 'result')
    body = {
        'embeds': [embed(
            title, f'{score}\n{context(data)}',
            MUTED if data['draw'] else WIN, card,
        )],
        'components': buttons(
            ('Ver tabla y llaves', data['game'].get('url')),
        ),
    }
    return [(data['game']['name'], body, [(card, data, 'result')])]


def match_scheduled(data):
    """One embed with its VS card per match, up to 10 per message."""
    by_game = defaultdict(list)
    for match in data['matches']:
        by_game[match['game']['name']].append(match)
    out = []
    for game, matches in by_game.items():
        matches.sort(key=lambda m: m.get('scheduled_at') or '')
        rescheduled = all(m.get('rescheduled') for m in matches)
        title = '🕑 Cambio de horario' if rescheduled else (
            '📅 Partida programada' if len(matches) == 1
            else '📅 Partidas programadas'
        )
        for start in range(0, len(matches), EMBEDS_PER_MESSAGE):
            chunk = matches[start:start + EMBEDS_PER_MESSAGE]
            embeds, cards = [], []
            for match in chunk:
                card = card_name(match, 'scheduled')
                embeds.append(embed(
                    title if not embeds and start == 0 else '',
                    f"{when(match['scheduled_at'])}\n"
                    f"{versus(match['teams'])} · {context(match)}",
                    WARN, card,
                ))
                cards.append((card, match, 'scheduled'))
            out.append((game, {
                'embeds': embeds,
                'components': buttons(
                    ('Ver cronograma', schedule_url(chunk[0])),
                ),
            }, cards))
    return out


RENDERERS = {
    'match.scheduled': match_scheduled,
    'match.started': match_started,
    'stream.live': stream_live,
    'match.result': match_result,
}


def render(event, data):
    renderer = RENDERERS.get(event)
    return renderer(data) if renderer else []
