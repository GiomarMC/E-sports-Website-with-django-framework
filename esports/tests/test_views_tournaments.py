import json
import shutil
import tempfile
from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.models import Registration, Tournament
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, GameFactory, IndividualGameFactory,
    RegistrationFactory, RegistrationMemberFactory, SiteSettingsFactory,
    SuperAdminFactory, TournamentFactory, image_file, member_payload,
)


MEDIA_ROOT = tempfile.mkdtemp()


class TournamentViewSetTestCase(APITestCase):

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.game = assignment.game
        self.tournament = TournamentFactory(game=self.game)
        self.other_tournament = TournamentFactory()
        self.list_url = reverse('tournaments-list')
        self.detail_url = reverse(
            'tournaments-detail', kwargs={'pk': self.tournament.pk}
        )

    def test_public_list_with_game_filter(self):
        # Act
        response = self.client.get(self.list_url, {'game': self.game.pk})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertTrue(response.data[0]['registration']['is_open'])

    def test_public_list_hides_inactive_games(self):
        # Arrange
        self.game.active = False
        self.game.save()

        # Act
        response = self.client.get(self.list_url)

        # Assert
        self.assertEqual(len(response.data), 1)

    def test_retrieve_nonexistent_returns_404(self):
        # Act
        response = self.client.get(
            reverse('tournaments-detail', kwargs={'pk': 99999})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_for_own_game(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'game': self.game.pk,
            'name': 'Copa 2026',
            'start_date': '2026-11-20T15:00:00Z',
            'fee_per_player': '5.00',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Tournament.objects.filter(name='Copa 2026').exists())

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.list_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_for_other_game_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'game': GameFactory().pk,
            'name': 'Copa',
            'start_date': '2026-11-20T15:00:00Z',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_with_negative_fee_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'game': self.game.pk,
            'name': 'Copa',
            'start_date': '2026-11-20T15:00:00Z',
            'fee_per_player': '-1.00',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('fee_per_player', response.data)

    def test_update_other_game_tournament_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        url = reverse(
            'tournaments-detail', kwargs={'pk': self.other_tournament.pk}
        )

        # Act
        response = self.client.patch(url, {'name': 'x'}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_move_tournament_to_another_game(self):
        # Arrange
        self.client.force_authenticate(user=SuperAdminFactory())

        # Act
        response = self.client.patch(
            self.detail_url, {'game': GameFactory().pk}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_close_and_open_registration(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(reverse(
            'tournaments-close-registration',
            kwargs={'pk': self.tournament.pk},
        ))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['registration']['is_open'])
        response = self.client.post(reverse(
            'tournaments-open-registration',
            kwargs={'pk': self.tournament.pk},
        ))
        self.assertTrue(response.data['registration']['is_open'])

    def test_close_registration_unassigned_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.post(reverse(
            'tournaments-close-registration',
            kwargs={'pk': self.tournament.pk},
        ))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_quote_calculates_total(self):
        # Arrange
        url = reverse('tournaments-quote', kwargs={'pk': self.tournament.pk})

        # Act
        response = self.client.get(url, {'players': 6})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['total']), Decimal('30.00'))

    def test_quote_out_of_range_returns_400(self):
        # Arrange
        url = reverse('tournaments-quote', kwargs={'pk': self.tournament.pk})

        # Act
        response = self.client.get(url, {'players': 20})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_participants_only_confirmed_and_active(self):
        # Arrange
        RegistrationFactory(tournament=self.tournament)
        RegistrationFactory(tournament=self.tournament, status='pending')
        RegistrationFactory(tournament=self.tournament, is_active=False)
        url = reverse(
            'tournaments-participants', kwargs={'pk': self.tournament.pk}
        )

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertNotIn('contact_email', response.data[0])


@override_settings(
    MEDIA_ROOT=MEDIA_ROOT, PRIVATE_MEDIA_ROOT=f'{MEDIA_ROOT}/private'
)
class TournamentRegisterTestCase(APITestCase):

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        SiteSettingsFactory()
        self.game = GameFactory(min_players=5, max_players=7)
        self.tournament = TournamentFactory(
            game=self.game, fee_per_player=Decimal('5.00')
        )
        self.url = reverse(
            'tournaments-register', kwargs={'pk': self.tournament.pk}
        )

    def multipart_payload(self, members, **extra):
        payload = {
            'team_name': 'Los Pumas',
            'contact_email': 'captain@unsa.edu.pe',
            'contact_phone': '987654321',
            'members': json.dumps(members),
            'voucher': image_file('voucher.png'),
        }
        payload.update(extra)
        return payload

    def test_register_team_with_multipart_calculates_amount(self):
        # Arrange
        payload = self.multipart_payload(member_payload(6))

        # Act
        response = self.client.post(self.url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Decimal(response.data['amount_due']), Decimal('30.00')
        )
        registration = Registration.objects.get(code=response.data['code'])
        self.assertEqual(registration.status, 'pending')
        self.assertEqual(registration.members.count(), 6)
        self.assertEqual(registration.captain.student_code, '20260000')

    def test_register_with_too_few_players_returns_400(self):
        # Act
        response = self.client.post(
            self.url, self.multipart_payload(member_payload(4))
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('members', response.data)

    def test_register_without_captain_returns_400(self):
        # Act
        response = self.client.post(
            self.url,
            self.multipart_payload(member_payload(5, captain_index=None)),
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('captain', response.data)

    def test_register_without_voucher_returns_400(self):
        # Arrange
        payload = self.multipart_payload(member_payload(5))
        del payload['voucher']

        # Act
        response = self.client.post(self.url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('voucher', response.data)

    def test_free_tournament_does_not_need_voucher(self):
        # Arrange
        self.tournament.fee_per_player = Decimal('0')
        self.tournament.save()
        payload = self.multipart_payload(member_payload(5))
        del payload['voucher']

        # Act
        response = self.client.post(self.url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_register_with_invalid_members_json_returns_400(self):
        # Arrange
        payload = self.multipart_payload([])
        payload['members'] = '{not json'

        # Act
        response = self.client.post(self.url, payload)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('members', response.data)

    def test_duplicated_team_name_returns_400(self):
        # Arrange
        RegistrationFactory(tournament=self.tournament, team_name='los pumas')

        # Act
        response = self.client.post(
            self.url, self.multipart_payload(member_payload(5))
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('team_name', response.data)

    def test_player_already_registered_returns_400(self):
        # Arrange
        RegistrationMemberFactory(
            registration=RegistrationFactory(tournament=self.tournament),
            student_code='20260001',
        )

        # Act
        response = self.client.post(
            self.url, self.multipart_payload(member_payload(5))
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('student_code', response.data)

    def test_rejected_players_can_register_again(self):
        # Arrange
        RegistrationMemberFactory(
            registration=RegistrationFactory(
                tournament=self.tournament, status='rejected'
            ),
            student_code='20260001',
        )

        # Act
        response = self.client.post(
            self.url, self.multipart_payload(member_payload(5))
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_register_when_closed_returns_400(self):
        # Arrange
        self.tournament.registration_enabled = False
        self.tournament.save()

        # Act
        response = self.client.post(
            self.url, self.multipart_payload(member_payload(5))
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_register_nonexistent_tournament_returns_404(self):
        # Arrange
        url = reverse('tournaments-register', kwargs={'pk': 99999})

        # Act
        response = self.client.post(
            url, self.multipart_payload(member_payload(5))
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_register_individual_with_json(self):
        # Arrange
        tournament = TournamentFactory(
            game=IndividualGameFactory(), fee_per_player=Decimal('0')
        )
        url = reverse('tournaments-register', kwargs={'pk': tournament.pk})
        payload = {
            'contact_email': 'player@unsa.edu.pe',
            'contact_phone': '+51 912 345 678',
            'members': member_payload(1, captain_index=None),
        }

        # Act
        response = self.client.post(url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        registration = Registration.objects.get(code=response.data['code'])
        self.assertEqual(registration.team_name, '')
        self.assertTrue(registration.members.get().is_captain)
        self.assertEqual(registration.contact_phone, '912345678')

    def test_register_without_phone_returns_400(self):
        # Arrange
        payload = self.multipart_payload(member_payload(5))
        del payload['contact_phone']

        # Act
        missing = self.client.post(self.url, payload)
        blank = self.client.post(
            self.url,
            self.multipart_payload(member_payload(5), contact_phone=''),
        )

        # Assert
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('contact_phone', missing.data)
        self.assertEqual(blank.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('contact_phone', blank.data)

    def test_register_with_invalid_phone_returns_400(self):
        # Act
        response = self.client.post(
            self.url,
            self.multipart_payload(member_payload(5), contact_phone='12345'),
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('contact_phone', response.data)
