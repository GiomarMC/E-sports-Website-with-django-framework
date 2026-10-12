"""Tournament engine: draws, bracket generation, results and standings.

Every stage type has a generator that creates the matches of the stage from
an ordered list of registrations (the seeding). Matches are linked through
``next_match`` / ``loser_next_match`` so results propagate automatically,
which also allows admins to build custom brackets with manual stages.
"""
import math
import random
import string
from datetime import timedelta

from django.db import transaction

from .models import (
    Match, MatchParticipant, Stage, StageGroup, StageParticipant,
)


class TournamentError(Exception):
    """Business rule violation; views translate it into a 400 response."""


# ---------------------------------------------------------------- helpers

def group_name(index):
    letters = string.ascii_uppercase
    if index < len(letters):
        return f"Group {letters[index]}"
    return f"Group {index + 1}"


def elimination_round_label(round_number, total_rounds):
    remaining = total_rounds - round_number
    if remaining == 0:
        return 'Final'
    if remaining == 1:
        return 'Semifinal'
    if remaining == 2:
        return 'Quarterfinal'
    return f"Round of {2 ** (remaining + 1)}"


def bracket_seed_order(size):
    """Standard seeding: for 8 -> [1, 8, 4, 5, 2, 7, 3, 6] so the best seeds
    only meet in the latest rounds."""
    order = [1]
    while len(order) < size:
        total = len(order) * 2 + 1
        order = [x for seed in order for x in (seed, total - seed)]
    return order


def snake_distribution(items, buckets):
    """Distributes seeded items in groups: 1-2-3-4 / 8-7-6-5 / ..."""
    groups = [[] for _ in range(buckets)]
    for index, item in enumerate(items):
        row, col = divmod(index, buckets)
        target = col if row % 2 == 0 else buckets - 1 - col
        groups[target].append(item)
    return groups


