import json

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.db import transaction
from django.urls import reverse
from PIL import Image
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from .models import (
    AdminGame, ContactInfo, CustomUser, Game, Match, MatchParticipant,
    MediaContent, OrganizerContact, PaymentMethod, Registration,
    RegistrationMember, SiteSettings, Stage, StageGroup, Stream, Tournament,
    normalize_contact, validate_payment_method, validate_team_size,
)


def validate_file_size(value):
    limit = settings.MAX_UPLOAD_SIZE_MB
    if value and value.size > limit * 1024 * 1024:
        raise serializers.ValidationError(
            f"El archivo no puede pesar más de {limit} MB."
            )
    return value


def validate_file_content(value):
    """The extension is not enough: checks that a PDF really is a PDF and
    an image really is an image (a renamed HTML or script is rejected)."""
    if not value:
        return value
    if value.name.lower().endswith('.pdf'):
        value.seek(0)
        valid = value.read(5) == b'%PDF-'
        value.seek(0)
        if not valid:
            raise serializers.ValidationError(
                "El archivo no es un PDF válido."
                )
        return value
    try:
        value.seek(0)
        with Image.open(value) as image:
            image.verify()
            valid = image.format in ('JPEG', 'PNG', 'WEBP')
    except Exception:
        valid = False
    value.seek(0)
    if not valid:
        raise serializers.ValidationError(
            "El archivo no es una imagen válida (JPG, PNG o WEBP)."
            )
    return value


VOUCHER_SALT = 'esports.voucher'
# Lifetime of the signed voucher links given to the admins.
VOUCHER_LINK_SECONDS = 60 * 60


def voucher_url(registration):
    """Vouchers are private files: the admins get a signed link that
    expires instead of a public URL."""
    if not registration.voucher:
        return None
    token = signing.dumps(registration.pk, salt=VOUCHER_SALT)
    path = reverse('registrations-voucher', args=[registration.pk])
    return f'{path}?t={token}'


# --------------------------------------------------------------- admins

class AdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            raise serializers.ValidationError(
                "Usuario y contraseña son obligatorios."
                )

        user = authenticate(username=username, password=password)

        if not user:
            raise AuthenticationFailed("Usuario o contraseña incorrectos.")

        if user.role not in ['admin', 'superadmin']:
            raise PermissionDenied(
                "No tienes permiso para acceder a este recurso."
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
            raise serializers.ValidationError("Rol inválido.")
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
            raise serializers.ValidationError("Rol inválido.")
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
            'event_name', 'registration_enabled', 'main_stream_url',
            'currency'
            ]

    def get_currency(self, obj):
        return settings.CURRENCY


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
            raise serializers.ValidationError("Las bases deben ser un PDF.")
        return validate_file_content(validate_file_size(value))

    def validate_images(self, value):
        if value and not value.name.lower().endswith((
                '.png', '.jpg', '.jpeg', '.webp')):
            raise serializers.ValidationError(
                "La imagen debe ser PNG, JPG, JPEG o WEBP."
                )
        return validate_file_size(value)

    def validate(self, data):
        user = self.context['request'].user
        if not user.is_superadmin():
            forbidden = set(self.initial_data) - GAME_ADMIN_FIELDS
            forbidden &= set(self.fields)
            if forbidden:
                raise PermissionDenied(
                    "Un admin de juego no puede cambiar: "
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


class PaymentMethodSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(
        source='get_method_display', read_only=True
    )
    # Multipart forms cannot send "no file", so the QR is removed with
    # this flag.
    remove_qr = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = PaymentMethod
        fields = ['id', 'game', 'method', 'method_display', 'holder_name',
                  'phone_number', 'bank_name', 'account_number', 'cci',
                  'qr_image', 'remove_qr', 'instructions', 'active',
                  'order']

    def create(self, validated_data):
        validated_data.pop('remove_qr', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if validated_data.pop('remove_qr', False) \
                and 'qr_image' not in validated_data:
            instance.qr_image.delete(save=False)
        return super().update(instance, validated_data)

    def validate_qr_image(self, value):
        if value and not value.name.lower().endswith((
                '.png', '.jpg', '.jpeg', '.webp')):
            raise serializers.ValidationError(
                "El QR debe ser PNG, JPG, JPEG o WEBP."
                )
        return validate_file_size(value)

    def validate(self, data):
        def current(field):
            return data.get(field, getattr(self.instance, field, ''))

        errors = validate_payment_method(
            current('method'), current('phone_number'),
            current('bank_name'), current('account_number'),
            current('instructions'),
        )
        if errors:
            raise serializers.ValidationError(errors)
        return data


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
        start, end = obj.registration_window()
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
                {'registration_end':
                    'La fecha de fin debe ser posterior al inicio.'}
                )
        t_start = data.get('start_date', getattr(
            self.instance, 'start_date', None))
        t_end = data.get('end_date', getattr(self.instance, 'end_date', None))
        if t_start and t_end and t_start > t_end:
            raise serializers.ValidationError(
                {'end_date': 'La fecha de fin debe ser posterior al inicio.'}
                )
        if self.instance and 'game' in data \
                and data['game'] != self.instance.game:
            raise serializers.ValidationError(
                {'game': 'No se puede cambiar el juego de un torneo.'}
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
            'game_account_id', 'email', 'phone', 'is_external',
            'university', 'is_captain'
            ]
        read_only_fields = ['id']

    def validate(self, data):
        university = data.get('university', '').strip()
        if not data.get('is_external'):
            university = ''
        elif not university:
            raise serializers.ValidationError(
                {'university': 'Escribe la universidad de la que viene.'}
            )
        data['university'] = university
        return data


class PublicMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationMember
        fields = ['nickname', 'is_captain']


class RegistrationCreateSerializer(serializers.ModelSerializer):
    members = JSONListField(
        child=RegistrationMemberSerializer(), allow_empty=False
        )
    contact_phone = serializers.CharField(
        max_length=20, allow_blank=True,
        error_messages={'required': 'Escribe el celular del capitán.'},
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
        return validate_file_content(validate_file_size(value))

    def validate_contact_phone(self, value):
        # Required: the organizers reach the captain by phone / WhatsApp
        # (the email is rarely read).
        value, error = normalize_contact('phone', value)
        if error:
            raise serializers.ValidationError(
                'Escribe el celular del capitán (9 dígitos).'
                if not value else error
            )
        return value

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
                f"Este juego requiere entre {game.min_players} y "
                f"{game.max_players} jugadores."
                )

        captains = [m for m in members if m.get('is_captain')]
        if game.is_team_game:
            if len(captains) != 1:
                errors['captain'] = 'Debe haber exactamente un capitán.'
            team_name = data.get('team_name', '').strip()
            if not team_name:
                errors['team_name'] = 'El nombre del equipo es obligatorio.'
            elif tournament.active_registrations().filter(
                    team_name__iexact=team_name).exists():
                errors['team_name'] = 'Ya existe un equipo con ese nombre.'
            data['team_name'] = team_name
        else:
            data['team_name'] = ''
            for member in members:
                member['is_captain'] = True

        codes = [m['student_code'].strip().upper() for m in members]
        if len(set(codes)) != len(codes):
            errors['student_code'] = 'Hay códigos de estudiante repetidos.'
        taken = RegistrationMember.objects.filter(
            registration__tournament=tournament,
            student_code__in=codes,
        ).exclude(registration__status='rejected').values_list(
            'student_code', flat=True)
        if taken:
            errors['student_code'] = (
                f"Ya inscritos en este torneo: "
                f"{', '.join(sorted(set(taken)))}."
                )

        if tournament.fee_per_player > 0 and not data.get('voucher'):
            errors['voucher'] = 'El comprobante de pago es obligatorio.'
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
    """Full data, only for admins. Read only except ``seed`` and
    ``is_active``."""
    members = RegistrationMemberSerializer(many=True, read_only=True)
    display_name = serializers.CharField(read_only=True)
    tournament_name = serializers.CharField(
        source='tournament.name', read_only=True
        )
    reviewed_by = serializers.StringRelatedField()
    voucher = serializers.SerializerMethodField()
    voucher_is_pdf = serializers.SerializerMethodField()

    class Meta:
        model = Registration
        fields = [
            'id', 'tournament', 'tournament_name', 'display_name',
            'team_name', 'logo', 'voucher', 'voucher_is_pdf',
            'contact_email', 'contact_phone', 'amount_due', 'status',
            'rejection_reason',
            'is_active', 'seed', 'code', 'created_at', 'reviewed_at',
            'reviewed_by', 'members'
            ]
        # A registration cannot be edited once it is sent: admins can only
        # order (seed) and enable/disable it; the status changes through
        # the confirm/reject actions.
        read_only_fields = [
            f for f in fields if f not in ['seed', 'is_active']
            ]

    def get_voucher(self, obj):
        # Relative: the same origin serves the API and the frontend.
        return voucher_url(obj)

    def get_voucher_is_pdf(self, obj):
        return obj.voucher.name.lower().endswith('.pdf')


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


class RegistrationLookupSerializer(RegistrationStatusSerializer):
    """Public search by team name or nickname: only public data (no code,
    no student codes, contact data or voucher)."""
    game_name = serializers.CharField(
        source='tournament.game.name', read_only=True
    )

    class Meta(RegistrationStatusSerializer.Meta):
        fields = [
            'id', 'tournament', 'tournament_name', 'game_name',
            'display_name', 'amount_due', 'status', 'rejection_reason',
            'created_at', 'members'
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

class StageUpdateMixin:
    def update(self, instance, validated_data):
        stage = super().update(instance, validated_data)
        if {'best_of', 'final_best_of', 'lower_best_of'} & set(
                validated_data):
            from .services import apply_best_of
            apply_best_of(stage)
        return stage


class StageSerializer(StageUpdateMixin, serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = [
            'id', 'tournament', 'name', 'order', 'stage_type', 'status',
            'best_of', 'final_best_of', 'lower_best_of', 'number_of_groups',
            'advance_per_group', 'lower_advance_per_group',
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
                {'tournament': 'No se puede cambiar el torneo.'}
                )
        order = data.get('order', getattr(self.instance, 'order', 1))
        qs = Stage.objects.filter(tournament=tournament, order=order)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'order': 'Ya existe una fase con ese orden.'}
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
                        'Reinicia la fase antes de cambiar: '
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
    lower_registration_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True,
        help_text='Double elimination: teams that start in the lower bracket.'
        )
    preview = serializers.BooleanField(
        default=False,
        help_text=(
            'Returns the result without saving it. To keep a preview send '
            'its "seeding" as registration_ids with shuffle = false.'
        )
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
    can_draw = serializers.BooleanField(read_only=True)
    registration_ids = serializers.ListField(
        child=serializers.IntegerField(allow_null=True), write_only=True,
        required=False,
        help_text='Participants by slot (null = TBD). Manual matches.'
        )

    class Meta:
        model = Match
        fields = [
            'id', 'tournament', 'game', 'stage', 'stage_name', 'group',
            'group_name', 'bracket', 'round', 'position', 'label',
            'scheduled_at',
            'best_of', 'status', 'is_bye', 'winner', 'next_match',
            'next_match_slot', 'loser_next_match', 'loser_next_match_slot',
            'notes', 'participants', 'streams', 'registration_ids',
            'can_draw', 'updated_at'
            ]
        read_only_fields = [
            'is_bye', 'winner', 'can_draw', 'bracket', 'updated_at'
            ]

    def validate_status(self, value):
        if value == 'completed':
            raise serializers.ValidationError(
                "Un match se completa registrando su resultado."
                )
        if self.instance and self.instance.status == 'completed':
            raise serializers.ValidationError(
                "Reinicia el resultado antes de cambiar el estado."
                )
        return value

    def validate(self, data):
        stage = data.get('stage', getattr(self.instance, 'stage', None))
        if self.instance and 'stage' in data \
                and data['stage'] != self.instance.stage:
            raise serializers.ValidationError(
                {'stage': 'No se puede cambiar la fase de un match.'}
                )
        group = data.get('group')
        if group is not None and group.stage_id != stage.id:
            raise serializers.ValidationError(
                {'group': 'El grupo no pertenece a la fase.'}
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
                    field: f'{field} y {field}_slot van juntos.'
                })
            if target is not None:
                if target.stage.tournament_id != stage.tournament_id:
                    raise serializers.ValidationError(
                        {field: 'Debe ser un match del mismo torneo.'}
                        )
                if self.instance and target.pk == self.instance.pk:
                    raise serializers.ValidationError(
                        {field: 'Un match no puede avanzar a sí mismo.'}
                        )
        regs = data.get('registration_ids')
        if regs is not None:
            if self.instance and self.instance.status == 'completed':
                raise serializers.ValidationError({
                    'registration_ids':
                        'Reinicia el resultado antes de cambiar a los '
                        'participantes.'
                })
            ids = [r for r in regs if r is not None]
            if len(set(ids)) != len(ids):
                raise serializers.ValidationError(
                    {'registration_ids': 'Hay participantes repetidos.'}
                    )
            valid = set(stage.tournament.registrations.filter(
                id__in=ids, status='confirmed').values_list('id', flat=True))
            if valid != set(ids):
                raise serializers.ValidationError({
                    'registration_ids': (
                        'Los participantes deben ser inscripciones '
                        'confirmadas del torneo.'
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
    draw = serializers.BooleanField(
        default=False,
        help_text='Tie (only leagues with an even best of, e.g. Bo2).'
        )

    def validate_scores(self, value):
        with_placement = [s for s in value if 'placement' in s]
        if with_placement and len(with_placement) != len(value):
            raise serializers.ValidationError(
                'Envía la posición de todos los participantes o de ninguno.'
                )
        return value

    def validate(self, data):
        if not data.get('scores') and data.get('winner') is None \
                and not data.get('draw'):
            raise serializers.ValidationError(
                'Envía el ganador o el marcador.'
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

    def validate_file(self, value):
        return validate_file_size(value)


class ContactInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactInfo
        fields = ['id', 'platform', 'link']


class OrganizerContactSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(
        source='get_kind_display', read_only=True
    )
    link = serializers.CharField(read_only=True)

    class Meta:
        model = OrganizerContact
        fields = ['id', 'tournament', 'kind', 'kind_display', 'name',
                  'role', 'value', 'link', 'active', 'registered_only',
                  'order']

    def validate(self, data):
        kind = data.get('kind', getattr(self.instance, 'kind', None))
        if 'value' in data or 'kind' in data:
            value = data.get('value', getattr(self.instance, 'value', ''))
            value, error = normalize_contact(kind, value)
            if error:
                raise serializers.ValidationError({'value': error})
            data['value'] = value
        return data
