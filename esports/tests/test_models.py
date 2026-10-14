from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APITestCase

from esports.models import CustomUser, SiteSettings
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, GameFactory, IndividualGameFactory,
    RegistrationFactory, RegistrationMemberFactory, SiteSettingsFactory,
    SuperAdminFactory, TournamentFactory,
)


class CustomUserTestCase(APITestCase):

    def test_superadmin_role(self):
        # Arrange / Act
        user = SuperAdminFactory()

        # Assert
        self.assertTrue(user.is_superadmin())
        self.assertTrue(user.is_admin())

    def test_createsuperuser_becomes_superadmin(self):
        # Act
        user = CustomUser.objects.create_superuser(
            username='root', password='x-pass-123'
        )

        # Assert
        self.assertEqual(user.role, 'superadmin')

    def test_game_admin_only_manages_assigned_games(self):
        # Arrange
        assignment = AdminGameFactory()
        other_game = GameFactory()

        # Act / Assert
        self.assertTrue(assignment.admin.can_manage_game(assignment.game))
        self.assertFalse(assignment.admin.can_manage_game(other_game))
        self.assertEqual(
            list(assignment.admin.managed_games()), [assignment.game]
        )

    def test_global_objects_only_for_superadmin(self):
        # Arrange
        admin = AdminUserFactory()
        superadmin = SuperAdminFactory()

        # Act / Assert
        self.assertFalse(admin.can_manage_game(None))
        self.assertTrue(superadmin.can_manage_game(None))


class GameTestCase(APITestCase):

    def test_individual_game_with_many_players_is_invalid(self):
        # Arrange
        game = IndividualGameFactory.build(max_players=3)

        # Act / Assert
        with self.assertRaises(ValidationError):
            game.clean()

    def test_team_game_with_one_player_is_invalid(self):
        # Arrange
        game = GameFactory.build(min_players=1, max_players=5)

        # Act / Assert
        with self.assertRaises(ValidationError):
            game.clean()

    def test_team_game_max_lower_than_min_is_invalid(self):
        # Arrange
        game = GameFactory.build(min_players=5, max_players=4)

        # Act / Assert
        with self.assertRaises(ValidationError):
            game.clean()


class SiteSettingsTestCase(APITestCase):

    def test_load_always_returns_the_same_row(self):
        # Act
        first = SiteSettings.load()
        second = SiteSettings.load()

        # Assert
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(SiteSettings.objects.count(), 1)


class TournamentRegistrationStateTestCase(APITestCase):

    def setUp(self):
        self.site = SiteSettingsFactory()
        self.tournament = TournamentFactory()

    def test_open_by_default(self):
        # Act
        is_open, _ = self.tournament.registration_state()

        # Assert
        self.assertTrue(is_open)

    def test_closed_when_globally_disabled(self):
        # Arrange
        self.site.registration_enabled = False
        self.site.save()

        # Act
        is_open, reason = self.tournament.registration_state()

        # Assert
        self.assertFalse(is_open)
        self.assertIn('en general', reason)

    def test_closed_when_tournament_disabled(self):
        # Arrange
        self.tournament.registration_enabled = False

        # Act
        is_open, _ = self.tournament.registration_state()

        # Assert
        self.assertFalse(is_open)

    def test_closed_after_registration_end(self):
        # Arrange
        self.tournament.registration_end = (
            timezone.now() - timedelta(days=1)
        )

        # Act
        is_open, reason = self.tournament.registration_state()

        # Assert
        self.assertFalse(is_open)
        self.assertIn('terminó', reason)

    def test_not_started_yet(self):
        # Arrange
        self.tournament.registration_start = (
            timezone.now() + timedelta(days=1)
        )

        # Act
        is_open, reason = self.tournament.registration_state()

        # Assert
        self.assertFalse(is_open)
        self.assertIn('aún no empiezan', reason)

    def test_closed_when_full(self):
        # Arrange
        self.tournament.max_registrations = 1
        self.tournament.save()
        RegistrationFactory(tournament=self.tournament, status='pending')

        # Act
        is_open, reason = self.tournament.registration_state()

        # Assert
        self.assertFalse(is_open)
        self.assertIn('cupos', reason)

    def test_rejected_registrations_do_not_use_slots(self):
        # Arrange
        self.tournament.max_registrations = 1
        self.tournament.save()
        RegistrationFactory(tournament=self.tournament, status='rejected')

        # Act
        is_open, _ = self.tournament.registration_state()

        # Assert
        self.assertTrue(is_open)

    def test_closed_when_tournament_started(self):
        # Arrange
        self.tournament.status = 'ongoing'

        # Act
        is_open, _ = self.tournament.registration_state()

        # Assert
        self.assertFalse(is_open)

    def test_calculate_fee_per_player(self):
        # Arrange
        self.tournament.fee_per_player = Decimal('5.00')

        # Act
        total = self.tournament.calculate_fee(6)

        # Assert
        self.assertEqual(total, Decimal('30.00'))


class RegistrationTestCase(APITestCase):

    def test_display_name_uses_team_name(self):
        # Arrange
        registration = RegistrationFactory(team_name='Los Pumas')

        # Act / Assert
        self.assertEqual(registration.display_name, 'Los Pumas')

    def test_display_name_uses_captain_nickname_for_individuals(self):
        # Arrange
        registration = RegistrationFactory(team_name='')
        member = RegistrationMemberFactory(
            registration=registration, is_captain=True
        )

        # Act / Assert
        self.assertEqual(registration.display_name, member.nickname)