def round_robin_pairings(items):
    """Circle method. Returns a list of rounds, each one a list of pairs."""
    items = list(items)
    if len(items) % 2:
        items.append(None)
    n = len(items)
    rounds = []
    for _ in range(n - 1):
        pairs = []
        for i in range(n // 2):
            a, b = items[i], items[n - 1 - i]
            if a is not None and b is not None:
                pairs.append((a, b))
        rounds.append(pairs)
        items = [items[0], items[-1]] + items[1:-1]
    return rounds


def create_match(stage, round_number, position, registrations, **extra):
    match = Match.objects.create(
        stage=stage, round=round_number, position=position,
        best_of=stage.best_of, **extra
    )
    MatchParticipant.objects.bulk_create([
        MatchParticipant(match=match, registration=reg, slot=slot)
        for slot, reg in enumerate(registrations, start=1)
    ])
    return match


# ------------------------------------------------------------ participants

def eligible_registrations(tournament):
    return tournament.registrations.filter(status='confirmed', is_active=True)


def qualifiers(stage):
    """Participants that advance from a finished stage, interleaved by
    rank: 1st of every group, then 2nd of every group, ..."""
    if stage.stage_type not in ['round_robin', 'free_for_all']:
        raise TournamentError(
            'Qualifiers can only be computed from round robin or free for '
            'all stages. Send the participants explicitly.'
        )
    if stage.advance_per_group < 1:
        raise TournamentError(
            f'Stage "{stage.name}" has advance_per_group = 0.'
        )
    if stage.matches.exclude(status__in=['completed', 'canceled']).exists():
        raise TournamentError(
            f'Stage "{stage.name}" still has matches to be played.'
        )
    tables = [
        [row['registration'] for row in group['standings']]
        for group in stage_standings(stage)
    ]
    result = []
    for rank in range(stage.advance_per_group):
        for table in tables:
            if rank < len(table):
                result.append(table[rank])
    return result


def resolve_participants(stage, registration_ids=None):
    tournament = stage.tournament
    if registration_ids:
        regs = {
            r.id: r for r in eligible_registrations(tournament).filter(
                id__in=registration_ids
            )
        }
        missing = [i for i in registration_ids if i not in regs]
        if missing:
            raise TournamentError(
                f'Registrations {missing} are not confirmed and active in '
                'this tournament.'
            )
        if len(set(registration_ids)) != len(registration_ids):
            raise TournamentError('Duplicated registrations.')
        return [regs[i] for i in registration_ids]

    previous = stage.previous_stage()
    if previous is not None:
        return qualifiers(previous)
    return list(eligible_registrations(tournament))


# -------------------------------------------------------------- generators

def generate_round_robin(stage, groups):
    for group, regs in groups:
        rounds = round_robin_pairings(regs)
        all_rounds = list(rounds)
        for _ in range(1, stage.round_robin_legs):
            # Following legs repeat the rounds swapping the slots.
            rounds = [[(b, a) for a, b in pairs] for pairs in rounds]
            all_rounds.extend(rounds)
        for round_number, pairs in enumerate(all_rounds, start=1):
            for position, pair in enumerate(pairs, start=1):
                create_match(
                    stage, round_number, position, pair, group=group
                )


def generate_free_for_all(stage, groups):
    for group, regs in groups:
        for round_number in range(1, stage.ffa_rounds + 1):
            create_match(stage, round_number, 1, regs, group=group)


def generate_single_elimination(stage, regs):
    if len(regs) < 2:
        raise TournamentError('At least 2 participants are needed.')
    size = 2 ** math.ceil(math.log2(len(regs)))
    total_rounds = int(math.log2(size))
    seeded = {seed: reg for seed, reg in enumerate(regs, start=1)}
    order = bracket_seed_order(size)

    matches_by_round = {}
    for round_number in range(1, total_rounds + 1):
        count = size // (2 ** round_number)
        matches_by_round[round_number] = []
        for position in range(1, count + 1):
            if round_number == 1:
                a = seeded.get(order[(position - 1) * 2])
                b = seeded.get(order[(position - 1) * 2 + 1])
                registrations = [a, b]
            else:
                registrations = [None, None]
            match = create_match(
                stage, round_number, position, registrations,
                label=elimination_round_label(round_number, total_rounds),
            )
            matches_by_round[round_number].append(match)

    for round_number in range(1, total_rounds):
        for index, match in enumerate(matches_by_round[round_number]):
            match.next_match = matches_by_round[round_number + 1][index // 2]
            match.next_match_slot = index % 2 + 1
            match.save(update_fields=['next_match', 'next_match_slot'])

    if stage.third_place_match and len(regs) >= 4 and total_rounds >= 2:
        third = create_match(
            stage, total_rounds, 2, [None, None], label='Third place'
        )
        for index, semi in enumerate(matches_by_round[total_rounds - 1]):
            semi.loser_next_match = third
            semi.loser_next_match_slot = index + 1
            semi.save(update_fields=[
                'loser_next_match', 'loser_next_match_slot'
            ])

    # Byes: the participant without rival advances automatically.
    for match in matches_by_round[1]:
        entries = list(match.participants.all())
        present = [p for p in entries if p.registration_id]
        if len(present) == 1:
            match.is_bye = True
            match.status = 'completed'
            match.winner = present[0].registration
            match.save(update_fields=['is_bye', 'status', 'winner'])
            place_in_slot(
                match.next_match, match.next_match_slot, match.winner
            )


def build_groups(stage, regs):
    if len(regs) < 2:
        raise TournamentError('At least 2 participants are needed.')
    if stage.number_of_groups > len(regs) // 2:
        raise TournamentError(
            'Too many groups: every group needs at least 2 participants.'
        )
    groups = []
    distribution = snake_distribution(regs, stage.number_of_groups)
    for index, group_regs in enumerate(distribution):
        group = StageGroup.objects.create(
            stage=stage, name=group_name(index), order=index + 1
        )
        StageParticipant.objects.filter(
            stage=stage, registration__in=group_regs
        ).update(group=group)
        groups.append((group, group_regs))
    return groups


@transaction.atomic
def draw_stage(stage, registration_ids=None, shuffle=True):
    """Builds the stage: assigns participants (randomly when ``shuffle``,
    otherwise keeping the given/seed order), groups and matches."""
    stage = Stage.objects.select_for_update().get(pk=stage.pk)
    if stage.matches.filter(status='completed', is_bye=False).exists():
        raise TournamentError(
            'The stage already has results. Reset it before a new draw.'
        )
    regs = resolve_participants(stage, registration_ids)
    if len(regs) < 2:
        raise TournamentError('At least 2 participants are needed.')
    if shuffle:
        random.shuffle(regs)

    clear_stage(stage)
    StageParticipant.objects.bulk_create([
        StageParticipant(stage=stage, registration=reg, seed=seed)
        for seed, reg in enumerate(regs, start=1)
    ])

    if stage.stage_type == 'single_elimination':
        generate_single_elimination(stage, regs)
    elif stage.stage_type == 'round_robin':
        generate_round_robin(stage, build_groups(stage, regs))
    elif stage.stage_type == 'free_for_all':
        generate_free_for_all(stage, build_groups(stage, regs))
    # Manual stages only register their participants: the admin creates
    # the matches (and their bracket links) by hand.

    stage.status = 'pending'
    stage.save(update_fields=['status'])
    return stage


def clear_stage(stage):
    # Remove bracket links first so SET_NULL does not cascade work.
    stage.matches.update(next_match=None, loser_next_match=None)
    stage.matches.all().delete()
    stage.groups.all().delete()
    stage.participants.all().delete()


@transaction.atomic
def reset_stage(stage):
    clear_stage(stage)
    stage.status = 'pending'
    stage.save(update_fields=['status'])


# ----------------------------------------------------------------- results

def place_in_slot(match, slot, registration):
    if match is None:
        return
    entry, _ = MatchParticipant.objects.get_or_create(match=match, slot=slot)
    if registration is not None:
        # The registration may already be in another slot (re-propagation).
        MatchParticipant.objects.filter(
            match=match, registration=registration
        ).exclude(pk=entry.pk).update(registration=None)
    entry.registration = registration
    entry.score = 0
    entry.placement = None
    entry.save()


def ensure_downstream_editable(match):
    for target in [match.next_match, match.loser_next_match]:
        if target is not None and target.status == 'completed' \
                and not target.is_bye:
            raise TournamentError(
                f'Match {target.id} (next in bracket) already has a result. '
                'Reset it first.'
            )


def decide_winner(match, entries, winner_id):
    if winner_id is not None:
        winner = next(
            (e.registration for e in entries
             if e.registration_id == winner_id), None
        )
        if winner is None:
            raise TournamentError('The winner must be a participant.')
        return winner
    if match.stage.stage_type == 'free_for_all' or len(entries) > 2:
        best = [e for e in entries if e.placement == 1]
        return best[0].registration if len(best) == 1 else None
    a, b = entries
    if a.score == b.score:
        if match.stage.allows_draws:
            return None
        raise TournamentError(
            'Draws are not allowed in this stage: send the winner.'
        )
    return a.registration if a.score > b.score else b.registration


def assign_placements(entries):
    ordered = sorted(entries, key=lambda e: e.score, reverse=True)
    placement = 0
    previous = None
    for index, entry in enumerate(ordered, start=1):
        if entry.score != previous:
            placement = index
            previous = entry.score
        entry.placement = placement


@transaction.atomic
def record_result(match, scores=None, winner_id=None, placements=None):
    """The admin in charge defines the winner (``winner_id``); the scores
    are optional for 1 vs 1 matches. When only scores are sent the winner is
    the one with the highest score. Free for all matches need the points of
    every participant.

    ``scores``: {registration_id: score}. ``placements`` (optional, for
    free for all): {registration_id: placement}."""
    match = Match.objects.select_for_update().get(pk=match.pk)
    if match.is_bye:
        raise TournamentError('Bye matches have no result.')
    if match.status == 'canceled':
        raise TournamentError('The match is canceled.')
    entries = list(match.participants.select_related('registration'))
    if len(entries) < 2 or any(e.registration_id is None for e in entries):
        raise TournamentError('The match participants are not defined yet.')
    registration_ids = {e.registration_id for e in entries}
    if not scores:
        if winner_id is None:
            raise TournamentError('Send the winner or the scores.')
        if match.stage.stage_type == 'free_for_all' or len(entries) > 2:
            raise TournamentError(
                'Free for all matches need the points of every participant.'
            )
        scores = dict.fromkeys(registration_ids, 0)
    if set(scores) != registration_ids:
        raise TournamentError(
            'A score must be sent for every participant of the match.'
        )
    if placements and set(placements) != registration_ids:
        raise TournamentError(
            'A placement must be sent for every participant.'
        )

    old_winner_id = match.winner_id
    old_loser = loser_of(match, entries)

    for entry in entries:
        entry.score = scores[entry.registration_id]
        entry.placement = (
            placements[entry.registration_id] if placements else None
        )
    if not placements and (
            match.stage.stage_type == 'free_for_all' or len(entries) > 2):
        assign_placements(entries)

    winner = decide_winner(match, entries, winner_id)
    if winner is None and (match.next_match_id or match.loser_next_match_id):
        raise TournamentError(
            'This match feeds a bracket: a winner is required.'
        )
    winner_changed = (winner.id if winner else None) != old_winner_id
    if match.status == 'completed' and winner_changed:
        ensure_downstream_editable(match)

    MatchParticipant.objects.bulk_update(entries, ['score', 'placement'])
    match.winner = winner
    match.status = 'completed'
    match.save(update_fields=['winner', 'status', 'updated_at'])

    if match.next_match_id and winner_changed:
        place_in_slot(match.next_match, match.next_match_slot, winner)
    loser = loser_of(match, entries)
    if match.loser_next_match_id and loser != old_loser:
        place_in_slot(
            match.loser_next_match, match.loser_next_match_slot, loser
        )

    update_progress(match.stage)
    return match


def loser_of(match, entries):
    if match.winner_id is None or len(entries) != 2:
        return None
    return next(
        (e.registration for e in entries
         if e.registration_id != match.winner_id), None
    )


@transaction.atomic
def reset_result(match):
    match = Match.objects.select_for_update().get(pk=match.pk)
    if match.is_bye:
        raise TournamentError('Bye matches cannot be reset.')
    ensure_downstream_editable(match)
    match.participants.update(score=0, placement=None)
    if match.next_match_id and match.winner_id:
        place_in_slot(match.next_match, match.next_match_slot, None)
    if match.loser_next_match_id and match.winner_id:
        place_in_slot(
            match.loser_next_match, match.loser_next_match_slot, None
        )
    match.winner = None
    match.status = 'scheduled'
    match.save(update_fields=['winner', 'status', 'updated_at'])
    update_progress(match.stage)
    return match


def update_progress(stage):
    pending = stage.matches.exclude(status__in=['completed', 'canceled'])
    played = stage.matches.filter(status='completed', is_bye=False)
    if not stage.matches.exists() or not played.exists():
        new_status = 'pending'
    elif pending.exists():
        new_status = 'ongoing'
    else:
        new_status = 'completed'
    if stage.status != new_status:
        stage.status = new_status
        stage.save(update_fields=['status'])
    tournament = stage.tournament
    stages = set(tournament.stages.values_list('status', flat=True))
    if stages == {'completed'}:
        tournament_status = 'completed'
    elif stages & {'ongoing', 'completed'}:
        tournament_status = 'ongoing'
    else:
        tournament_status = tournament.status
    if tournament.status in ['upcoming', 'ongoing', 'completed'] \
            and tournament.status != tournament_status:
        tournament.status = tournament_status
        tournament.save(update_fields=['status'])


# --------------------------------------------------------------- standings

def empty_row(registration):
    return {
        'registration': registration,
        'played': 0, 'wins': 0, 'draws': 0, 'losses': 0,
        'score_for': 0, 'score_against': 0, 'score_diff': 0, 'points': 0,
    }


def round_robin_table(stage, regs, matches):
    rows = {reg.id: empty_row(reg) for reg in regs}
    for match in matches:
        entries = list(match.participants.all())
        if len(entries) != 2:
            continue
        for entry, rival in [entries, entries[::-1]]:
            row = rows.get(entry.registration_id)
            if row is None:
                continue
            row['played'] += 1
            row['score_for'] += entry.score
            row['score_against'] += rival.score
            if match.winner_id is None:
                row['draws'] += 1
                row['points'] += stage.points_draw
            elif match.winner_id == entry.registration_id:
                row['wins'] += 1
                row['points'] += stage.points_win
            else:
                row['losses'] += 1
                row['points'] += stage.points_loss
    for row in rows.values():
        row['score_diff'] = row['score_for'] - row['score_against']
    return sorted(
        rows.values(),
        key=lambda r: (
            -r['points'], -r['score_diff'], -r['score_for'], -r['wins']
        ),
    )


def free_for_all_table(regs, matches):
    rows = {reg.id: empty_row(reg) for reg in regs}
    for row in rows.values():
        row['best_placement'] = None
    for match in matches:
        for entry in match.participants.all():
            row = rows.get(entry.registration_id)
            if row is None:
                continue
            row['played'] += 1
            row['points'] += entry.score
            if entry.placement == 1:
                row['wins'] += 1
            if entry.placement and (
                    row['best_placement'] is None
                    or entry.placement < row['best_placement']):
                row['best_placement'] = entry.placement
    return sorted(
        rows.values(),
        key=lambda r: (-r['points'], -r['wins'], r['best_placement'] or 999),
    )


def stage_standings(stage):
    """Standings per group. Elimination/manual stages are treated as a
    single group computed like a round robin (useful for manual leagues).
    """
    completed = Match.objects.filter(
        stage=stage, status='completed', is_bye=False
    ).prefetch_related('participants')
    groups = list(stage.groups.all())
    sections = groups or [None]
    result = []
    for group in sections:
        entries = stage.participants.select_related('registration')
        matches = completed
        if group is not None:
            entries = entries.filter(group=group)
            matches = completed.filter(group=group)
        regs = [e.registration for e in entries]
        if stage.stage_type == 'free_for_all':
            table = free_for_all_table(regs, matches)
        else:
            table = round_robin_table(stage, regs, matches)
        for rank, row in enumerate(table, start=1):
            row['rank'] = rank
        result.append({
            'group': group.name if group else None,
            'group_id': group.id if group else None,
            'standings': table,
        })
    return result


# ---------------------------------------------------------------- schedule

@transaction.atomic
def schedule_stage(stage, start, interval_minutes, parallel=1,
                   only_unscheduled=True):
    """Assigns dates to the matches of a stage in order (round, position),
    playing ``parallel`` matches at the same time every slot."""
    if parallel < 1 or interval_minutes < 1:
        raise TournamentError('parallel and interval must be positive.')
    matches = stage.matches.filter(is_bye=False).exclude(
        status__in=['completed', 'canceled']
    ).order_by('round', 'group__order', 'position')
    if only_unscheduled:
        matches = matches.filter(scheduled_at__isnull=True)
    matches = list(matches)
    for index, match in enumerate(matches):
        slot = index // parallel
        match.scheduled_at = start + timedelta(
            minutes=interval_minutes * slot
        )
    Match.objects.bulk_update(matches, ['scheduled_at'])
    return len(matches)
