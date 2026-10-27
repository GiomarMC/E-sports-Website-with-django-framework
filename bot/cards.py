"""Matchup cards: the VS image attached to the Discord messages (logos,
names, date or score over the art of the game)."""
import io
import logging
import os
import re
import threading
import urllib.request
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from PIL import (
    Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps,
)

logger = logging.getLogger(__name__)

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
W, H = 1200, 630
TILE = 210
LEFT_X, RIGHT_X, TILE_Y = 300, 900, 268
NAME_WIDTH = 400

ACCENT = (229, 72, 77)
WIN = (63, 178, 127)
WIN_INK = (10, 30, 20)
WHITE = (245, 245, 247)
MUTED = (170, 170, 182)
DARK = (22, 22, 27)

# The card is an image: the time is fixed in the event's zone (Peru has no
# daylight saving time).
ZONE = timezone(timedelta(hours=int(os.environ.get('BOT_UTC_OFFSET', '-5'))))
DAYS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO',
        'DOMINGO']
MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP',
          'OCT', 'NOV', 'DIC']

LOGO_TIMEOUT = 5
LOGO_MAX_BYTES = 6 * 1024 * 1024
LOGO_CACHE_SIZE = 64
_logos = OrderedDict()
_logos_lock = threading.Lock()


# ---------------------------------------------------------------- text

def font(size, weight='Bold'):
    path = os.path.join(ASSETS, 'fonts', 'Outfit.ttf')
    face = ImageFont.truetype(path, size)
    face.set_variation_by_name(weight)
    return face


def display(size):
    return ImageFont.truetype(
        os.path.join(ASSETS, 'fonts', 'Anton-Regular.ttf'), size
    )


def when(iso):
    if not iso:
        return 'FECHA Y HORA POR CONFIRMAR'
    date = datetime.fromisoformat(iso).astimezone(ZONE)
    hour = date.strftime('%I:%M').lstrip('0')
    suffix = 'AM' if date.hour < 12 else 'PM'
    return (f'{DAYS[date.weekday()]} {date.day} {MONTHS[date.month - 1]}'
            f' · {hour} {suffix}')


def initials(name):
    words = [w for w in (name or '?').replace('(', ' ').split()
             if w[0].isalnum()]
    return ''.join(w[0] for w in words[:2]).upper() or '?'


def split_word(draw, word, face, max_width):
    """A word wider than the line breaks between its camelCase parts
    (equipoAlfa|Buena), and with a hyphen if a part is still too wide.
    Returns [(text, glued to the previous token)]."""
    if draw.textlength(word, font=face) <= max_width:
        return [(word, False)]
    tokens, glued = [], False
    for part in re.split(r'(?<=[a-z])(?=[A-Z])', word):
        while draw.textlength(part, font=face) > max_width:
            cut = len(part)
            while cut > 1 and draw.textlength(
                    part[:cut] + '-', font=face) > max_width:
                cut -= 1
            tokens.append((part[:cut] + '-', glued))
            part, glued = part[cut:], True
        tokens.append((part, glued))
        glued = True
    return tokens


def fit_name(draw, text, max_width=NAME_WIDTH, sizes=(40, 36, 32, 28, 25),
             max_lines=2):
    """Largest size that fits the name in two lines (else cut with …)."""
    for size in sizes:
        face = font(size)
        lines, line = [], ''
        for word in text.split():
            for token, glued in split_word(draw, word, face, max_width):
                joined = line + token if glued or line.endswith('-') \
                    else f'{line} {token}'.strip()
                if not line or draw.textlength(joined, font=face) <= max_width:
                    line = joined
                else:
                    lines.append(line)
                    line = token
        lines.append(line)
        if len(lines) <= max_lines:
            return face, lines
    last = lines[max_lines - 1]
    while last and draw.textlength(last + '…', font=face) > max_width:
        last = last[:-1]
    return face, lines[:max_lines - 1] + [last + '…']


# --------------------------------------------------------------- logos

