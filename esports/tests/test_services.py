from collections import Counter
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APISimpleTestCase, APITestCase

from esports import services
from esports.models import Match, StageParticipant
from esports.tests.factories import (
    RegistrationFactory, StageFactory, TournamentFactory,
    confirmed_registrations,
)


def two_player_match_ids(match):
    return [p.registration_id for p in match.participants.all()]


def play(match, winner_first=True):
    """Plays a 2 participant match making slot 1 (or 2) win 2-0."""
    a, b = two_player_match_ids(match)
    scores = {a: 2, b: 0} if winner_first else {a: 0, b: 2}
    return services.record_result(match, scores)


class HelpersTestCase(APISimpleTestCase):

    def test_bracket_seed_order_for_8(self):
        # Act
        order = services.bracket_seed_order(8)

        # Assert
        self.assertEqual(order, [1, 8, 4, 5, 2, 7, 3, 6])

    def test_snake_distribution(self):
        # Act
        groups = services.snake_distribution(list(range(1, 9)), 2)

        # Assert
        self.assertEqual(groups, [[1, 4, 5, 8], [2, 3, 6, 7]])

    def test_round_robin_pairings_everyone_plays_everyone(self):
        # Act
        rounds = services.round_robin_pairings(['a', 'b', 'c', 'd', 'e'])

        # Assert
        pairs = [frozenset(p) for r in rounds for p in r]
        self.assertEqual(len(pairs), 10)
        self.assertEqual(len(set(pairs)), 10)

    def test_round_labels(self):
        # Act / Assert
        self.assertEqual(services.elimination_round_label(3, 3), 'Final')
        self.assertEqual(services.elimination_round_label(2, 3), 'Semifinal')
        self.assertEqual(
            services.elimination_round_label(1, 4), 'Round of 16'
        )


