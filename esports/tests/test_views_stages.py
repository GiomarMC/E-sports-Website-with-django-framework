from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports import services
from esports.models import Stage
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, StageFactory, TournamentFactory,
    confirmed_registrations,
)


class StageViewSetTestCase(APITestCase):

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.tournament = TournamentFactory(game=assignment.game)
        self.stage = StageFactory(
            tournament=self.tournament, stage_type='round_robin',
            number_of_groups=2, advance_per_group=2,
        )
        self.regs = confirmed_registrations(self.tournament, 8)
        self.list_url = reverse('stages-list')
        self.detail_url = reverse(
            'stages-detail', kwargs={'pk': self.stage.pk}
        )

    def action_url(self, name, stage=None):
        return reverse(
            f'stages-{name}', kwargs={'pk': (stage or self.stage).pk}
        )

    def test_public_list_by_tournament(self):
        # Arrange
        StageFactory()

        # Act
        response = self.client.get(
            self.list_url, {'tournament': self.tournament.pk}
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_retrieve_nonexistent_returns_404(self):
        # Act
        response = self.client.get(
            reverse('stages-detail', kwargs={'pk': 99999})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_stage(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'tournament': self.tournament.pk,
            'name': 'Playoffs',
            'order': 2,
            'stage_type': 'single_elimination',
            'best_of': 3,
            'third_place_match': True,
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.tournament.stages.count(), 2)

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.list_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_in_other_game_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())
        payload = {
            'tournament': self.tournament.pk, 'name': 'x', 'order': 2,
            'stage_type': 'manual',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_with_duplicated_order_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {
            'tournament': self.tournament.pk, 'name': 'x', 'order': 1,
            'stage_type': 'manual',
        }

        # Act
        response = self.client.post(self.list_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('order', response.data)

    def test_draw_generates_groups(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.action_url('draw'), {'shuffle': True}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['groups']), 2)
        self.assertEqual(self.stage.matches.count(), 12)

    def test_draw_with_explicit_participants(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        ids = [r.id for r in self.regs[:4]]

        # Act
        response = self.client.post(
            self.action_url('draw'),
            {'registration_ids': ids, 'shuffle': False},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['participants']), 4)

    def test_draw_preview_does_not_save(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.action_url('draw'), {'preview': True}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['preview'])
        self.assertEqual(len(response.data['seeding']), 8)
        self.assertEqual(len(response.data['bracket']), 2)
        self.assertFalse(self.stage.matches.exists())
        self.assertFalse(self.stage.participants.exists())

    def test_confirming_a_preview_keeps_its_groups(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        preview = self.client.post(
            self.action_url('draw'), {'preview': True}, format='json'
        ).data
        groups = {
            g['name']: {p['id'] for p in g['participants']}
            for g in preview['groups']
        }

        # Act
        response = self.client.post(
            self.action_url('draw'),
            {'registration_ids': preview['seeding'], 'shuffle': False},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        saved = {
            g['name']: {p['id'] for p in g['participants']}
            for g in response.data['groups']
        }
        self.assertEqual(saved, groups)

    def test_changing_best_of_updates_drawn_matches(self):
        # Arrange
        services.draw_stage(self.stage)
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'best_of': 3}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(self.stage.matches.values_list('best_of', flat=True)), {3}
        )

    def test_draw_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.action_url('draw'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_draw_as_unassigned_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.post(self.action_url('draw'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_draw_with_business_error_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        stage = StageFactory(
            tournament=self.tournament, order=2,
            stage_type='single_elimination',
        )

        # Act: previous stage has not been played yet.
        response = self.client.post(self.action_url('draw', stage))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_elimination_draw_with_byes_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        stage = StageFactory(
            tournament=TournamentFactory(game=self.tournament.game),
            stage_type='single_elimination',
        )
        confirmed_registrations(stage.tournament, 6)

        # Act
        response = self.client.post(
            self.action_url('draw', stage), {'preview': True}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('liga', str(response.data['detail']))

    def test_double_elimination_preview_keeps_lower_teams(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        stage = StageFactory(
            tournament=TournamentFactory(game=self.tournament.game),
            stage_type='double_elimination',
        )
        regs = confirmed_registrations(stage.tournament, 8)
        upper = [r.id for r in regs[:4]]
        lower = [r.id for r in regs[4:]]

        # Act
        response = self.client.post(self.action_url('draw', stage), {
            'registration_ids': upper, 'lower_registration_ids': lower,
            'shuffle': False, 'preview': True,
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['seeding'], upper)
        self.assertEqual(response.data['lower_seeding'], lower)
        self.assertEqual(
            [s['bracket'] for s in response.data['bracket']],
            ['upper', 'lower', 'final'],
        )

    def test_draw_nonexistent_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            reverse('stages-draw', kwargs={'pk': 99999})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_change_type_after_draw(self):
        # Arrange
        services.draw_stage(self.stage)
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'stage_type': 'free_for_all'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_removes_matches(self):
        # Arrange
        services.draw_stage(self.stage)
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(self.action_url('reset'))

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.stage.matches.exists())

    def test_auto_schedule(self):
        # Arrange
        services.draw_stage(self.stage)
        self.client.force_authenticate(user=self.admin)
        payload = {
            'start': '2026-11-20T15:00:00-05:00',
            'interval_minutes': 45,
            'parallel': 2,
        }

        # Act
        response = self.client.post(
            self.action_url('auto-schedule'), payload, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['scheduled_matches'], 12)
        self.assertFalse(
            self.stage.matches.filter(scheduled_at__isnull=True).exists()
        )

    def test_auto_schedule_invalid_data_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.action_url('auto-schedule'),
            {'interval_minutes': 0},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('start', response.data)

    def test_public_standings_and_bracket(self):
        # Arrange
        services.draw_stage(self.stage)

        # Act
        standings = self.client.get(self.action_url('standings'))
        bracket = self.client.get(self.action_url('bracket'))

        # Assert
        self.assertEqual(standings.status_code, status.HTTP_200_OK)
        self.assertEqual(len(standings.data), 2)
        self.assertEqual(len(standings.data[0]['standings']), 4)
        self.assertEqual(bracket.status_code, status.HTTP_200_OK)
        self.assertEqual(len(bracket.data), 2)
        self.assertEqual(len(bracket.data[0]['rounds']), 3)

    def test_destroy(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.delete(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Stage.objects.filter(pk=self.stage.pk).exists())
