import shutil
import tempfile
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import Registration
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, RegistrationFactory,
    RegistrationMemberFactory, SuperAdminFactory, TournamentFactory,
    image_file,
)


MEDIA_ROOT = tempfile.mkdtemp()


class RegistrationViewSetTestCase(APITestCase):

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

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

    def test_patch_team_data(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url,
            {'team_name': ' Renamed ', 'contact_email': 'new@unsa.edu.pe',
             'contact_phone': '987654321'},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.team_name, 'Renamed')
        self.assertEqual(self.registration.contact_email, 'new@unsa.edu.pe')

    def test_patch_logo(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        with self.settings(MEDIA_ROOT=MEDIA_ROOT):
            response = self.client.patch(
                self.detail_url, {'logo': image_file('logo.png')},
                format='multipart',
            )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.registration.refresh_from_db()
        self.assertTrue(self.registration.logo.name.startswith('logos/'))

    def test_patch_repeated_team_name_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        RegistrationFactory(tournament=self.tournament, team_name='Taken')

        # Act
        response = self.client.patch(
            self.detail_url, {'team_name': 'taken'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('team_name', response.data)

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


class RegistrationLookupTestCase(APITestCase):
    """Public search of the status by team name or nickname."""

    def setUp(self):
        self.url = reverse('registrations-lookup')
        self.team = RegistrationFactory(
            team_name='Cóndores del Misti', status='confirmed'
        )
        RegistrationMemberFactory(
            registration=self.team, nickname='Kusi', is_captain=True
        )
        # Another team with a player with the same nickname.
        self.other = RegistrationFactory(
            team_name='Llamas Furiosas', status='rejected',
            rejection_reason='Voucher ilegible',
        )
        RegistrationMemberFactory(
            registration=self.other, nickname='kusi', is_captain=True
        )

    def test_by_team_name(self):
        # Act
        response = self.client.get(self.url, {'q': 'cóndores'})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [r['id'] for r in response.data['results']], [self.team.pk]
        )
        self.assertFalse(response.data['truncated'])

    def test_shared_nickname_returns_every_team(self):
        # Act
        response = self.client.get(self.url, {'q': 'KUSI'})

        # Assert
        self.assertEqual(
            {r['id'] for r in response.data['results']},
            {self.team.pk, self.other.pk},
        )
        rejected = next(
            r for r in response.data['results'] if r['id'] == self.other.pk
        )
        self.assertEqual(rejected['rejection_reason'], 'Voucher ilegible')

    def test_only_public_data(self):
        # Act
        result = self.client.get(self.url, {'q': 'Kusi'}).data['results'][0]

        # Assert
        for private in ['code', 'contact_email', 'contact_phone', 'voucher']:
            self.assertNotIn(private, result)
        self.assertEqual(
            set(result['members'][0]), {'nickname', 'is_captain'}
        )

    def test_private_data_is_not_searchable(self):
        # Arrange
        member = self.team.members.first()

        # Act
        by_code = self.client.get(self.url, {'q': member.student_code})
        by_name = self.client.get(self.url, {'q': member.full_name})

        # Assert
        self.assertEqual(by_code.data['results'], [])
        self.assertEqual(by_name.data['results'], [])

    def test_exact_matches_hide_partial_ones(self):
        # Arrange
        partial = RegistrationFactory(team_name='Kusi Gaming')

        # Act
        exact = self.client.get(self.url, {'q': 'kusi'})
        contains = self.client.get(self.url, {'q': 'kusi gam'})

        # Assert
        self.assertNotIn(partial.pk, [r['id'] for r in exact.data['results']])
        self.assertEqual(
            [r['id'] for r in contains.data['results']], [partial.pk]
        )

    def test_short_term_returns_400(self):
        # Act
        response = self.client.get(self.url, {'q': ' ku '})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('q', response.data)

    def test_hidden_games_are_not_listed(self):
        # Arrange
        self.team.tournament.game.active = False
        self.team.tournament.game.save()

        # Act
        response = self.client.get(self.url, {'q': 'Cóndores'})

        # Assert
        self.assertEqual(response.data['results'], [])


class RegistrationMembersTestCase(APITestCase):
    """Admins add, fix or remove players of a sent registration."""

    def setUp(self):
        assignment = AdminGameFactory()  # Team game: 5 to 7 players.
        self.admin = assignment.admin
        self.tournament = TournamentFactory(game=assignment.game)
        self.registration = RegistrationFactory(tournament=self.tournament)
        self.captain = RegistrationMemberFactory(
            registration=self.registration, is_captain=True
        )
        self.players = RegistrationMemberFactory.create_batch(
            4, registration=self.registration
        )
        self.add_url = reverse(
            'registrations-members', kwargs={'pk': self.registration.pk}
        )
        self.client.force_authenticate(user=self.admin)

    def member_url(self, member):
        return reverse('registrations-member', kwargs={
            'pk': self.registration.pk, 'member_id': member.pk,
        })

    def new_player(self, **overrides):
        return {
            'full_name': 'Nuevo Jugador', 'student_code': 'ab123',
            'nickname': 'nuevo', 'game_account_id': '12345', **overrides,
        }

    def test_add_member_updates_amount_due(self):
        # Act
        response = self.client.post(
            self.add_url, self.new_player(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['members']), 6)
        self.assertTrue(self.registration.members.filter(
            student_code='AB123').exists())
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.amount_due, Decimal('30.00'))

    def test_add_member_over_max_returns_400(self):
        # Arrange
        RegistrationMemberFactory.create_batch(
            2, registration=self.registration
        )

        # Act
        response = self.client.post(
            self.add_url, self.new_player(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.registration.members.count(), 7)

    def test_add_member_with_taken_code_returns_400(self):
        # Arrange
        other = RegistrationFactory(tournament=self.tournament)
        RegistrationMemberFactory(registration=other, student_code='AB123')

        # Act
        response = self.client.post(
            self.add_url, self.new_player(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('student_code', response.data)

    def test_new_captain_replaces_the_old_one(self):
        # Act
        response = self.client.patch(
            self.member_url(self.players[0]), {'is_captain': True},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.captain.refresh_from_db()
        self.assertFalse(self.captain.is_captain)
        self.assertEqual(
            self.registration.members.filter(is_captain=True).count(), 1
        )

    def test_patch_member_keeps_other_fields(self):
        # Arrange
        player = self.players[0]
        player.is_external = True
        player.university = 'UCSM'
        player.save()

        # Act
        response = self.client.patch(
            self.member_url(player), {'nickname': 'fixed'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        player.refresh_from_db()
        self.assertEqual(player.nickname, 'fixed')
        self.assertEqual(player.university, 'UCSM')

    def test_remove_member(self):
        # Arrange
        RegistrationMemberFactory(registration=self.registration)

        # Act
        response = self.client.delete(self.member_url(self.players[0]))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.registration.members.count(), 5)

    def test_remove_member_under_min_returns_400(self):
        # Act
        response = self.client.delete(self.member_url(self.players[0]))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.registration.members.count(), 5)

    def test_remove_captain_returns_400(self):
        # Arrange
        RegistrationMemberFactory(registration=self.registration)

        # Act
        response = self.client.delete(self.member_url(self.captain))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_member_of_foreign_game_returns_404(self):
        # Arrange
        foreign = RegistrationMemberFactory()
        url = reverse('registrations-member', kwargs={
            'pk': foreign.registration.pk, 'member_id': foreign.pk,
        })

        # Act
        response = self.client.patch(url, {'nickname': 'x'}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
