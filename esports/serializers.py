import json

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from .models import (
    AdminGame, ContactInfo, CustomUser, Game, Match, MatchParticipant,
    MediaContent, Registration, RegistrationMember, SiteSettings, Stage,
    StageGroup, Stream, Tournament, validate_team_size,
)


def validate_file_size(value):
    limit = settings.MAX_UPLOAD_SIZE_MB
    if value and value.size > limit * 1024 * 1024:
        raise serializers.ValidationError(
            f"The file cannot be bigger than {limit} MB."
            )
    return value


# --------------------------------------------------------------- admins

class AdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            raise serializers.ValidationError(
                "Username and password are required."
                )

        user = authenticate(username=username, password=password)

        if not user:
            raise AuthenticationFailed("Invalid credentials")

        if user.role not in ['admin', 'superadmin']:
            raise PermissionDenied(
                "You do not have permission to access this resource."
                )

        data['user'] = user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class ResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ['id', 'name']


class AdminListSerializer(serializers.ModelSerializer):
    games = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email',
            'nickname', 'phone', 'role', 'games'
            ]

    def get_games(self, obj):
        return GameSerializer(obj.managed_games(), many=True).data


class AdminCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    game_ids = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), many=True, required=False,
        write_only=True
        )

    class Meta:
        model = CustomUser
        fields = [
            'username', 'password', 'role', 'first_name', 'last_name',
            'email', 'nickname', 'phone', 'game_ids'
            ]

    def validate_role(self, value):
        if value not in ['admin', 'superadmin']:
            raise serializers.ValidationError("Invalid role.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    @transaction.atomic
    def create(self, validated_data):
        games = validated_data.pop('game_ids', [])
        password = validated_data.pop('password')
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        if user.role == 'admin':
            AdminGame.objects.bulk_create([
                AdminGame(admin=user, game=game) for game in games
            ])
        return user


class AdminUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = [
            'first_name', 'last_name', 'email', 'nickname', 'phone',
            'role'
            ]

    def validate_role(self, value):
        if value not in ['admin', 'superadmin']:
            raise serializers.ValidationError("Invalid role.")
        return value


class AssignGamesSerializer(serializers.Serializer):
    game_ids = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), many=True
        )


# ------------------------------------------------------------- settings

class SiteSettingsSerializer(serializers.ModelSerializer):
    currency = serializers.SerializerMethodField()

    class Meta:
        model = SiteSettings
        fields = [
            'event_name', 'registration_enabled', 'registration_start',
            'registration_end', 'main_stream_url', 'currency'
            ]

    def get_currency(self, obj):
        return settings.CURRENCY

    def validate(self, data):
        start = data.get(
            'registration_start', getattr(self.instance, 'registration_start',
                                          None))
        end = data.get(
            'registration_end', getattr(self.instance, 'registration_end',
                                        None))
        if start and end and start >= end:
            raise serializers.ValidationError(
                {'registration_end': 'End date must be after start date.'}
                )
        return data


# ---------------------------------------------------------------- games

# Fields that a game admin can change on the games assigned to them.
GAME_ADMIN_FIELDS = {
    'description', 'rules', 'images', 'bases', 'min_players', 'max_players'
}


class GameCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ['id', 'name', 'description', 'type_of_game',
                  'min_players', 'max_players', 'rules', 'active',
                  'images', 'bases']

    def validate_bases(self, value):
        if value and not value.name.lower().endswith('.pdf'):
            raise serializers.ValidationError("Bases file must be a PDF.")
        return validate_file_size(value)

    def validate_images(self, value):
        if value and not value.name.lower().endswith((
                '.png', '.jpg', '.jpeg', '.webp')):
            raise serializers.ValidationError(
                "Images must be in PNG, JPG, JPEG or WEBP format."
                )
        return validate_file_size(value)

    def validate(self, data):
        user = self.context['request'].user
        if not user.is_superadmin():
            forbidden = set(self.initial_data) - GAME_ADMIN_FIELDS
            forbidden &= set(self.fields)
            if forbidden:
                raise PermissionDenied(
                    "Game admins cannot change: "
                    f"{', '.join(sorted(forbidden))}."
                    )

        def current(field, default):
            return data.get(field, getattr(self.instance, field, default))

        type_of_game = current('type_of_game', None)
        min_players = current('min_players', 1)
        max_players = current('max_players', 1)
        if type_of_game == 'individual' and 'min_players' not in data \
                and 'max_players' not in data:
            data['min_players'] = data['max_players'] = 1
            min_players = max_players = 1
        errors = validate_team_size(type_of_game, min_players, max_players)
        if errors:
            raise serializers.ValidationError(errors)
        return data


