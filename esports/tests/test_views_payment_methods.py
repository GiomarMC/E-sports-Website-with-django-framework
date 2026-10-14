import shutil
import tempfile

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import PaymentMethod
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, GameFactory, PaymentMethodFactory,
    image_file,
)


MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class PaymentMethodViewSetTestCase(APITestCase):

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.game = assignment.game
        self.method = PaymentMethodFactory(game=self.game)
        self.list_url = reverse('payment-methods-list')
        self.detail_url = reverse(
            'payment-methods-detail', kwargs={'pk': self.method.pk}
        )

    def test_public_list_by_game_hides_inactive(self):
        # Arrange
        PaymentMethodFactory(game=self.game, active=False)
        PaymentMethodFactory()

        # Act
        response = self.client.get(self.list_url, {'game': self.game.pk})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [m['id'] for m in response.data], [self.method.pk]
        )
        self.assertEqual(response.data[0]['method_display'], 'Yape')

    def test_public_list_hides_inactive_games(self):
        # Arrange
        PaymentMethodFactory(game=GameFactory(active=False))

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(len(response.data), 1)

    def test_admin_list_shows_only_managed_games_including_inactive(self):
        # Arrange
        PaymentMethodFactory(game=self.game, active=False)
        PaymentMethodFactory()
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(len(response.data), 2)

    def test_create_yape(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'game': self.game.pk, 'method': 'yape',
            'holder_name': 'Valeria Quispe', 'phone_number': '987 654 321',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.game.payment_methods.count(), 2)

    def test_create_bank_transfer_with_qr(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'game': self.game.pk, 'method': 'bank_transfer',
            'holder_name': 'EPCC', 'bank_name': 'BCP',
            'account_number': '215-98765432-0-11',
            'cci': '00221519876543201155', 'qr_image': image_file('qr.png'),
        }

        # Act
        response = self.client.post(self.list_url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['qr_image'])

    def test_remove_qr(self):
        # Arrange
        self.method.qr_image = image_file('qr.png')
        self.method.save()
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'remove_qr': True}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.method.refresh_from_db()
        self.assertFalse(self.method.qr_image)

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.list_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_in_other_game_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())
        payload = {
            'game': self.game.pk, 'method': 'yape',
            'holder_name': 'x', 'phone_number': '987654321',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_yape_with_invalid_phone_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'game': self.game.pk, 'method': 'yape',
            'holder_name': 'x', 'phone_number': '12345',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone_number', response.data)

    def test_bank_transfer_without_account_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'game': self.game.pk, 'method': 'bank_transfer',
            'holder_name': 'x',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('bank_name', response.data)
        self.assertIn('account_number', response.data)

    def test_update_keeps_validation_with_current_values(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'phone_number': ''}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deactivate(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'active': False}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.method.refresh_from_db()
        self.assertFalse(self.method.active)

    def test_move_to_other_game_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'game': GameFactory().pk}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_from_other_game_admin_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.patch(
            self.detail_url, {'active': False}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_nonexistent_returns_404(self):
        # Act
        response = self.client.get(
            reverse('payment-methods-detail', kwargs={'pk': 99999})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_destroy(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.delete(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            PaymentMethod.objects.filter(pk=self.method.pk).exists()
        )