class SingleEliminationTestCase(APITestCase):

    def setUp(self):
        self.tournament = TournamentFactory()
        self.stage = StageFactory(
            tournament=self.tournament, stage_type='single_elimination'
        )

    def test_draw_with_power_of_two(self):
        # Arrange
        confirmed_registrations(self.tournament, 8)

        # Act
        services.draw_stage(self.stage, shuffle=False)

        # Assert
        self.assertEqual(self.stage.matches.count(), 7)
        self.assertEqual(self.stage.matches.filter(is_bye=True).count(), 0)
        final = self.stage.matches.get(round=3)
        self.assertEqual(final.label, 'Final')
        self.assertEqual(final.winner_feeders.count(), 2)

    def test_draw_with_byes_advances_top_seeds(self):
        # Arrange
        regs = confirmed_registrations(self.tournament, 6)

        # Act
        services.draw_stage(self.stage, shuffle=False)

        # Assert
        byes = self.stage.matches.filter(is_bye=True)
        self.assertEqual(byes.count(), 2)
        self.assertEqual(
            {m.winner_id for m in byes}, {regs[0].id, regs[1].id}
        )
        round_two = self.stage.matches.filter(round=2)
        placed = {
            p.registration_id
            for m in round_two for p in m.participants.all()
            if p.registration_id
        }
        self.assertEqual(placed, {regs[0].id, regs[1].id})

    def test_only_confirmed_and_active_registrations_are_drawn(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        RegistrationFactory(tournament=self.tournament, status='pending')
        RegistrationFactory(tournament=self.tournament, is_active=False)

        # Act
        services.draw_stage(self.stage)

        # Assert
        self.assertEqual(self.stage.participants.count(), 4)

    def test_winner_advances_to_next_match(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        semi = self.stage.matches.filter(round=1).first()

        # Act
        match = play(semi)

        # Assert
        final = match.next_match
        self.assertIn(match.winner_id, two_player_match_ids(final))

    def test_full_bracket_completes_stage_and_tournament_status(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)

        # Act
        for match in self.stage.matches.filter(round=1):
            play(match)
        play(self.stage.matches.get(round=2))

        # Assert
        self.stage.refresh_from_db()
        self.tournament.refresh_from_db()
        self.assertEqual(self.stage.status, 'completed')
        self.assertEqual(self.tournament.status, 'completed')

    def test_first_result_starts_tournament(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)

        # Act
        play(self.stage.matches.filter(round=1).first())

        # Assert
        self.stage.refresh_from_db()
        self.tournament.refresh_from_db()
        self.assertEqual(self.stage.status, 'ongoing')
        self.assertEqual(self.tournament.status, 'ongoing')

    def test_third_place_receives_semifinal_losers(self):
        # Arrange
        self.stage.third_place_match = True
        self.stage.save()
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        semis = list(self.stage.matches.filter(round=1))

        # Act
        losers = []
        for semi in semis:
            a, b = two_player_match_ids(semi)
            play(semi)
            losers.append(b)

        # Assert
        third = self.stage.matches.get(label='Third place')
        self.assertEqual(set(two_player_match_ids(third)), set(losers))

    def test_draws_are_not_allowed(self):
        # Arrange
        confirmed_registrations(self.tournament, 2)
        services.draw_stage(self.stage)
        match = self.stage.matches.get()
        a, b = two_player_match_ids(match)

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.record_result(match, {a: 1, b: 1})

    def test_explicit_winner_resolves_tie(self):
        # Arrange
        confirmed_registrations(self.tournament, 2)
        services.draw_stage(self.stage)
        match = self.stage.matches.get()
        a, b = two_player_match_ids(match)

        # Act
        match = services.record_result(match, {a: 0, b: 0}, winner_id=b)

        # Assert
        self.assertEqual(match.winner_id, b)

    def test_winner_without_scores_advances_and_eliminates(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        semi = self.stage.matches.filter(round=1).first()
        a, b = two_player_match_ids(semi)

        # Act
        match = services.record_result(semi, winner_id=b)

        # Assert
        self.assertEqual(match.winner_id, b)
        final_ids = two_player_match_ids(match.next_match)
        self.assertIn(b, final_ids)
        self.assertNotIn(a, final_ids)

    def test_result_without_winner_and_scores_is_rejected(self):
        # Arrange
        confirmed_registrations(self.tournament, 2)
        services.draw_stage(self.stage)

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.record_result(self.stage.matches.get())

    def test_changing_winner_updates_next_match(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        semi = self.stage.matches.filter(round=1).first()
        a, b = two_player_match_ids(semi)
        play(semi)

        # Act
        services.record_result(semi, {a: 0, b: 2})

        # Assert
        final_ids = two_player_match_ids(semi.next_match)
        self.assertIn(b, final_ids)
        self.assertNotIn(a, final_ids)

    def test_cannot_change_winner_when_next_match_played(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        semis = list(self.stage.matches.filter(round=1))
        for semi in semis:
            play(semi)
        play(self.stage.matches.get(round=2))
        a, b = two_player_match_ids(semis[0])

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.record_result(semis[0], {a: 0, b: 2})

    def test_score_correction_allowed_when_winner_does_not_change(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        semis = list(self.stage.matches.filter(round=1))
        for semi in semis:
            play(semi)
        play(self.stage.matches.get(round=2))
        a, b = two_player_match_ids(semis[0])

        # Act
        services.record_result(semis[0], {a: 2, b: 1})

        # Assert
        self.assertEqual(
            semis[0].participants.get(registration_id=b).score, 1
        )

    def test_reset_result_removes_winner_from_next_match(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage, shuffle=False)
        semi = self.stage.matches.filter(round=1).first()
        played = play(semi)

        # Act
        services.reset_result(semi)

        # Assert
        semi.refresh_from_db()
        self.assertIsNone(semi.winner)
        self.assertEqual(semi.status, 'scheduled')
        self.assertNotIn(
            played.winner_id, two_player_match_ids(semi.next_match)
        )

    def test_cannot_draw_again_with_results(self):
        # Arrange
        confirmed_registrations(self.tournament, 2)
        services.draw_stage(self.stage)
        play(self.stage.matches.get())

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.draw_stage(self.stage)

    def test_redraw_without_results_replaces_matches(self):
        # Arrange
        confirmed_registrations(self.tournament, 4)
        services.draw_stage(self.stage)

        # Act
        services.draw_stage(self.stage)

        # Assert
        self.assertEqual(self.stage.matches.count(), 3)
        self.assertEqual(self.stage.participants.count(), 4)

    def test_needs_two_participants(self):
        # Arrange
        confirmed_registrations(self.tournament, 1)

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.draw_stage(self.stage)


class RoundRobinTestCase(APITestCase):

    def setUp(self):
        self.tournament = TournamentFactory()
        self.stage = StageFactory(
            tournament=self.tournament, stage_type='round_robin',
            number_of_groups=2, advance_per_group=2,
        )
        self.regs = confirmed_registrations(self.tournament, 8)

    def test_draw_creates_groups_and_matches(self):
        # Act
        services.draw_stage(self.stage, shuffle=False)

        # Assert
        self.assertEqual(self.stage.groups.count(), 2)
        sizes = Counter(
            StageParticipant.objects.filter(
                stage=self.stage
            ).values_list('group_id', flat=True)
        )
        self.assertEqual(sorted(sizes.values()), [4, 4])
        # 4 teams per group -> 6 matches per group.
        self.assertEqual(self.stage.matches.count(), 12)

    def test_two_legs_doubles_matches(self):
        # Arrange
        self.stage.round_robin_legs = 2
        self.stage.save()

        # Act
        services.draw_stage(self.stage)

        # Assert
        self.assertEqual(self.stage.matches.count(), 24)

    def test_too_many_groups(self):
        # Arrange
        self.stage.number_of_groups = 5
        self.stage.save()

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.draw_stage(self.stage)

    def test_draws_allowed_and_standings_points(self):
        # Arrange
        self.stage.number_of_groups = 1
        self.stage.save()
        services.draw_stage(self.stage, shuffle=False)
        matches = list(self.stage.matches.all())
        a, b = two_player_match_ids(matches[0])

        # Act
        services.record_result(matches[0], {a: 1, b: 1})
        c, d = two_player_match_ids(matches[1])
        services.record_result(matches[1], {c: 3, d: 0})

        # Assert
        table = services.stage_standings(self.stage)[0]['standings']
        rows = {row['registration'].id: row for row in table}
        self.assertEqual(rows[a]['draws'], 1)
        self.assertEqual(rows[a]['points'], 1)
        self.assertEqual(table[0]['points'], 3)
        self.assertEqual(table[0]['rank'], 1)

    def test_qualifiers_feed_next_stage(self):
        # Arrange
        services.draw_stage(self.stage, shuffle=False)
        for match in self.stage.matches.all():
            play(match)
        playoffs = StageFactory(
            tournament=self.tournament, order=2,
            stage_type='single_elimination',
        )

        # Act
        services.draw_stage(playoffs, shuffle=False)

        # Assert
        self.assertEqual(playoffs.participants.count(), 4)
        first_places = [
            group['standings'][0]['registration'].id
            for group in services.stage_standings(self.stage)
        ]
        seeds = list(
            playoffs.participants.order_by('seed').values_list(
                'registration_id', flat=True
            )
        )
        self.assertEqual(seeds[:2], first_places)

    def test_next_stage_needs_previous_finished(self):
        # Arrange
        services.draw_stage(self.stage)
        playoffs = StageFactory(
            tournament=self.tournament, order=2,
            stage_type='single_elimination',
        )

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.draw_stage(playoffs)


class FreeForAllTestCase(APITestCase):

    def setUp(self):
        self.tournament = TournamentFactory()
        self.stage = StageFactory(
            tournament=self.tournament, stage_type='free_for_all',
            ffa_rounds=3,
        )
        self.regs = confirmed_registrations(self.tournament, 6)

    def test_draw_creates_one_match_per_round_with_everyone(self):
        # Act
        services.draw_stage(self.stage)

        # Assert
        self.assertEqual(self.stage.matches.count(), 3)
        self.assertEqual(
            self.stage.matches.first().participants.count(), 6
        )

    def test_result_assigns_placements_and_points(self):
        # Arrange
        services.draw_stage(self.stage)
        match = self.stage.matches.first()
        scores = {reg.id: points for reg, points in zip(
            self.regs, [10, 8, 8, 4, 2, 0]
        )}

        # Act
        match = services.record_result(match, scores)

        # Assert
        placements = {
            p.registration_id: p.placement
            for p in match.participants.all()
        }
        self.assertEqual(placements[self.regs[0].id], 1)
        self.assertEqual(placements[self.regs[1].id], 2)
        self.assertEqual(placements[self.regs[2].id], 2)
        self.assertEqual(placements[self.regs[3].id], 4)
        self.assertEqual(match.winner_id, self.regs[0].id)
        table = services.stage_standings(self.stage)[0]['standings']
        self.assertEqual(table[0]['registration'], self.regs[0])
        self.assertEqual(table[0]['points'], 10)

    def test_winner_only_is_rejected(self):
        # Arrange
        services.draw_stage(self.stage)
        match = self.stage.matches.first()

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.record_result(match, winner_id=self.regs[0].id)

    def test_missing_score_is_rejected(self):
        # Arrange
        services.draw_stage(self.stage)
        match = self.stage.matches.first()

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.record_result(match, {self.regs[0].id: 3})


class ManualStageTestCase(APITestCase):

    def test_draw_only_registers_participants(self):
        # Arrange
        tournament = TournamentFactory()
        stage = StageFactory(tournament=tournament, stage_type='manual')
        regs = confirmed_registrations(tournament, 3)

        # Act
        services.draw_stage(
            stage, registration_ids=[r.id for r in regs], shuffle=False
        )

        # Assert
        self.assertEqual(stage.participants.count(), 3)
        self.assertFalse(stage.matches.exists())

    def test_explicit_participants_must_be_confirmed(self):
        # Arrange
        tournament = TournamentFactory()
        stage = StageFactory(tournament=tournament, stage_type='manual')
        pending = RegistrationFactory(tournament=tournament, status='pending')
        regs = confirmed_registrations(tournament, 1)

        # Act / Assert
        with self.assertRaises(services.TournamentError):
            services.draw_stage(
                stage, registration_ids=[regs[0].id, pending.id]
            )


class ScheduleTestCase(APITestCase):

    def test_schedule_assigns_dates_in_parallel_slots(self):
        # Arrange
        tournament = TournamentFactory()
        stage = StageFactory(tournament=tournament)
        confirmed_registrations(tournament, 8)
        services.draw_stage(stage)
        start = timezone.now().replace(microsecond=0)

        # Act
        count = services.schedule_stage(stage, start, 60, parallel=2)

        # Assert
        self.assertEqual(count, 7)
        dates = list(
            Match.objects.filter(stage=stage).order_by(
                'round', 'position'
            ).values_list('scheduled_at', flat=True)
        )
        self.assertEqual(dates[0], start)
        self.assertEqual(dates[1], start)
        self.assertEqual(dates[2], start + timedelta(hours=1))
        self.assertEqual(dates[6], start + timedelta(hours=3))
