from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import ContactInfo
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, GameFactory, StreamFactory,
    SuperAdminFactory,
)


class StreamViewSetTestCase(APITestCase):

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.game = assignment.game
        self.stream = StreamFactory(game=self.game, is_live=True)
        StreamFactory(is_live=False)
        self.list_url = reverse('streams-list')
        self.detail_url = reverse(
            'streams-detail', kwargs={'pk': self.stream.pk}
        )

    def test_public_list_live_streams(self):
        # Act
        response = self.client.get(self.list_url, {'live': 'true'})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([s['id'] for s in response.data], [self.stream.id])

    def test_retrieve_nonexistent_returns_404(self):
        # Act
        response = self.client.get(
            reverse('streams-detail', kwargs={'pk': 99999})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_for_own_game(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'title': 'Finals', 'platform': 'youtube',
            'url': 'https://youtube.com/live/abc', 'game': self.game.pk,
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.list_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_for_other_game_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'title': 'x', 'platform': 'twitch',
            'url': 'https://twitch.tv/x', 'game': GameFactory().pk,
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_global_stream_only_for_superadmin(self):
        # Arrange
        payload = {
            'title': 'Main channel', 'platform': 'twitch',
            'url': 'https://twitch.tv/main',
        }
        self.client.force_authenticate(user=self.admin)

        # Act
        as_admin = self.client.post(self.list_url, payload, format='json')
        self.client.force_authenticate(user=SuperAdminFactory())
        as_superadmin = self.client.post(
            self.list_url, payload, format='json'
        )

        # Assert
        self.assertEqual(as_admin.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(as_superadmin.status_code, status.HTTP_201_CREATED)

    def test_create_with_invalid_url_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'title': 'x', 'platform': 'twitch', 'url': 'not-a-url',
            'game': self.game.pk,
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('url', response.data)

    def test_toggle_live(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'is_live': False}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.stream.refresh_from_db()
        self.assertFalse(self.stream.is_live)

    def test_update_unassigned_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.patch(
            self.detail_url, {'is_live': False}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ContactInfoViewSetTestCase(APITestCase):

    def setUp(self):
        self.url = reverse('contacts-list')
        self.payload = {
            'platform': 'Instagram', 'link': 'https://instagram.com/x'
        }

    def test_public_list(self):
        # Act
        response = self.client.get(self.url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_as_superadmin(self):
        # Arrange
        self.client.force_authenticate(user=SuperAdminFactory())

        # Act
        response = self.client.post(self.url, self.payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ContactInfo.objects.count(), 1)

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.url, self.payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_as_game_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.post(self.url, self.payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
