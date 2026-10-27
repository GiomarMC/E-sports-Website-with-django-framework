import hashlib
import hmac
import json
from unittest import mock
from urllib.error import HTTPError, URLError

from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from esports import services, webhooks
from esports.models import Webhook
from esports.tests.factories import (
    AdminGameFactory, StageFactory, StreamFactory, SuperAdminFactory,
    TournamentFactory, confirmed_registrations,
)


def ok_response():
    response = mock.MagicMock()
    response.__enter__.return_value.status = 200
    return response


@override_settings(SITE_URL='https://esports.example.com')
@mock.patch('esports.webhooks.urlopen', return_value=ok_response())
class WebhookEventsTestCase(APITestCase):
    """The site POSTs the public events to every subscribed webhook."""

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.game = assignment.game
        self.tournament = TournamentFactory(game=self.game)
        self.stage = StageFactory(tournament=self.tournament)
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        self.match = self.stage.matches.filter(round=1).first()
        self.ids = [
            p.registration_id for p in self.match.participants.all()
        ]
        self.hook = Webhook.objects.create(
            name='Bot', url='https://bot.example.com/hook'
        )
        self.detail_url = reverse(
            'matches-detail', kwargs={'pk': self.match.pk}
        )
        self.client.force_authenticate(user=self.admin)

    def sent(self, urlopen):
        """(event, payload, request) of every POST, in order."""
        out = []
        for call in urlopen.call_args_list:
            request = call.args[0]
            payload = json.loads(request.data)
            out.append((payload['event'], payload, request))
        return out

    def test_match_started_includes_its_live_streams(self, urlopen):
        # Arrange
        StreamFactory(game=self.game, match=self.match)

        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(
                self.detail_url, {'status': 'live'}, format='json'
            )

        # Assert
        [(event, payload, _)] = self.sent(urlopen)
        self.assertEqual(event, 'match.started')
        data = payload['data']
        self.assertEqual(len(data['teams']), 2)
        self.assertTrue(data['streams'][0]['is_live'])
        self.assertEqual(
            data['game']['url'],
            f'https://esports.example.com/juegos/{self.game.pk}'
        )

    def test_request_is_signed_with_the_secret(self, urlopen):
        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(
                self.detail_url, {'status': 'live'}, format='json'
            )

        # Assert
        [(_, _, request)] = self.sent(urlopen)
        timestamp = request.get_header('X-esports-timestamp')
        expected = hmac.new(
            self.hook.secret.encode(),
            f'{timestamp}.'.encode() + request.data, hashlib.sha256,
        ).hexdigest()
        self.assertEqual(
            request.get_header('X-esports-signature'), f'sha256={expected}'
        )
        self.assertEqual(request.get_header('X-esports-event'),
                         'match.started')

    def test_official_result(self, urlopen):
        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                reverse('matches-result', kwargs={'pk': self.match.pk}),
                {'scores': [
                    {'registration': self.ids[0], 'score': 2},
                    {'registration': self.ids[1], 'score': 1},
                ]},
                format='json',
            )

        # Assert
        [(event, payload, _)] = self.sent(urlopen)
        data = payload['data']
        self.assertEqual(event, 'match.result')
        self.assertEqual(data['winner']['id'], self.ids[0])
        self.assertEqual(data['winner']['score'], 2)
        self.assertEqual([t['id'] for t in data['losers']], [self.ids[1]])
        self.assertFalse(data['draw'])
        self.assertFalse(data['corrected'])

    def test_corrected_result(self, urlopen):
        # Arrange
        services.record_result(self.match, {self.ids[0]: 2, self.ids[1]: 0})

        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                reverse('matches-result', kwargs={'pk': self.match.pk}),
                {'winner': self.ids[1]}, format='json',
            )

        # Assert
        [(_, payload, _)] = self.sent(urlopen)
        self.assertTrue(payload['data']['corrected'])

    def test_failed_result_is_not_announced(self, urlopen):
        # Act: no winner in a match that feeds the bracket.
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse('matches-result', kwargs={'pk': self.match.pk}),
                {'draw': True}, format='json',
            )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(urlopen.call_count, 0)

    def test_match_scheduled(self, urlopen):
        # Act
        when = timezone.now().replace(microsecond=0)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(
                self.detail_url, {'scheduled_at': when.isoformat()},
                format='json',
            )

        # Assert
        [(event, payload, _)] = self.sent(urlopen)
        self.assertEqual(event, 'match.scheduled')
        [match] = payload['data']['matches']
        self.assertEqual(match['id'], self.match.pk)
        self.assertFalse(match['rescheduled'])

    def test_auto_schedule_is_a_single_event(self, urlopen):
        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                reverse('stages-auto-schedule', kwargs={'pk': self.stage.pk}),
                {'start': timezone.now().isoformat(), 'interval_minutes': 60},
                format='json',
            )

        # Assert
        [(event, payload, _)] = self.sent(urlopen)
        self.assertEqual(event, 'match.scheduled')
        self.assertEqual(len(payload['data']['matches']), 3)

    def test_stream_turned_on_by_hand(self, urlopen):
        # Arrange
        stream = StreamFactory(game=self.game)

        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(
                reverse('streams-detail', kwargs={'pk': stream.pk}),
                {'is_live': True}, format='json',
            )

        # Assert
        [(event, payload, _)] = self.sent(urlopen)
        self.assertEqual(event, 'stream.live')
        self.assertEqual(payload['data']['stream']['id'], stream.pk)
        self.assertEqual(payload['data']['game']['id'], self.game.pk)
        self.assertIsNone(payload['data']['match'])

    def test_only_subscribed_and_active_hooks(self, urlopen):
        # Arrange
        self.hook.events = ['match.result']
        self.hook.save()
        Webhook.objects.create(
            name='Off', url='https://off.example.com', active=False
        )

        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(
                self.detail_url, {'status': 'live'}, format='json'
            )

        # Assert
        self.assertEqual(urlopen.call_count, 0)

    def test_only_public_data(self, urlopen):
        # Act
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(
                self.detail_url, {'status': 'live'}, format='json'
            )

        # Assert
        [(_, _, request)] = self.sent(urlopen)
        body = request.data.decode()
        for private in ['student_code', 'contact_phone', 'contact_email',
                        'voucher', 'secret', 'notes']:
            self.assertNotIn(private, body)