def fetch_logo(url):
    """Logo of a team from the site, cached; None if it cannot be read
    (the card shows the initials instead)."""
    if not url or not url.startswith(('https://', 'http://')):
        return None
    with _logos_lock:
        if url in _logos:
            _logos.move_to_end(url)
            return _logos[url]
    try:
        request = urllib.request.Request(
            url, headers={'User-Agent': 'EsportsBot/1.0'}
        )
        with urllib.request.urlopen(request, timeout=LOGO_TIMEOUT) as res:
            data = res.read(LOGO_MAX_BYTES + 1)
        if len(data) > LOGO_MAX_BYTES:
            raise ValueError('logo demasiado grande')
        logo = Image.open(io.BytesIO(data))
        logo.load()
    except Exception as error:
        logger.warning('Logo %s: %s', url, error)
        logo = None
    with _logos_lock:
        _logos[url] = logo
        if len(_logos) > LOGO_CACHE_SIZE:
            _logos.popitem(last=False)
    return logo


# ------------------------------------------------------------- drawing

def background(art):
    path = os.path.join(ASSETS, 'art', art) if art else None
    if path and os.path.exists(path):
        bg = ImageOps.fit(Image.open(path).convert('RGB'), (W, H))
        bg = ImageEnhance.Brightness(bg).enhance(0.38)
        bg = ImageEnhance.Color(bg).enhance(0.55)
    else:
        bg = Image.new('RGB', (W, H), DARK)
    # Warm on the left team's side, cold on the right one, dark at the
    # bottom for the footer.
    tint = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(tint)
    for x in range(W):
        t = x / W
        warm = int(120 * max(0, 1 - t * 1.6))
        cold = int(90 * max(0, t * 1.6 - 0.6))
        draw.line([(x, 0), (x, H)], fill=(ACCENT[0], 40, 50, warm)
                  if warm else (40, 60, 120, cold))
    bg = Image.alpha_composite(bg.convert('RGBA'), tint)
    fade = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(fade)
    for y in range(H):
        alpha = int(230 * max(0, (y - H * 0.55) / (H * 0.45)) ** 1.4)
        draw.line([(0, y), (W, y)], fill=(12, 12, 16, alpha))
    return Image.alpha_composite(bg, fade)


def tile(logo, name, ring=WHITE, dim=False):
    size = TILE
    mask = Image.new('L', (size, size))
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], 34, fill=255
    )
    if logo is not None:
        face = ImageOps.fit(logo.convert('RGB'), (size, size))
    else:
        face = Image.new('RGB', (size, size), (38, 38, 46))
        ImageDraw.Draw(face).text(
            (size / 2, size / 2), initials(name), font=display(96),
            fill=ACCENT, anchor='mm',
        )
    if dim:
        face = ImageEnhance.Brightness(
            ImageOps.grayscale(face).convert('RGB')
        ).enhance(0.55)
    out = Image.new('RGBA', (size + 16, size + 16))
    ImageDraw.Draw(out).rounded_rectangle(
        [0, 0, size + 15, size + 15], 40, fill=ring + (255,)
    )
    out.paste(face, (8, 8), mask)
    return out


