"""Run with: python -m unittest discover bot"""
import hashlib
import hmac
import json
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest import mock

import cards
import templates
from app import Bot, Router, make_handler, valid_signature
from discord_api import multipart

SECRET = 'test-secret'
CONFIG = {
    'fallback': 'anuncios',
    'games': [{'match': ['left 4 dead'], 'art': 'left-4-dead.jpg', 'events': {
        'match.started': 'avisos-l4d', 'match.result': 'resultados-l4d',
    }}],
}


def team(id, name, score=None, logo=None, placement=None):
    data = {'id': id, 'name': name, 'logo': logo}
    if score is not None:
        data.update(score=score, placement=placement)
    return data


def match(**extra):
    data = {
        'id': 1, 'label': '', 'stage': 'Grupos', 'group': 'Grupo A',
        'round': 1, 'bracket': None, 'best_of': 3, 'status': 'live',
        'scheduled_at': '2026-10-29T01:00:00+00:00',
        'tournament': {'id': 1, 'name': 'Copa Left4dead'},
        'game': {'id': 3, 'name': 'Left 4 Dead 2',
                 'url': 'https://esports.example.com/juegos/3'},
        'teams': [team(7, 'Los niños', logo='https://e.com/a.png'),
                  team(9, 'chinitos')],
        'streams': [{'id': 5, 'title': 'Grupo A', 'platform': 'twitch',
                     'url': 'https://twitch.tv/semcom', 'is_live': True}],
        'schedule_url': 'https://esports.example.com/cronograma',
    }
    data.update(extra)
    return data


def signed(body, secret=SECRET, timestamp=None):
    timestamp = str(timestamp or int(time.time()))
    digest = hmac.new(
        secret.encode(), f'{timestamp}.'.encode() + body, hashlib.sha256
    ).hexdigest()
    return timestamp, f'sha256={digest}'


class SignatureTest(unittest.TestCase):

    def test_valid(self):
        timestamp, signature = signed(b'{}')
        self.assertTrue(valid_signature(SECRET, timestamp, signature, b'{}'))

    def test_other_secret_or_body(self):
        timestamp, signature = signed(b'{}', secret='other')
        self.assertFalse(valid_signature(SECRET, timestamp, signature, b'{}'))
        timestamp, signature = signed(b'{}')
        self.assertFalse(valid_signature(SECRET, timestamp, signature, b'[]'))

    def test_old_request(self):
        timestamp, signature = signed(b'{}', timestamp=int(time.time()) - 600)
        self.assertFalse(valid_signature(SECRET, timestamp, signature, b'{}'))


class TemplatesTest(unittest.TestCase):

    def test_match_started(self):
        [(game, body, specs)] = templates.render('match.started', match())
        self.assertEqual(game, 'Left 4 Dead 2')
        embed = body['embeds'][0]
        self.assertIn('**Los niños** vs **chinitos**', embed['description'])
        self.assertIn('Grupo A', embed['description'])
        self.assertEqual(embed['image']['url'], 'attachment://live-1.jpg')
        self.assertEqual([(n, m) for n, _, m in specs],
                         [('live-1.jpg', 'live')])
        button = body['components'][0]['components'][0]
        self.assertEqual(button['url'], 'https://twitch.tv/semcom')

    def test_match_result(self):
        data = match(
            status='completed',
            teams=[team(7, 'Los niños', 2), team(9, 'chinitos', 1)],
            draw=False, corrected=False,
        )
        data['winner'], data['losers'] = data['teams'][0], [data['teams'][1]]
        [(_, body, specs)] = templates.render('match.result', data)
        embed = body['embeds'][0]
        self.assertEqual(specs[0][2], 'result')
        self.assertEqual(embed['title'],
                         '🏆 Victoria de Los niños sobre chinitos')
        self.assertIn('**Los niños** 2 – **chinitos** 1',
                      embed['description'])

    def test_corrected_draw(self):
        data = match(teams=[team(7, 'A', 1), team(9, 'B', 1)], draw=True,
                     corrected=True, winner=None, losers=[])
        [(_, body, _)] = templates.render('match.result', data)
        self.assertEqual(body['embeds'][0]['title'],
                         '✏️ Resultado corregido · 🤝 Empate')

    def test_schedule_splits_long_lists(self):
        # A card per match, 10 per message (the Discord limit).
        matches = [match(id=n, rescheduled=False) for n in range(12)]
        first, second = templates.render(
            'match.scheduled', {'matches': matches}
        )
        self.assertEqual(first[0], 'Left 4 Dead 2')
        self.assertEqual(len(first[1]['embeds']), 10)
        self.assertEqual(len(first[2]), 10)
        self.assertEqual(len(second[1]['embeds']), 2)
        self.assertIn('title', first[1]['embeds'][0])
        self.assertNotIn('title', first[1]['embeds'][1])
        self.assertIn('<t:1793235600:F>',
                      first[1]['embeds'][0]['description'])

    def test_team_to_be_decided(self):
        data = match(teams=[team(None, None), team(9, 'chinitos')])
        [(_, body, _)] = templates.render('match.started', data)
        self.assertIn('**Por definir**', body['embeds'][0]['description'])

    def test_unknown_event(self):
        self.assertEqual(templates.render('ping', {}), [])


