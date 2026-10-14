import json
import os
import shutil
import tempfile
from decimal import Decimal
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from esports.models import Registration
from esports.tests.factories import (
    DEFAULT_PASSWORD, AdminGameFactory, GameFactory, RegistrationFactory,
    SiteSettingsFactory,
    SuperAdminFactory, TournamentFactory, image_file, member_payload,
    pdf_file,
)


MEDIA_ROOT = tempfile.mkdtemp()
PRIVATE_MEDIA_ROOT = os.path.join(MEDIA_ROOT, 'private')


@override_settings(MEDIA_ROOT=MEDIA_ROOT,
                   PRIVATE_MEDIA_ROOT=PRIVATE_MEDIA_ROOT)
class PrivateVoucherTestCase(APITestCase):
    """Payment vouchers are private: random name, outside the public media
    folder and only reachable with the signed link given to admins."""

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        SiteSettingsFactory()
        assignment = AdminGameFactory(
            game=GameFactory(min_players=5, max_players=7)
        )
        self.admin = assignment.admin
        self.tournament = TournamentFactory(
            game=assignment.game, fee_per_player=Decimal('5.00')
        )
        self.register_url = reverse(
            'tournaments-register', kwargs={'pk': self.tournament.pk}
        )

    def register(self, voucher):
        return self.client.post(self.register_url, {
            'team_name': 'Los Pumas',
            'contact_email': 'captain@unsa.edu.pe',
            'contact_phone': '987654321',
            'members': json.dumps(member_payload(5)),
            'voucher': voucher,
        })

    def admin_voucher_url(self, registration):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            reverse('registrations-detail', kwargs={'pk': registration.pk})
        )
        self.client.force_authenticate(user=None)
        return response.data['voucher']

    def test_voucher_is_stored_privately_with_a_random_name(self):
        # Act
        response = self.register(image_file('voucher-Los-Pumas.png'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        registration = Registration.objects.get(code=response.data['code'])
        name = registration.voucher.name
        self.assertNotIn('Pumas', name)
        self.assertTrue(
            os.path.isfile(os.path.join(PRIVATE_MEDIA_ROOT, name))
        )
        self.assertFalse(os.path.exists(os.path.join(MEDIA_ROOT, name)))

    def test_signed_link_serves_the_voucher(self):
        # Arrange
        response = self.register(image_file())
        registration = Registration.objects.get(code=response.data['code'])
        url = self.admin_voucher_url(registration)

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertIn('no-store', response['Cache-Control'])

    def test_voucher_without_signature_returns_403(self):
        # Arrange
        response = self.register(image_file())
        registration = Registration.objects.get(code=response.data['code'])
        url = reverse('registrations-voucher', kwargs={'pk': registration.pk})

        # Act
        response = self.client.get(url)
        forged = self.client.get(url + '?t=1:forged:signature')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(forged.status_code, status.HTTP_403_FORBIDDEN)

    def test_signature_of_another_registration_returns_403(self):
        # Arrange
        first = Registration.objects.get(
            code=self.register(image_file()).data['code']
        )
        second = RegistrationFactory(
            tournament=self.tournament, voucher=image_file()
        )
        token = self.admin_voucher_url(first).split('?t=')[1]
        url = reverse('registrations-voucher', kwargs={'pk': second.pk})

        # Act
        response = self.client.get(f'{url}?t={token}')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_expired_link_returns_403(self):
        # Arrange
        response = self.register(image_file())
        registration = Registration.objects.get(code=response.data['code'])
        url = self.admin_voucher_url(registration)

        # Act
        with mock.patch('esports.views.VOUCHER_LINK_SECONDS', -1):
            response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_fake_image_is_rejected(self):
        # Arrange: an HTML page renamed to .png
        fake = SimpleUploadedFile(
            'voucher.png', b'<script>alert(1)</script>',
            content_type='image/png',
        )

        # Act
        response = self.register(fake)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('voucher', response.data)

    def test_fake_pdf_is_rejected_and_real_pdf_accepted(self):
        # Arrange
        fake = SimpleUploadedFile(
            'voucher.pdf', b'<html></html>', content_type='application/pdf'
        )

        # Act
        rejected = self.register(fake)
        accepted = self.register(pdf_file('voucher.pdf'))

        # Assert
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(accepted.status_code, status.HTTP_201_CREATED)


class ThrottleTestCase(APITestCase):
    """Login, registration and the public search are limited per IP."""

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        rates = {'login': '3/min', 'register': '3/min', 'lookup': '3/min'}
        patcher = mock.patch.object(
            ScopedRateThrottle, 'THROTTLE_RATES', rates
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_login_is_limited(self):
        # Arrange
        url = reverse('admin-login')
        payload = {'username': 'nobody', 'password': 'wrong-password'}

        # Act
        codes = [self.client.post(url, payload).status_code for _ in range(4)]

        # Assert
        self.assertNotEqual(codes[2], status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(codes[3], status.HTTP_429_TOO_MANY_REQUESTS)

    def test_public_lookup_is_limited(self):
        # Arrange
        url = reverse('registrations-lookup')

        # Act
        codes = [
            self.client.get(url, {'q': 'Kusi'}).status_code for _ in range(4)
        ]

        # Assert
        self.assertEqual(codes[:3], [status.HTTP_200_OK] * 3)
        self.assertEqual(codes[3], status.HTTP_429_TOO_MANY_REQUESTS)


class TokenRevocationTestCase(APITestCase):

    def setUp(self):
        self.admin = AdminGameFactory().admin
        response = self.client.post(reverse('admin-login'), {
            'username': self.admin.username, 'password': DEFAULT_PASSWORD,
        })
        self.refresh = response.data['refresh']
        self.access = response.data['access']
        self.refresh_url = reverse('token_refresh')

    def test_refresh_rotates_and_old_token_stops_working(self):
        # Act
        first = self.client.post(self.refresh_url, {'refresh': self.refresh})
        again = self.client.post(self.refresh_url, {'refresh': self.refresh})

        # Assert
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertIn('refresh', first.data)
        self.assertEqual(again.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_the_refresh_token(self):
        # Act
        logout = self.client.post(
            reverse('admin-logout'), {'refresh': self.refresh}
        )
        response = self.client.post(
            self.refresh_url, {'refresh': self.refresh}
        )

        # Assert
        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_with_invalid_token_is_harmless(self):
        # Act
        response = self.client.post(
            reverse('admin-logout'), {'refresh': 'not-a-token'}
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_password_change_logs_out_other_sessions(self):
        # Arrange
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access}')

        # Act
        changed = self.client.post(reverse('admin-change-password'), {
            'old_password': DEFAULT_PASSWORD,
            'new_password': 'Otra-clave-segura-2026',
        })
        self.client.credentials()
        response = self.client.post(
            self.refresh_url, {'refresh': self.refresh}
        )

        # Assert
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_reset_logs_out_the_admin(self):
        # Arrange
        self.client.force_authenticate(user=SuperAdminFactory())

        # Act
        reset = self.client.post(
            reverse('admin-reset-password', kwargs={'pk': self.admin.pk}),
            {'new_password': 'Otra-clave-segura-2026'},
        )
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.refresh_url, {'refresh': self.refresh}
        )

        # Assert
        self.assertEqual(reset.status_code, status.HTTP_200_OK)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DeploySafetyTestCase(APITestCase):

    def test_seed_demo_refuses_to_run_without_debug(self):
        # The demo admins have a known password.
        self.assertFalse(settings.DEBUG)
        with self.assertRaises(CommandError):
            call_command('seed_demo')
