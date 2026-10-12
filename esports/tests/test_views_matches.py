from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from esports import services
from esports.models import Match
from esports.tests.factories import (
    AdminGameFactory, AdminUserFactory, RegistrationFactory, StageFactory,
    StreamFactory, TournamentFactory, confirmed_registrations,
)


class MatchViewSetTestCase(APITestCase):

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.game = assignment.game
        self.tournament = TournamentFactory(game=self.game)
        self.stage = StageFactory(tournament=self.tournament)
        self.regs = confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        self.semi = self.stage.matches.filter(round=1).first()
        self.ids = [
            p.registration_id for p in self.semi.participants.all()
        ]
        self.list_url = reverse('matches-list')
        self.detail_url = reverse(
            'matches-detail', kwargs={'pk': self.semi.pk}
        )
        self.result_url = reverse(
            'matches-result', kwargs={'pk': self.semi.pk}
        )

    def result_payload(self, first=2, second=0, **extra):
        payload = {'scores': [
            {'registration': self.ids[0], 'score': first},
            {'registration': self.ids[1], 'score': second},
        ]}
        payload.update(extra)
        return payload

    def test_public_list_with_filters(self):
        # Act
        response = self.client.get(
            self.list_url, {'tournament': self.tournament.pk, 'round': 1}
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(len(response.data[0]['participants']), 2)

    def test_public_list_upcoming(self):
        # Arrange
        self.semi.scheduled_at = timezone.now() + timedelta(hours=2)
        self.semi.save()

        # Act
        response = self.client.get(self.list_url, {'upcoming': 'true'})

        # Assert
        self.assertEqual([m['id'] for m in response.data], [self.semi.id])

    def test_public_list_invalid_date_returns_400(self):
        # Act
        response = self.client.get(self.list_url, {'date': '20-11-2026'})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_includes_streams(self):
        # Arrange
        StreamFactory(game=self.game, match=self.semi)

        # Act
        response = self.client.get(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['streams']), 1)

    def test_retrieve_nonexistent_returns_404(self):
        # Act
        response = self.client.get(
            reverse('matches-detail', kwargs={'pk': 99999})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_schedule_match(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url,
            {'scheduled_at': '2026-11-20T16:00:00-05:00', 'best_of': 3},
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.semi.refresh_from_db()
        self.assertEqual(self.semi.best_of, 3)
        self.assertIsNotNone(self.semi.scheduled_at)

    def test_patch_status_completed_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.patch(
            self.detail_url, {'status': 'completed'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('status', response.data)

    def test_patch_without_auth_returns_401(self):
        # Act
        response = self.client.patch(self.detail_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patch_unassigned_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.patch(
            self.detail_url, {'status': 'live'}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_result_advances_winner(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.result_url, self.result_payload(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['winner'], self.ids[0])
        final = Match.objects.get(pk=self.semi.next_match_id)
        self.assertIn(
            self.ids[0],
            [p.registration_id for p in final.participants.all()],
        )

    def test_result_with_only_winner(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.result_url, {'winner': self.ids[1]}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['winner'], self.ids[1])
        self.assertEqual(response.data['status'], 'completed')

    def test_result_without_winner_and_scores_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(self.result_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_result_with_winner_not_in_match_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        outsider = RegistrationFactory(tournament=self.tournament)

        # Act
        response = self.client.post(
            self.result_url, {'winner': outsider.id}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_result_without_auth_returns_401(self):
        # Act
        response = self.client.post(
            self.result_url, self.result_payload(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_result_unassigned_admin_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.post(
            self.result_url, self.result_payload(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_result_draw_in_elimination_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            self.result_url, self.result_payload(1, 1), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_result_with_unknown_participant_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        payload = {'scores': [
            {'registration': self.ids[0], 'score': 1},
            {'registration': RegistrationFactory().id, 'score': 0},
        ]}

        # Act
        response = self.client.post(self.result_url, payload, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_result_on_tbd_match_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        final = self.stage.matches.get(round=2)
        url = reverse('matches-result', kwargs={'pk': final.pk})

        # Act
        response = self.client.post(
            url, self.result_payload(), format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_result_nonexistent_returns_404(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            reverse('matches-result', kwargs={'pk': 99999}),
            self.result_payload(),
            format='json',
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_reset_result(self):
        # Arrange
        services.record_result(self.semi, {self.ids[0]: 2, self.ids[1]: 0})
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.post(
            reverse('matches-reset-result', kwargs={'pk': self.semi.pk})
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['winner'])
        self.assertEqual(response.data['status'], 'scheduled')

    def test_cannot_delete_completed_match(self):
        # Arrange
        services.record_result(self.semi, {self.ids[0]: 2, self.ids[1]: 0})
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.delete(self.detail_url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ManualMatchTestCase(APITestCase):

    def setUp(self):
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.tournament = TournamentFactory(game=assignment.game)
        self.stage = StageFactory(
            tournament=self.tournament, stage_type='manual', best_of=3
        )
        self.regs = confirmed_registrations(self.tournament, 4)
        self.list_url = reverse('matches-list')

    def test_create_manual_bracket(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        final = self.client.post(self.list_url, {
            'stage': self.stage.pk, 'round': 2, 'label': 'Grand final',
        }, format='json').data

        # Act
        response = self.client.post(self.list_url, {
            'stage': self.stage.pk,
            'round': 1,
            'label': 'Upper final',
            'registration_ids': [self.regs[0].id, self.regs[1].id],
            'next_match': final['id'],
            'next_match_slot': 1,
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['best_of'], 3)
        upper = Match.objects.get(pk=response.data['id'])
        services.record_result(
            upper, {self.regs[0].id: 2, self.regs[1].id: 1}
        )
        grand_final = Match.objects.get(pk=final['id'])
        self.assertEqual(
            grand_final.participants.get(slot=1).registration,
            self.regs[0],
        )

    def test_create_without_auth_returns_401(self):
        # Act
        response = self.client.post(self.list_url, {}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_in_other_game_returns_403(self):
        # Arrange
        self.client.force_authenticate(user=AdminUserFactory())

        # Act
        response = self.client.post(
            self.list_url, {'stage': self.stage.pk}, format='json'
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_with_link_without_slot_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        other = Match.objects.create(stage=self.stage)

        # Act
        response = self.client.post(self.list_url, {
            'stage': self.stage.pk, 'next_match': other.pk,
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('next_match', response.data)

    def test_create_with_unconfirmed_participant_returns_400(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        pending = RegistrationFactory(
            tournament=self.tournament, status='pending'
        )

        # Act
        response = self.client.post(self.list_url, {
            'stage': self.stage.pk,
            'registration_ids': [self.regs[0].id, pending.id],
        }, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('registration_ids', response.data)

    def test_manual_match_allows_draw(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)
        match = self.client.post(self.list_url, {
            'stage': self.stage.pk,
            'registration_ids': [self.regs[0].id, self.regs[1].id],
        }, format='json').data
        url = reverse('matches-result', kwargs={'pk': match['id']})

        # Act
        response = self.client.post(url, {'scores': [
            {'registration': self.regs[0].id, 'score': 1},
            {'registration': self.regs[1].id, 'score': 1},
        ]}, format='json')

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['winner'])


class TournamentScheduleTestCase(APITestCase):

    def test_schedule_is_ordered_by_date_and_hides_byes(self):
        # Arrange
        tournament = TournamentFactory()
        stage = StageFactory(tournament=tournament)
        confirmed_registrations(tournament, 3)
        services.draw_stage(stage, shuffle=False)
        start = timezone.now()
        services.schedule_stage(stage, start, 60)
        url = reverse('tournaments-schedule', kwargs={'pk': tournament.pk})

        # Act
        response = self.client.get(url)

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        dates = [m['scheduled_at'] for m in response.data]
        self.assertEqual(dates, sorted(dates))