@mock.patch('cards.fetch_logo', return_value=None)
class CardsTest(unittest.TestCase):

    def test_every_mode_renders_a_jpeg(self, fetch_logo):
        data = match(teams=[team(7, 'Los niños', 2), team(9, 'chinitos', 1)])
        data['winner'] = data['teams'][0]
        for mode in ('scheduled', 'live', 'result'):
            image = cards.render(data, mode, 'left-4-dead.jpg')
            self.assertEqual(image[:2], b'\xff\xd8')

    def test_long_names_fit_in_two_lines(self, fetch_logo):
        from PIL import Image, ImageDraw
        draw = ImageDraw.Draw(Image.new('RGB', (10, 10)))
        face, lines = cards.fit_name(
            draw, 'equipoAlfaBuenaMaravillaOndaDinamitaEscuadronLobo'
        )
        self.assertEqual(len(lines), 2)
        self.assertEqual(''.join(lines),
                         'equipoAlfaBuenaMaravillaOndaDinamitaEscuadronLobo')
        for line in lines:
            self.assertLessEqual(draw.textlength(line, font=face),
                                 cards.NAME_WIDTH)

    def test_date_in_peru_time(self, fetch_logo):
        self.assertEqual(cards.when('2026-10-30T00:00:00+00:00'),
                         'JUEVES 29 OCT · 7:00 PM')
        self.assertEqual(cards.when(None), 'FECHA Y HORA POR CONFIRMAR')

    def test_unknown_art_and_team_to_be_decided(self, fetch_logo):
        data = match(teams=[team(None, None)])
        self.assertTrue(cards.render(data, 'scheduled', 'missing.jpg'))


class MultipartTest(unittest.TestCase):

    def test_payload_and_files(self):
        data, content_type = multipart({'a': 1}, [('live-1.jpg', b'IMG')])
        boundary = content_type.split('boundary=')[1]
        self.assertIn(b'name="payload_json"', data)
        self.assertIn(b'name="files[0]"; filename="live-1.jpg"', data)
        self.assertTrue(data.endswith(f'--{boundary}--\r\n'.encode()))


class RouterTest(unittest.TestCase):

    def test_game_and_fallback(self):
        router = Router(CONFIG)
        self.assertEqual(router.channel('match.result', 'Left 4 Dead 2'),
                         'resultados-l4d')
        self.assertEqual(router.channel('stream.live', 'Left 4 Dead 2'),
                         'anuncios')
        self.assertEqual(router.channel('match.result', 'Valorant'),
                         'anuncios')
        self.assertEqual(router.art('Left 4 Dead 2'), 'left-4-dead.jpg')
        self.assertIsNone(router.art('Valorant'))


class ServerTest(unittest.TestCase):
    """The real HTTP server with Discord replaced by a mock."""

    def setUp(self):
        patcher = mock.patch('cards.fetch_logo', return_value=None)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.discord = mock.Mock()
        self.bot = Bot(SECRET, self.discord, Router(CONFIG))
        self.server = ThreadingHTTPServer(
            ('127.0.0.1', 0), make_handler(self.bot)
        )
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        threading.Thread(target=self.bot.work, daemon=True).start()
        self.url = f'http://127.0.0.1:{self.server.server_port}/events'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def post(self, payload, secret=SECRET):
        body = json.dumps(payload).encode()
        timestamp, signature = signed(body, secret)
        request = urllib.request.Request(self.url, data=body, headers={
            'Content-Type': 'application/json',
            'X-Esports-Timestamp': timestamp,
            'X-Esports-Signature': signature,
        })
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_publishes_in_the_game_channel(self):
        status = self.post({'id': 'a', 'event': 'match.started',
                            'data': match()})
        self.bot.queue.join()
        self.assertEqual(status, 202)
        channel, body, files = self.discord.send.call_args.args
        self.assertEqual(channel, 'avisos-l4d')
        self.assertIn('Comenzó', body['embeds'][0]['title'])
        [(name, image)] = files
        self.assertEqual(name, 'live-1.jpg')
        self.assertEqual(image[:2], b'\xff\xd8')

    def test_message_goes_without_a_card_that_fails(self):
        with mock.patch('cards.render', side_effect=OSError('sin fuente')):
            self.post({'id': 'e', 'event': 'match.started', 'data': match()})
            self.bot.queue.join()
        _, body, files = self.discord.send.call_args.args
        self.assertEqual(files, [])
        self.assertNotIn('image', body['embeds'][0])

    def test_retry_of_the_site_is_posted_once(self):
        payload = {'id': 'b', 'event': 'match.started', 'data': match()}
        self.post(payload)
        self.post(payload)
        self.bot.queue.join()
        self.assertEqual(self.discord.send.call_count, 1)

    def test_bad_signature_is_rejected(self):
        status = self.post({'id': 'c', 'event': 'match.started',
                            'data': match()}, secret='other')
        self.assertEqual(status, 401)
        self.discord.send.assert_not_called()

    def test_ping_is_accepted_without_posting(self):
        status = self.post({'id': 'd', 'event': 'ping', 'data': {}})
        self.bot.queue.join()
        self.assertEqual(status, 202)
        self.discord.send.assert_not_called()


if __name__ == '__main__':
    unittest.main()