def place(canvas, image, cx, cy, blur=18):
    shade = Image.new(
        'RGBA', (image.width + blur * 4, image.height + blur * 4)
    )
    shade.paste(
        Image.new('RGBA', image.size, (0, 0, 0, 150)),
        (blur * 2, blur * 2 + 10), image.split()[3],
    )
    shade = shade.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(
        shade, (cx - shade.width // 2, cy - shade.height // 2)
    )
    canvas.alpha_composite(
        image, (cx - image.width // 2, cy - image.height // 2)
    )


def pill(draw, text, xy, fill, fg=WHITE, right=False, dot=False,
         outline=None):
    face = font(24)
    start = 18 + (22 if dot else 0)
    width = draw.textlength(text, font=face) + start + 18
    x, y = xy
    if right:
        x -= width
    draw.rounded_rectangle([x, y, x + width, y + 44], 22, fill=fill,
                           outline=outline, width=2 if outline else 0)
    if dot:
        draw.ellipse([x + 18, y + 16, x + 30, y + 28], fill=fg)
    draw.text((x + start, y + 22), text, font=face, fill=fg, anchor='lm')


def stage_label(match):
    if match.get('group'):
        parts = [match['group'], match.get('label')
                 or f"Fecha {match['round']}"]
    else:
        parts = [match['stage'], match.get('label')]
    return ' · '.join(p for p in parts if p).upper()


def render(match, mode, art=None, event='SEMCOM 2026'):
    """JPEG bytes of the card. ``mode``: scheduled, live or result."""
    canvas = background(art)
    draw = ImageDraw.Draw(canvas)
    teams = (match['teams'] + [{'id': None, 'name': None}] * 2)[:2]

    # Header: brand, tournament and stage.
    mark = Image.new('RGBA', (44, 44))
    mark_draw = ImageDraw.Draw(mark)
    mark_draw.rounded_rectangle([0, 0, 43, 43], 11, fill=DARK)
    mark_draw.polygon([(12, 30), (22, 11), (32, 30), (26.5, 30), (22, 22),
                       (18, 30)], fill=ACCENT)
    canvas.alpha_composite(mark, (48, 40))
    draw.text((106, 62), match['tournament']['name'].upper(),
              font=font(24, 'SemiBold'), fill=WHITE, anchor='lm')
    pill(draw, stage_label(match), (W - 48, 40), (24, 24, 30), right=True,
         outline=(88, 88, 98))

    winner_id = (match.get('winner') or {}).get('id')
    decided = mode == 'result' and winner_id is not None
    for team, cx in zip(teams, (LEFT_X, RIGHT_X)):
        won = decided and team['id'] == winner_id
        lost = decided and not won
        name = team.get('name') or 'Por definir'
        ring = WIN if won else ((90, 90, 100) if lost else WHITE)
        place(canvas, tile(fetch_logo(team.get('logo')), name, ring, lost),
              cx, TILE_Y)
        face, lines = fit_name(draw, name)
        y = TILE_Y + TILE // 2 + 30
        for line in lines:
            draw.text((cx, y), line, font=face,
                      fill=MUTED if lost else WHITE, anchor='mt')
            y += face.size + 6
        if won:
            pill(draw, 'GANADOR', (cx - 70, TILE_Y - TILE // 2 - 62), WIN,
                 fg=WIN_INK)

    # Center: VS, or the score once there is a result.
    if mode == 'result':
        score = f"{teams[0].get('score', 0)}-{teams[1].get('score', 0)}"
        draw.text((W / 2, TILE_Y - 10), score, font=display(150),
                  fill=WHITE, anchor='mm', stroke_width=2,
                  stroke_fill=(0, 0, 0))
    else:
        draw.text((W / 2 + 5, TILE_Y + 5), 'VS', font=display(170),
                  fill=ACCENT, anchor='mm')
        draw.text((W / 2, TILE_Y), 'VS', font=display(170), fill=WHITE,
                  anchor='mm')

    # Footer: date, live badge or official result.
    draw.line([(48, H - 92), (W - 48, H - 92)], fill=(78, 78, 88), width=2)
    if mode == 'live':
        pill(draw, 'EN VIVO', (48, H - 70), ACCENT, dot=True)
    elif mode == 'result':
        pill(draw, 'RESULTADO OFICIAL', (48, H - 70), WIN, fg=WIN_INK)
    else:
        draw.text((48, H - 48), when(match.get('scheduled_at')),
                  font=font(34), fill=WHITE, anchor='lm')
    draw.text((W - 48, H - 48), f"BO{match['best_of']}  ·  {event}",
              font=font(26, 'SemiBold'), fill=MUTED, anchor='rm')

    out = io.BytesIO()
    canvas.convert('RGB').save(out, 'JPEG', quality=88, optimize=True)
    return out.getvalue()