@mock.patch('esports.webhooks.time.sleep')
class WebhookDeliveryTestCase(APITestCase):

    def setUp(self):
        self.hook = Webhook.objects.create(
            name='Bot', url='https://bot.example.com/hook'
        )
        self.body = webhooks.encode('ping', {})

    def http_error(self, code):
        return HTTPError(self.hook.url, code, 'error', {}, None)

    def test_retries_when_the_receiver_is_down(self, sleep):
        # Arrange
        with mock.patch('esports.webhooks.urlopen', side_effect=[
                URLError('refused'), self.http_error(502), ok_response()
        ]) as urlopen:
            # Act
            ok, status_text = webhooks.deliver(self.hook, 'ping', self.body)

        # Assert
        self.assertTrue(ok)
        self.assertEqual(urlopen.call_count, 3)
        self.hook.refresh_from_db()
        self.assertEqual(self.hook.last_status, 'HTTP 200')

    def test_rejected_request_is_not_retried(self, sleep):
        # Arrange
        with mock.patch('esports.webhooks.urlopen',
                        side_effect=self.http_error(401)) as urlopen:
            # Act
            ok, status_text = webhooks.deliver(self.hook, 'ping', self.body)

        # Assert
        self.assertFalse(ok)
        self.assertEqual(urlopen.call_count, 1)
        self.hook.refresh_from_db()
        self.assertEqual(self.hook.last_status, 'HTTP 401')


class WebhookViewSetTestCase(APITestCase):

    def setUp(self):
        self.superadmin = SuperAdminFactory()
        self.list_url = reverse('webhooks-list')

    def test_superadmin_creates_a_webhook(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(self.list_url, {
            'name': 'Discord bot', 'url': 'https://bot.example.com/hook',
            'events': ['match.result', 'match.result'],
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['secret']), 64)
        self.assertEqual(response.data['events'], ['match.result'])

    def test_plain_http_is_rejected(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(self.list_url, {
            'name': 'Bot', 'url': 'http://bot.example.com/hook',
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('url', response.data)

    def test_internal_service_can_use_http(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(self.list_url, {
            'name': 'Bot', 'url': 'http://bot:8080/events',
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_invalid_address_is_rejected(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(self.list_url, {
            'name': 'Bot', 'url': 'bot:8080/events',
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_event_is_rejected(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(self.list_url, {
            'name': 'Bot', 'url': 'https://bot.example.com/hook',
            'events': ['match.deleted'],
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_game_admin_cannot_see_webhooks(self):
        # Arrange
        Webhook.objects.create(name='Bot', url='https://bot.example.com')
        self.client.force_authenticate(user=AdminGameFactory().admin)

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @mock.patch('esports.webhooks.urlopen', return_value=ok_response())
    def test_ping(self, urlopen):
        # Arrange
        hook = Webhook.objects.create(name='Bot', url='https://bot.ex.com')
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(
            reverse('webhooks-test', kwargs={'pk': hook.pk})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['ok'])
        payload = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(payload['event'], 'ping')

    def test_rotate_secret(self):
        # Arrange
        hook = Webhook.objects.create(name='Bot', url='https://bot.ex.com')
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(
            reverse('webhooks-rotate-secret', kwargs={'pk': hook.pk})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(response.data['secret'], hook.secret)
