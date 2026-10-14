from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import OrganizerContact
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, GameFactory,
    OrganizerContactFactory, SuperAdminFactory, TournamentFactory,
)


class OrganizerContactViewSetTestCase(APITestCase):

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.tournament = TournamentFactory(game=assignment.game)
        self.contact = OrganizerContactFactory(tournament=self.tournament)
        self.general = OrganizerContactFactory(
            tournament=None, kind='email', value='esports@unsa.edu.pe'
        )
        self.list_url = reverse('organizer-contacts-list')
        self.detail_url = reverse(
            'organizer-contacts-detail', kwargs={'pk': self.contact.pk}
        )

    def payload(self, **extra):
        return {
            'tournament': self.tournament.pk, 'kind': 'whatsapp',
            'name': 'Renzo Mamani', 'role': 'Organizador',
            'value': '987 654 321', **extra,
        }

    def test_public_list_by_tournament_with_whatsapp_link(self):
        # Arrange
        OrganizerContactFactory(tournament=self.tournament, active=False)

        # Act
        response = self.client.get(
            self.list_url, {'tournament': self.tournament.pk}
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]['link'],
            f'https://wa.me/51{self.contact.value}',
        )

    def test_public_general_list(self):
        # Act
        response = self.client.get(self.list_url, {'general': 'true'})

        # Assert
        self.assertEqual([c['id'] for c in response.data], [self.general.pk])
        self.assertEqual(
            response.data[0]['link'], 'mailto:esports@unsa.edu.pe'
        )

    def test_public_list_hides_inactive_games(self):
        # Arrange
        hidden = TournamentFactory(game=GameFactory(active=False))
        OrganizerContactFactory(tournament=hidden)

        # Act
        response = self.client.get(self.list_url, {'tournament': hidden.pk})

        # Assert
        self.assertEqual(response.data, [])

    def test_create_normalizes_the_number(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.list_url, self.payload(value='+51 987-654-321'),
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['value'], '987654321')

    def test_create_whatsapp_group(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        link = 'https://chat.whatsapp.com/AbCdEf123'

        # Act
        response = self.client.post(
            self.list_url,
            self.payload(kind='whatsapp_group', name='Grupo', value=link),
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['link'], link)

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(
            self.list_url, self.payload(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_in_other_game_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.post(
            self.list_url, self.payload(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_game_admin_cannot_create_general_contact(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.list_url, self.payload(tournament=None), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superadmin_creates_general_contact(self):
        # Arrange
        self.client.force_authenticate(user=SuperAdminFactory())

        # Act
        response = self.client.post(
            self.list_url, self.payload(tournament=None), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['tournament'])

    def test_invalid_number_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.list_url, self.payload(value='12345'), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('value', response.data)

    def test_group_with_other_link_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.list_url,
            self.payload(kind='whatsapp_group', value='https://example.com'),
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('value', response.data)

    def test_changing_kind_validates_current_value(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'kind': 'email'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'role': 'Árbitro'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.role, 'Árbitro')

    def test_game_admin_cannot_edit_general_contact(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        url = reverse(
            'organizer-contacts-detail', kwargs={'pk': self.general.pk}
        )

        # Act
        response = self.client.patch(url, {'name': 'x'}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_from_other_game_admin_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.patch(
            self.detail_url, {'name': 'x'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_nonexistent_returns_404(self):
        # Act
        response = self.client.get(
            reverse('organizer-contacts-detail', kwargs={'pk': 99999})
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
            OrganizerContact.objects.filter(pk=self.contact.pk).exists()
        )