class GamePublicSerializer(serializers.ModelSerializer):
    tournaments = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = ['id', 'name', 'description', 'type_of_game',
                  'min_players', 'max_players', 'rules', 'active',
                  'images', 'bases', 'tournaments']

    def get_tournaments(self, obj):
        return [{
            'id': t.id,
            'name': t.name,
            'status': t.status} for t in obj.tournaments.all()]


# ---------------------------------------------------------- tournaments

class StageSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = ['id', 'name', 'order', 'stage_type', 'status']


class TournamentSerializer(serializers.ModelSerializer):
    game_name = serializers.CharField(source='game.name', read_only=True)
    type_of_game = serializers.CharField(
        source='game.type_of_game', read_only=True
        )
    min_players = serializers.IntegerField(
        source='game.min_players', read_only=True
        )
    max_players = serializers.IntegerField(
        source='game.max_players', read_only=True
        )
    currency = serializers.SerializerMethodField()
    registration = serializers.SerializerMethodField()
    stages = StageSummarySerializer(many=True, read_only=True)

    class Meta:
        model = Tournament
        fields = [
            'id', 'game', 'game_name', 'type_of_game', 'min_players',
            'max_players', 'name', 'description', 'start_date', 'end_date',
            'status', 'fee_per_player', 'currency', 'registration_enabled',
            'registration_start', 'registration_end', 'max_registrations',
            'registration', 'stages'
            ]

    def get_currency(self, obj):
        return settings.CURRENCY

    def get_registration(self, obj):
        site = self.context.get('site_settings')
        is_open, reason = obj.registration_state(site)
        start, end = obj.registration_window(site)
        return {
            'is_open': is_open,
            'reason': reason,
            'starts_at': start,
            'ends_at': end,
            'registered': obj.active_registrations().count(),
        }

    def validate(self, data):
        start = data.get('registration_start', getattr(
            self.instance, 'registration_start', None))
        end = data.get('registration_end', getattr(
            self.instance, 'registration_end', None))
        if start and end and start >= end:
            raise serializers.ValidationError(
                {'registration_end': 'End date must be after start date.'}
                )
        t_start = data.get('start_date', getattr(
            self.instance, 'start_date', None))
        t_end = data.get('end_date', getattr(self.instance, 'end_date', None))
        if t_start and t_end and t_start > t_end:
            raise serializers.ValidationError(
                {'end_date': 'End date must be after start date.'}
                )
        if self.instance and 'game' in data \
                and data['game'] != self.instance.game:
            raise serializers.ValidationError(
                {'game': 'The game of a tournament cannot be changed.'}
                )
        return data


# -------------------------------------------------------- registrations

