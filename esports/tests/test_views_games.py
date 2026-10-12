import shutil
import tempfile

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import Game
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, GameFactory, SuperAdminFactory,
    image_file, pdf_file,
)


MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class GameViewSetTestCase(APITestCase):

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.superadmin = SuperAdminFactory()
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.game = assignment.game
        self.other_game = GameFactory()
        self.list_url = reverse('games-list')
        self.detail_url = reverse('games-detail', kwargs={'pk': self.game.pk})

    def test_public_list_hides_inactive_games(self):
        # Arrange
        GameFactory(active=False)

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_admin_list_includes_inactive_games(self):
        # Arrange
        GameFactory(active=False)
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(len(response.data), 3)

    def test_retrieve_nonexistent_returns_404(self):
        # Act
        response = self.client.get(
            reverse('games-detail', kwargs={'pk': 99999})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_as_superadmin_with_files(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            'name': 'Dota 2',
            'description': 'MOBA',
            'type_of_game': 'team',
            'min_players': 5,
            'max_players': 7,
            'images': image_file(),
            'bases': pdf_file(),
        }

        # Act
        response = self.client.post(self.list_url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        game = Game.objects.get(name='Dota 2')
        self.assertTrue(game.bases.name.endswith('.pdf'))

    def test_create_individual_game_forces_one_player(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            'name': 'Clash Royale', 'description': '1v1',
            'type_of_game': 'individual',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['max_players'], 1)

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.list_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_as_game_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(self.list_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_with_invalid_team_size_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            'name': 'LoL', 'description': 'MOBA', 'type_of_game': 'team',
            'min_players': 5, 'max_players': 3,
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('max_players', response.data)

    def test_create_with_invalid_bases_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            'name': 'LoL', 'description': 'MOBA', 'type_of_game': 'team',
            'min_players': 5, 'max_players': 5,
            'bases': image_file('bases.png'),
        }

        # Act
        response = self.client.post(self.list_url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('bases', response.data)

    def test_game_admin_updates_own_game_content(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'description': 'New description',
            'rules': 'No smurfs',
            'images': image_file(),
            'bases': pdf_file(),
        }

        # Act
        response = self.client.patch(self.detail_url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.game.refresh_from_db()
        self.assertEqual(self.game.description, 'New description')
        self.assertEqual(self.game.rules, 'No smurfs')
        self.assertTrue(self.game.images)

    def test_game_admin_cannot_update_other_game(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        url = reverse('games-detail', kwargs={'pk': self.other_game.pk})

        # Act
        response = self.client.patch(
            url, {'description': 'hacked'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.other_game.refresh_from_db()
        self.assertNotEqual(self.other_game.description, 'hacked')

    def test_game_admin_cannot_change_restricted_fields(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'name': 'Renamed'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unassigned_admin_cannot_update(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.patch(
            self.detail_url, {'description': 'x'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_nonexistent_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('games-detail', kwargs={'pk': 99999})

        # Act
        response = self.client.patch(url, {'rules': 'x'}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_deactivate_and_activate(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.post(
            reverse('games-deactivate', kwargs={'pk': self.game.pk})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.game.refresh_from_db()
        self.assertFalse(self.game.active)
        self.client.post(
            reverse('games-activate', kwargs={'pk': self.game.pk})
        )
        self.game.refresh_from_db()
        self.assertTrue(self.game.active)

    def test_destroy_as_game_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.delete(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_destroy_as_superadmin(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.delete(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Game.objects.filter(pk=self.game.pk).exists())
