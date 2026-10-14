from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import AdminGame, CustomUser, SiteSettings
from esports.tests.factories import (
    DEFAULT_PASSWORD, AdminGameFactory, AdminUserFactory, GameFactory,
    SuperAdminFactory,
)


class AdminLoginTestCase(APITestCase):

    def setUp(self):
        self.admin = AdminUserFactory()
        self.url = reverse('admin-login')

    def test_login_returns_tokens(self):
        # Arrange
        payload = {
            'username': self.admin.username, 'password': DEFAULT_PASSWORD
        }

        # Act
        response = self.client.post(self.url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['admin']['id'], self.admin.id)

    def test_login_with_wrong_password_returns_401(self):
        # Act
        response = self.client.post(
            self.url,
            {'username': self.admin.username, 'password': 'wrong'},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_without_fields_returns_400(self):
        # Act
        response = self.client.post(self.url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_jwt_token_authenticates_requests(self):
        # Arrange
        response = self.client.post(
            self.url,
            {'username': self.admin.username, 'password': DEFAULT_PASSWORD},
            format='json',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {response.data['access']}"
        )

        # Act
        me = self.client.get(reverse('admin-me'))

        # Assert
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['username'], self.admin.username)

    def tearDown(self):
        self.client.credentials()


class AdminManagementTestCase(APITestCase):

    def setUp(self):
        self.superadmin = SuperAdminFactory()
        self.admin = AdminUserFactory()
        self.game = GameFactory()
        self.list_url = reverse('admin-list')
        self.detail_url = reverse('admin-detail', kwargs={'pk': self.admin.pk})

    def test_list_as_superadmin_returns_200(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_without_auth_returns_401(self):
        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_as_game_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_admin_with_games(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            'username': 'dota_admin',
            'password': 'Sup3r-Secret-99',
            'role': 'admin',
            'game_ids': [self.game.pk],
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = CustomUser.objects.get(username='dota_admin')
        self.assertTrue(user.check_password('Sup3r-Secret-99'))
        self.assertTrue(
            AdminGame.objects.filter(admin=user, game=self.game).exists()
        )

    def test_create_with_invalid_role_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            'username': 'x', 'password': 'Sup3r-Secret-99', 'role': 'player'
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)

    def test_create_with_weak_password_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        payload = {'username': 'x', 'password': '123', 'role': 'admin'}

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_retrieve_nonexistent_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('admin-detail', kwargs={'pk': 99999})

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partial_update(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.patch(
            self.detail_url, {'nickname': 'Boss'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.nickname, 'Boss')

    def test_superadmin_cannot_change_own_role(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('admin-detail', kwargs={'pk': self.superadmin.pk})

        # Act
        response = self.client.patch(url, {'role': 'admin'}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_destroy(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.delete(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CustomUser.objects.filter(pk=self.admin.pk).exists())

    def test_cannot_delete_own_account(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('admin-detail', kwargs={'pk': self.superadmin.pk})

        # Act
        response = self.client.delete(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reset_password(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('admin-reset-password', kwargs={'pk': self.admin.pk})

        # Act
        response = self.client.post(
            url, {'new_password': 'N3w-Password-77'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password('N3w-Password-77'))

    def test_reset_own_password_returns_400(self):
        # Own password goes through change-password (asks the current one).
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        url = reverse(
            'admin-reset-password', kwargs={'pk': self.superadmin.pk}
        )

        # Act
        response = self.client.post(
            url, {'new_password': 'N3w-Password-77'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.superadmin.refresh_from_db()
        self.assertFalse(self.superadmin.check_password('N3w-Password-77'))

    def test_assign_games_replaces_assignments(self):
        # Arrange
        AdminGameFactory(admin=self.admin)
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('admin-games', kwargs={'pk': self.admin.pk})

        # Act
        response = self.client.put(
            url, {'game_ids': [self.game.pk]}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            list(self.admin.managed_games()), [self.game]
        )

    def test_assign_games_to_superadmin_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('admin-games', kwargs={'pk': self.superadmin.pk})

        # Act
        response = self.client.put(
            url, {'game_ids': [self.game.pk]}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ChangePasswordTestCase(APITestCase):

    def setUp(self):
        self.admin = AdminUserFactory()
        self.url = reverse('admin-change-password')

    def test_change_password(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'old_password': DEFAULT_PASSWORD,
            'new_password': 'An0ther-Pass-55',
        }

        # Act
        response = self.client.post(self.url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password('An0ther-Pass-55'))

    def test_wrong_old_password_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {'old_password': 'nope', 'new_password': 'An0ther-Pass-55'}

        # Act
        response = self.client.post(self.url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class SiteSettingsViewTestCase(APITestCase):

    def setUp(self):
        self.superadmin = SuperAdminFactory()
        self.admin = AdminUserFactory()
        self.url = reverse('site-settings')

    def test_get_is_public(self):
        # Act
        response = self.client.get(self.url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('registration_enabled', response.data)

    def test_patch_as_superadmin(self):
        # Arrange
        self.client.force_authenticate(user=self.superadmin)

        # Act
        response = self.client.patch(
            self.url, {'registration_enabled': False}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(SiteSettings.load().registration_enabled)

    def test_patch_without_auth_returns_401(self):
        # Act
        response = self.client.patch(self.url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patch_as_game_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(self.url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_has_no_general_registration_dates(self):
        # Each tournament sets its own registration dates.
        # Act
        response = self.client.get(self.url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('registration_start', response.data)
        self.assertNotIn('registration_end', response.data)