class JSONListField(serializers.ListField):
    """Accepts a real list (JSON requests) or a JSON encoded string, which
    is what multipart forms (needed to upload the voucher) can send."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except ValueError:
                self.fail('not_a_list', input_type='invalid JSON')
        return super().to_internal_value(data)

    def get_value(self, dictionary):
        # In multipart forms, ListField would call getlist(): read the
        # raw value instead so a JSON string is supported.
        if hasattr(dictionary, 'getlist') and self.field_name in dictionary:
            values = dictionary.getlist(self.field_name)
            return values[0] if len(values) == 1 else values
        return super().get_value(dictionary)


class RegistrationMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationMember
        fields = [
            'id', 'full_name', 'student_code', 'nickname',
            'game_account_id', 'email', 'phone', 'is_captain'
            ]
        read_only_fields = ['id']


class PublicMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationMember
        fields = ['nickname', 'is_captain']


class RegistrationCreateSerializer(serializers.ModelSerializer):
    members = JSONListField(
        child=RegistrationMemberSerializer(), allow_empty=False
        )

    class Meta:
        model = Registration
        fields = [
            'team_name', 'logo', 'voucher', 'contact_email',
            'contact_phone', 'members'
            ]

    def validate_logo(self, value):
        return validate_file_size(value)

    def validate_voucher(self, value):
        return validate_file_size(value)

    def validate(self, data):
        tournament = self.context['tournament']
        game = tournament.game
        is_open, reason = tournament.registration_state()
        if not is_open:
            raise serializers.ValidationError({'detail': reason})

        members = data['members']
        errors = {}
        count = len(members)
        if not game.min_players <= count <= game.max_players:
            errors['members'] = (
                f"This game requires between {game.min_players} and "
                f"{game.max_players} players."
                )

        captains = [m for m in members if m.get('is_captain')]
        if game.is_team_game:
            if len(captains) != 1:
                errors['captain'] = 'Exactly one member must be the captain.'
            team_name = data.get('team_name', '').strip()
            if not team_name:
                errors['team_name'] = 'The team name is required.'
            elif tournament.active_registrations().filter(
                    team_name__iexact=team_name).exists():
                errors['team_name'] = 'This team name is already taken.'
            data['team_name'] = team_name
        else:
            data['team_name'] = ''
            for member in members:
                member['is_captain'] = True

        codes = [m['student_code'].strip().upper() for m in members]
        if len(set(codes)) != len(codes):
            errors['student_code'] = 'Student codes must be unique.'
        taken = RegistrationMember.objects.filter(
            registration__tournament=tournament,
            student_code__in=codes,
        ).exclude(registration__status='rejected').values_list(
            'student_code', flat=True)
        if taken:
            errors['student_code'] = (
                f"Already registered in this tournament: "
                f"{', '.join(sorted(set(taken)))}."
                )

        if tournament.fee_per_player > 0 and not data.get('voucher'):
            errors['voucher'] = 'The payment voucher is required.'
        if errors:
            raise serializers.ValidationError(errors)
        for member, code in zip(members, codes):
            member['student_code'] = code
        return data

    @transaction.atomic
    def create(self, validated_data):
        members = validated_data.pop('members')
        tournament = self.context['tournament']
        registration = Registration.objects.create(
            tournament=tournament,
            amount_due=tournament.calculate_fee(len(members)),
            **validated_data
        )
        RegistrationMember.objects.bulk_create([
            RegistrationMember(registration=registration, **member)
            for member in members
        ])
        return registration


class RegistrationSerializer(serializers.ModelSerializer):
    """Full data, only for admins."""
    members = RegistrationMemberSerializer(many=True, read_only=True)
    display_name = serializers.CharField(read_only=True)
    tournament_name = serializers.CharField(
        source='tournament.name', read_only=True
        )
    reviewed_by = serializers.StringRelatedField()

    class Meta:
        model = Registration
        fields = [
            'id', 'tournament', 'tournament_name', 'display_name',
            'team_name', 'logo', 'voucher', 'contact_email',
            'contact_phone', 'amount_due', 'status', 'rejection_reason',
            'is_active', 'seed', 'code', 'created_at', 'reviewed_at',
            'reviewed_by', 'members'
            ]
        read_only_fields = [
            'tournament', 'voucher', 'amount_due', 'status',
            'rejection_reason', 'code', 'created_at', 'reviewed_at',
            ]


class RegistrationStatusSerializer(serializers.ModelSerializer):
    """What the person that registered can see with its code."""
    display_name = serializers.CharField(read_only=True)
    tournament_name = serializers.CharField(
        source='tournament.name', read_only=True
        )
    members = PublicMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Registration
        fields = [
            'code', 'tournament', 'tournament_name', 'display_name',
            'amount_due', 'status', 'rejection_reason', 'created_at',
            'members'
            ]


class PublicRegistrationSerializer(serializers.ModelSerializer):
    """Participants list shown in the public site."""
    display_name = serializers.CharField(read_only=True)
    members = PublicMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Registration
        fields = ['id', 'display_name', 'team_name', 'logo', 'seed',
                  'members']


class RejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


# --------------------------------------------------------------- stages

class StageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = [
            'id', 'tournament', 'name', 'order', 'stage_type', 'status',
            'best_of', 'number_of_groups', 'advance_per_group',
            'round_robin_legs', 'ffa_rounds', 'third_place_match',
            'points_win', 'points_draw', 'points_loss'
            ]
        read_only_fields = ['status']
        # Order uniqueness is validated in validate() with a clear message.
        validators = []

    def validate(self, data):
        tournament = data.get('tournament', getattr(
            self.instance, 'tournament', None))
        if self.instance and 'tournament' in data \
                and data['tournament'] != self.instance.tournament:
            raise serializers.ValidationError(
                {'tournament': 'The tournament cannot be changed.'}
                )
        order = data.get('order', getattr(self.instance, 'order', 1))
        qs = Stage.objects.filter(tournament=tournament, order=order)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'order': 'There is already a stage with this order.'}
                )
        if self.instance and self.instance.matches.exists():
            locked = {
                'stage_type', 'number_of_groups', 'round_robin_legs',
                'ffa_rounds', 'third_place_match'
            }
            changed = [
                f for f in locked
                if f in data and data[f] != getattr(self.instance, f)
            ]
            if changed:
                raise serializers.ValidationError({
                    'detail': (
                        'Reset the stage before changing: '
                        f"{', '.join(sorted(changed))}."
                    )
                })
        return data


class DrawSerializer(serializers.Serializer):
    registration_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True,
        help_text=(
            'Ordered participants. Empty: confirmed registrations (first '
            'stage) or qualifiers of the previous stage.'
        )
        )
    shuffle = serializers.BooleanField(
        default=True,
        help_text='Random draw. False keeps the order (seeding).'
        )


class ScheduleSerializer(serializers.Serializer):
    start = serializers.DateTimeField()
    interval_minutes = serializers.IntegerField(min_value=1)
    parallel = serializers.IntegerField(min_value=1, default=1)
    only_unscheduled = serializers.BooleanField(default=True)


# -------------------------------------------------------------- matches

class MatchParticipantSerializer(serializers.ModelSerializer):
    registration_name = serializers.SerializerMethodField()
    logo = serializers.SerializerMethodField()

    class Meta:
        model = MatchParticipant
        fields = [
            'id', 'slot', 'registration', 'registration_name', 'logo',
            'score', 'placement'
            ]

    def get_registration_name(self, obj):
        return obj.registration.display_name if obj.registration else None

    def get_logo(self, obj):
        if not obj.registration or not obj.registration.logo:
            return None
        request = self.context.get('request')
        url = obj.registration.logo.url
        return request.build_absolute_uri(url) if request else url


class StreamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stream
        fields = [
            'id', 'title', 'platform', 'url', 'game', 'match', 'is_live',
            'created_at'
            ]
        read_only_fields = ['created_at']


class MatchSerializer(serializers.ModelSerializer):
    participants = MatchParticipantSerializer(many=True, read_only=True)
    streams = StreamSerializer(many=True, read_only=True)
    stage_name = serializers.CharField(source='stage.name', read_only=True)
    group_name = serializers.CharField(
        source='group.name', read_only=True, default=None
        )
    tournament = serializers.IntegerField(
        source='stage.tournament_id', read_only=True
        )
    game = serializers.IntegerField(
        source='stage.tournament.game_id', read_only=True
        )
    registration_ids = serializers.ListField(
        child=serializers.IntegerField(allow_null=True), write_only=True,
        required=False,
        help_text='Participants by slot (null = TBD). Manual matches.'
        )

    class Meta:
        model = Match
        fields = [
            'id', 'tournament', 'game', 'stage', 'stage_name', 'group',
            'group_name', 'round', 'position', 'label', 'scheduled_at',
            'best_of', 'status', 'is_bye', 'winner', 'next_match',
            'next_match_slot', 'loser_next_match', 'loser_next_match_slot',
            'notes', 'participants', 'streams', 'registration_ids',
            'updated_at'
            ]
        read_only_fields = ['is_bye', 'winner', 'updated_at']

    def validate_status(self, value):
        if value == 'completed':
            raise serializers.ValidationError(
                "Use the result endpoint to complete a match."
                )
        if self.instance and self.instance.status == 'completed':
            raise serializers.ValidationError(
                "Reset the result before changing the status."
                )
        return value

    def validate(self, data):
        stage = data.get('stage', getattr(self.instance, 'stage', None))
        if self.instance and 'stage' in data \
                and data['stage'] != self.instance.stage:
            raise serializers.ValidationError(
                {'stage': 'The stage of a match cannot be changed.'}
                )
        group = data.get('group')
        if group is not None and group.stage_id != stage.id:
            raise serializers.ValidationError(
                {'group': 'The group does not belong to the stage.'}
                )
        for field in ['next_match', 'loser_next_match']:
            target = data.get(field)
            slot = data.get(
                f'{field}_slot', getattr(self.instance, f'{field}_slot', None)
                )
            current = target if field in data else getattr(
                self.instance, field, None)
            if bool(current) != bool(slot):
                raise serializers.ValidationError({
                    field: f'{field} and {field}_slot must be set together.'
                })
            if target is not None:
                if target.stage.tournament_id != stage.tournament_id:
                    raise serializers.ValidationError(
                        {field: 'Must be a match of the same tournament.'}
                        )
                if self.instance and target.pk == self.instance.pk:
                    raise serializers.ValidationError(
                        {field: 'A match cannot feed itself.'}
                        )
        regs = data.get('registration_ids')
        if regs is not None:
            if self.instance and self.instance.status == 'completed':
                raise serializers.ValidationError({
                    'registration_ids':
                        'Reset the result before changing participants.'
                })
            ids = [r for r in regs if r is not None]
            if len(set(ids)) != len(ids):
                raise serializers.ValidationError(
                    {'registration_ids': 'Duplicated participants.'}
                    )
            valid = set(stage.tournament.registrations.filter(
                id__in=ids, status='confirmed').values_list('id', flat=True))
            if valid != set(ids):
                raise serializers.ValidationError({
                    'registration_ids': (
                        'Participants must be confirmed registrations of '
                        'the tournament.'
                    )
                })
        return data

    def save_participants(self, match, regs):
        if regs is None:
            return
        match.participants.all().delete()
        MatchParticipant.objects.bulk_create([
            MatchParticipant(match=match, registration_id=reg, slot=slot)
            for slot, reg in enumerate(regs, start=1)
        ])

    @transaction.atomic
    def create(self, validated_data):
        regs = validated_data.pop('registration_ids', None)
        stage = validated_data['stage']
        validated_data.setdefault('best_of', stage.best_of)
        match = super().create(validated_data)
        self.save_participants(match, regs if regs is not None else [
            None, None])
        return match

    @transaction.atomic
    def update(self, instance, validated_data):
        regs = validated_data.pop('registration_ids', None)
        match = super().update(instance, validated_data)
        self.save_participants(match, regs)
        return match


class ScoreSerializer(serializers.Serializer):
    registration = serializers.IntegerField()
    score = serializers.IntegerField()
    placement = serializers.IntegerField(min_value=1, required=False)


class ResultSerializer(serializers.Serializer):
    winner = serializers.IntegerField(
        required=False, allow_null=True,
        help_text=(
            'Registration that wins the match. Enough on its own for 1 vs 1 '
            'matches; it also resolves forfeits and ties.'
        )
        )
    scores = ScoreSerializer(
        many=True, required=False,
        help_text='Optional for 1 vs 1 matches, required for free for all.'
        )

    def validate_scores(self, value):
        with_placement = [s for s in value if 'placement' in s]
        if with_placement and len(with_placement) != len(value):
            raise serializers.ValidationError(
                'Send placement for all participants or for none.'
                )
        return value

    def validate(self, data):
        if not data.get('scores') and data.get('winner') is None:
            raise serializers.ValidationError(
                'Send the winner or the scores.'
                )
        return data


class StandingRowSerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    registration = PublicRegistrationSerializer()
    played = serializers.IntegerField()
    wins = serializers.IntegerField()
    draws = serializers.IntegerField()
    losses = serializers.IntegerField()
    score_for = serializers.IntegerField()
    score_against = serializers.IntegerField()
    score_diff = serializers.IntegerField()
    points = serializers.IntegerField()
    best_placement = serializers.IntegerField(required=False)


class GroupStandingsSerializer(serializers.Serializer):
    group = serializers.CharField(allow_null=True)
    group_id = serializers.IntegerField(allow_null=True)
    standings = StandingRowSerializer(many=True)


class StageGroupSerializer(serializers.ModelSerializer):
    participants = serializers.SerializerMethodField()

    class Meta:
        model = StageGroup
        fields = ['id', 'name', 'order', 'participants']

    def get_participants(self, obj):
        regs = [p.registration for p in obj.participants.all()]
        return PublicRegistrationSerializer(
            regs, many=True, context=self.context).data


class StageDetailSerializer(StageSerializer):
    groups = StageGroupSerializer(many=True, read_only=True)
    participants = serializers.SerializerMethodField()

    class Meta(StageSerializer.Meta):
        fields = StageSerializer.Meta.fields + ['groups', 'participants']

    def get_participants(self, obj):
        regs = [p.registration for p in obj.participants.select_related(
            'registration')]
        return PublicRegistrationSerializer(
            regs, many=True, context=self.context).data


# ----------------------------------------------------------------- misc

class MediaContentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaContent
        fields = ['id', 'title', 'file', 'type', 'uploaded_at']


class ContactInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactInfo
        fields = ['id', 'platform', 'link']
