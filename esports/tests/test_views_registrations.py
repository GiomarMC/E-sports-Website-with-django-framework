from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import Registration
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, RegistrationFactory,
    RegistrationMemberFactory, SuperAdminFactory, TournamentFactory,
)


class RegistrationViewSetTestCase(APITestCase):

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.tournament = TournamentFactory(game=assignment.game)
        self.registration = RegistrationFactory(
            tournament=self.tournament, status='pending'
        )
        RegistrationMemberFactory(
            registration=self.registration, is_captain=True,
            nickname='Miracle'
        )
        self.foreign = RegistrationFactory()
        self.list_url = reverse('registrations-list')
        self.detail_url = reverse(
            'registrations-detail', kwargs={'pk': self.registration.pk}
        )

    def action_url(self, name, registration=None):
        registration = registration or self.registration
        return reverse(
            f'registrations-{name}', kwargs={'pk': registration.pk}
        )

    def test_list_only_managed_games(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [r['id'] for r in response.data], [self.registration.id]
        )
        self.assertIn('contact_email', response.data[0])

    def test_superadmin_lists_everything(self):
        # Arrange
        self.client.force_authenticate(user=SuperAdminFactory())

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(len(response.data), 2)

    def test_list_filters_and_search(self):
        # Arrange
        RegistrationFactory(tournament=self.tournament, status='confirmed')
        self.client.force_authenticate(user=self.admin)

        # Act
        by_status = self.client.get(self.list_url, {'status': 'pending'})
        by_search = self.client.get(self.list_url, {'search': 'mirac'})

        # Assert
        self.assertEqual(len(by_status.data), 1)
        self.assertEqual(by_search.data[0]['id'], self.registration.id)

    def test_list_without_auth_returns_401(self):
        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_foreign_registration_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        url = reverse(
            'registrations-detail', kwargs={'pk': self.foreign.pk}
        )

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_confirm(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(self.action_url('confirm'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.status, 'confirmed')
        self.assertEqual(self.registration.reviewed_by, self.admin)

    def test_confirm_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.action_url('confirm'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_confirm_as_unassigned_admin_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.post(self.action_url('confirm'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_reject_with_reason(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.action_url('reject'),
            {'reason': 'Invalid voucher'},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.status, 'rejected')
        self.assertEqual(self.registration.rejection_reason, 'Invalid voucher')

    def test_disable_and_enable(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(self.action_url('disable'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.registration.refresh_from_db()
        self.assertFalse(self.registration.is_active)
        self.client.post(self.action_url('enable'))
        self.registration.refresh_from_db()
        self.assertTrue(self.registration.is_active)

    def test_patch_seed(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'seed': 1}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.seed, 1)

    def test_registration_data_cannot_be_edited(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        original_name = self.registration.team_name
        original_email = self.registration.contact_email

        # Act
        self.client.patch(
            self.detail_url,
            {'team_name': 'Renamed', 'contact_email': 'new@unsa.edu.pe'},
            format='json',
        )

        # Assert
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.team_name, original_name)
        self.assertEqual(self.registration.contact_email, original_email)

    def test_put_is_not_allowed(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.put(self.detail_url, {}, format='json')

        # Assert
        self.assertEqual(
            response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def test_patch_cannot_change_status_directly(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        self.client.patch(
            self.detail_url, {'status': 'confirmed'}, format='json'
        )

        # Assert
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.status, 'pending')

    def test_patch_invalid_seed_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'seed': -1}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('seed', response.data)

    def test_destroy(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.delete(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            Registration.objects.filter(pk=self.registration.pk).exists()
        )

    def test_public_status_by_code(self):
        # Arrange
        url = reverse(
            'registrations-check-status',
            kwargs={'code': str(self.registration.code)},
        )

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'pending')
        self.assertNotIn('contact_email', response.data)

    def test_public_status_unknown_code_returns_404(self):
        # Arrange
        url = reverse(
            'registrations-check-status',
            kwargs={'code': '00000000-0000-0000-0000-000000000000'},
        )

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_status_invalid_code_returns_400(self):
        # Arrange
        url = reverse(
            'registrations-check-status', kwargs={'code': 'abc'}
        )

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
