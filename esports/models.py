import os
import secrets
import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.core.validators import (
    FileExtensionValidator, MinValueValidator, URLValidator, validate_email,
)
from django.db import models
from django.utils import timezone


IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
VOUCHER_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
MEDIA_CONTENT_EXTENSIONS = IMAGE_EXTENSIONS + ['mp4', 'webm']


class PrivateStorage(FileSystemStorage):
    """Storage outside MEDIA_ROOT: its files have no public URL and are
    only served through the API (payment vouchers). The folder is read
    from the settings on every use, so tests can override it."""

    @property
    def base_location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    @property
    def location(self):
        return os.path.abspath(self.base_location)


_private_storage = PrivateStorage()


def private_storage():
    return _private_storage


def voucher_path(instance, filename):
    # Random name: the original one (team name, phone...) is not kept.
    extension = os.path.splitext(filename)[1].lower()
    return f'vouchers/{uuid.uuid4().hex}{extension}'


class CustomUser(AbstractUser):
    """Staff account. Players do not have accounts: they register through
    the public registration form of each tournament."""
    ROLE_CHOICES = (
        ('admin', 'Game Administrator'),
        ('superadmin', 'Super Administrator'),
    )
    phone = models.CharField(max_length=20, blank=True)
    nickname = models.CharField(max_length=30, blank=True)
    role = models.CharField(
        max_length=10, choices=ROLE_CHOICES, default='admin'
        )

    def __str__(self):
        return f"{self.username} - {self.get_role_display()}"

    def save(self, *args, **kwargs):
        # Users created with `manage.py createsuperuser` are superadmins.
        if self.is_superuser:
            self.role = 'superadmin'
        super().save(*args, **kwargs)

    def is_admin(self):
        return self.role in ['admin', 'superadmin']

    def is_superadmin(self):
        return self.role == 'superadmin'

    def managed_games(self):
        if self.is_superadmin():
            return Game.objects.all()
        return Game.objects.filter(admin_assignments__admin=self)

    def can_manage_game(self, game):
        if game is None:
            return self.is_superadmin()
        if self.is_superadmin():
            return True
        return AdminGame.objects.filter(admin=self, game=game).exists()


class SiteSettings(models.Model):
    """Singleton with the global configuration of the event."""
    event_name = models.CharField(max_length=150, default='Esports')
    # Global switch: when off no tournament accepts registrations. The dates
    # are set on each tournament.
    registration_enabled = models.BooleanField(default=True)
    main_stream_url = models.URLField(blank=True)

    class Meta:
        verbose_name = 'Site settings'
        verbose_name_plural = 'Site settings'

    def __str__(self):
        return self.event_name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


def validate_date_range(start, end):
    if start and end and start >= end:
        raise ValidationError(
            {'registration_end':
                'La fecha de fin debe ser posterior al inicio.'}
            )


class Game(models.Model):
    TYPE_CHOICES = (
        ('individual', 'Individual'),
        ('team', 'Team'),
    )
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField()
    type_of_game = models.CharField(max_length=10, choices=TYPE_CHOICES)
    min_players = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    max_players = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    rules = models.TextField(blank=True)
    bases = models.FileField(
        upload_to='bases/', blank=True,
        validators=[FileExtensionValidator(['pdf'])]
        )
    images = models.ImageField(
        upload_to='games/', blank=True,
        validators=[FileExtensionValidator(IMAGE_EXTENSIONS)]
        )
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def is_team_game(self):
        return self.type_of_game == 'team'

    def clean(self):
        errors = validate_team_size(
            self.type_of_game, self.min_players, self.max_players
            )
        if errors:
            raise ValidationError(errors)


def validate_team_size(type_of_game, min_players, max_players):
    """Returns a dict of errors (empty when the configuration is valid)."""
    errors = {}
    if type_of_game == 'individual':
        if min_players != 1 or max_players != 1:
            errors['max_players'] = (
                'Los juegos individuales tienen exactamente 1 jugador.'
                )
    elif type_of_game == 'team':
        if min_players < 2:
            errors['min_players'] = (
                'Los juegos por equipos necesitan al menos 2 jugadores.'
                )
        elif max_players < min_players:
            errors['max_players'] = (
                'El máximo de jugadores no puede ser menor que el mínimo.'
                )
    return errors


class AdminGame(models.Model):
    admin = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        limit_choices_to={'role': 'admin'},
        related_name='game_assignments'
        )
    game = models.ForeignKey(
        Game,
        on_delete=models.CASCADE,
        related_name='admin_assignments'
    )

    class Meta:
        unique_together = ('admin', 'game')

    def __str__(self):
        return f"{self.admin.username} - {self.game.name}"


class PaymentMethod(models.Model):
    """Where the players pay the registration of the tournaments of a game
    (digital payments only). A game can have several methods."""
    METHOD_CHOICES = (
        ('yape', 'Yape'),
        ('plin', 'Plin'),
        ('bank_transfer', 'Transferencia bancaria'),
        ('other', 'Otro'),
    )
    WALLETS = ('yape', 'plin')

    game = models.ForeignKey(
        Game, on_delete=models.CASCADE, related_name='payment_methods'
        )
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    holder_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=20, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=40, blank=True)
    cci = models.CharField(max_length=30, blank=True)
    qr_image = models.ImageField(
        upload_to='payments/', blank=True,
        validators=[FileExtensionValidator(IMAGE_EXTENSIONS)]
        )
    instructions = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['game', 'order', 'id']

    def __str__(self):
        return f"{self.get_method_display()} - {self.game.name}"

    def clean(self):
        errors = validate_payment_method(
            self.method, self.phone_number, self.bank_name,
            self.account_number, self.instructions,
        )
        if errors:
            raise ValidationError(errors)


def validate_payment_method(method, phone_number, bank_name,
                            account_number, instructions):
    """Returns a dict of errors (empty when the method is complete)."""
    errors = {}
    if method in PaymentMethod.WALLETS:
        digits = ''.join(ch for ch in phone_number if ch.isdigit())
        if not digits:
            errors['phone_number'] = (
                'Indica el número al que se hace el pago.'
            )
        elif len(digits) != 9 or not digits.startswith('9'):
            errors['phone_number'] = (
                'El número debe tener 9 dígitos y empezar con 9.'
            )
    elif method == 'bank_transfer':
        if not bank_name.strip():
            errors['bank_name'] = 'Indica el banco.'
        if not account_number.strip():
            errors['account_number'] = 'Indica el número de cuenta.'
    elif method == 'other':
        if not (account_number.strip() or phone_number.strip()
                or instructions.strip()):
            errors['instructions'] = (
                'Explica cómo pagar o indica una cuenta o número.'
            )
    return errors


class Tournament(models.Model):
    STATUS_CHOICES = (
        ('upcoming', 'Upcoming'),
        ('ongoing', 'Ongoing'),
        ('completed', 'Completed'),
        ('canceled', 'Canceled'),
    )
    game = models.ForeignKey(
        Game, on_delete=models.CASCADE, related_name='tournaments'
        )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='upcoming'
        )
    fee_per_player = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))]
        )
    registration_enabled = models.BooleanField(default=True)
    # Empty start: open right away; empty end: open until it is closed by
    # hand or the tournament starts.
    registration_start = models.DateTimeField(null=True, blank=True)
    registration_end = models.DateTimeField(null=True, blank=True)
    max_registrations = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.name} ({self.game.name})"

    def clean(self):
        validate_date_range(self.registration_start, self.registration_end)

    def registration_window(self):
        return self.registration_start, self.registration_end

    def active_registrations(self):
        return self.registrations.exclude(status='rejected')

    def registration_state(self, site_settings=None):
        """Returns (is_open, reason)."""
        site = site_settings or SiteSettings.load()
        if not self.game.active:
            return False, 'El juego no está activo.'
        if self.status != 'upcoming':
            return False, 'El torneo ya no acepta inscripciones.'
        if not site.registration_enabled:
            return False, 'Las inscripciones están deshabilitadas en general.'
        if not self.registration_enabled:
            return False, 'Las inscripciones de este torneo están cerradas.'
        start, end = self.registration_window()
        now = timezone.now()
        if start and now < start:
            return False, 'Las inscripciones aún no empiezan.'
        if end and now > end:
            return False, 'El periodo de inscripción terminó.'
        if (self.max_registrations is not None
                and self.active_registrations().count()
                >= self.max_registrations):
            return False, 'No quedan cupos disponibles.'
        return True, 'Inscripciones abiertas.'

    def calculate_fee(self, players):
        return self.fee_per_player * players


class Registration(models.Model):
    """A team (or a single player for individual games) registered in a
    tournament."""
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
    )
    tournament = models.ForeignKey(
        Tournament, on_delete=models.CASCADE, related_name='registrations'
        )
    team_name = models.CharField(max_length=100, blank=True)
    logo = models.ImageField(
        upload_to='logos/', blank=True,
        validators=[FileExtensionValidator(IMAGE_EXTENSIONS)]
        )
    voucher = models.FileField(
        upload_to=voucher_path, storage=private_storage, blank=True,
        validators=[FileExtensionValidator(VOUCHER_EXTENSIONS)]
        )
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=20, blank=True)
    amount_due = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('0.00')
        )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='pending'
        )
    rejection_reason = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    seed = models.PositiveIntegerField(null=True, blank=True)
    code = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+'
        )

    class Meta:
        ordering = [models.F('seed').asc(nulls_last=True), 'created_at']

    def __str__(self):
        return self.display_name

    @property
    def captain(self):
        return next(
            (m for m in self.members.all() if m.is_captain), None
            )

    @property
    def display_name(self):
        if self.team_name:
            return self.team_name
        captain = self.captain
        return captain.nickname if captain else f"Registration {self.pk}"

    @property
    def player_count(self):
        return self.members.count()


class RegistrationMember(models.Model):
    registration = models.ForeignKey(
        Registration, on_delete=models.CASCADE, related_name='members'
        )
    full_name = models.CharField(max_length=150)
    student_code = models.CharField(max_length=20)
    nickname = models.CharField(max_length=50)
    game_account_id = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    # Players from other universities say which one.
    is_external = models.BooleanField(default=False)
    university = models.CharField(max_length=150, blank=True)
    is_captain = models.BooleanField(default=False)

    class Meta:
        ordering = ['-is_captain', 'id']

    def __str__(self):
        return f"{self.nickname} ({self.registration})"


class Stage(models.Model):
    """A phase of a tournament. A tournament is built by chaining stages,
    e.g. groups -> single elimination, or a single free for all."""
    TYPE_CHOICES = (
        ('round_robin', 'Groups (round robin)'),
        ('single_elimination', 'Single elimination'),
        ('free_for_all', 'Free for all (points)'),
        ('double_elimination', 'Double elimination'),
        ('manual', 'Manual'),
    )
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('ongoing', 'Ongoing'),
        ('completed', 'Completed'),
    )
    tournament = models.ForeignKey(
        Tournament, on_delete=models.CASCADE, related_name='stages'
        )
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=1)
    stage_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='pending'
        )
    best_of = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    # Elimination: the final can be longer (e.g. rounds Bo1, final Bo3).
    # In double elimination it is the best of of the grand final.
    final_best_of = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)]
        )
    # Double elimination: best of of the lower bracket (empty = best_of).
    lower_best_of = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)]
        )
    number_of_groups = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    # How many participants of each group qualify to the next stage.
    advance_per_group = models.PositiveSmallIntegerField(default=0)
    # When the next stage is a double elimination: the following places of
    # each group start in the lower bracket (e.g. 1st-2nd upper, 3rd-4th
    # lower).
    lower_advance_per_group = models.PositiveSmallIntegerField(default=0)
    # Round robin: 1 = single round, 2 = home and away.
    round_robin_legs = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    # Free for all: number of matches each group plays.
    ffa_rounds = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    third_place_match = models.BooleanField(default=False)
    points_win = models.SmallIntegerField(default=3)
    points_draw = models.SmallIntegerField(default=1)
    points_loss = models.SmallIntegerField(default=0)

    class Meta:
        ordering = ['tournament', 'order']
        constraints = [
            models.UniqueConstraint(
                fields=['tournament', 'order'],
                name='unique_stage_order_in_tournament'
            )
        ]

    def __str__(self):
        return f"{self.tournament.name} - {self.name}"

    def best_of_for(self, label):
        if label in ['Final', 'Grand Final'] and self.final_best_of:
            return self.final_best_of
        if label.startswith('Lower') and self.lower_best_of:
            return self.lower_best_of
        return self.best_of

    @property
    def allows_draws(self):
        return self.stage_type in ['round_robin', 'manual']

    def previous_stage(self):
        return (
            Stage.objects.filter(
                tournament=self.tournament, order__lt=self.order
                ).order_by('-order').first()
        )


class StageGroup(models.Model):
    stage = models.ForeignKey(
        Stage, on_delete=models.CASCADE, related_name='groups'
        )
    name = models.CharField(max_length=50)
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ['stage', 'order']

    def __str__(self):
        return f"{self.stage.name} - {self.name}"


class StageParticipant(models.Model):
    stage = models.ForeignKey(
        Stage, on_delete=models.CASCADE, related_name='participants'
        )
    registration = models.ForeignKey(
        Registration, on_delete=models.CASCADE,
        related_name='stage_entries'
        )
    group = models.ForeignKey(
        StageGroup, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='participants'
        )
    seed = models.PositiveIntegerField(null=True, blank=True)
    # Double elimination: starts in the lower bracket.
    starts_in_lower = models.BooleanField(default=False)

    class Meta:
        ordering = ['stage', 'seed']
        unique_together = ('stage', 'registration')

    def __str__(self):
        return f"{self.registration} in {self.stage}"


class Match(models.Model):
    STATUS_CHOICES = (
        ('scheduled', 'Scheduled'),
        ('live', 'Live'),
        ('completed', 'Completed'),
        ('canceled', 'Canceled'),
    )
    SLOT_CHOICES = ((1, 'Slot 1'), (2, 'Slot 2'))
    stage = models.ForeignKey(
        Stage, on_delete=models.CASCADE, related_name='matches'
        )
    group = models.ForeignKey(
        StageGroup, on_delete=models.CASCADE, null=True, blank=True,
        related_name='matches'
        )
    round = models.PositiveSmallIntegerField(default=1)
    position = models.PositiveSmallIntegerField(default=1)
    label = models.CharField(max_length=100, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    best_of = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='scheduled'
        )
    BRACKET_CHOICES = (
        ('upper', 'Upper bracket'),
        ('lower', 'Lower bracket'),
        ('final', 'Grand final'),
    )
    # Double elimination: bracket the match belongs to.
    bracket = models.CharField(max_length=5, choices=BRACKET_CHOICES,
                               blank=True)
    is_bye = models.BooleanField(default=False)
    winner = models.ForeignKey(
        Registration, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+'
        )
    # Bracket links: where the winner / loser of this match goes.
    next_match = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='winner_feeders'
        )
    next_match_slot = models.PositiveSmallIntegerField(
        null=True, blank=True, choices=SLOT_CHOICES
        )
    loser_next_match = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='loser_feeders'
        )
    loser_next_match_slot = models.PositiveSmallIntegerField(
        null=True, blank=True, choices=SLOT_CHOICES
        )
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['stage__order', 'round', 'position']

    def __str__(self):
        names = [
            p.registration.display_name if p.registration else 'TBD'
            for p in self.participants.all()
            ]
        title = self.label or f"Round {self.round}"
        return f"Match {self.id} - {title} - {' vs '.join(names)}"

    @property
    def can_draw(self):
        """A tie is only possible in leagues with an even best of (e.g. Bo2
        ending 1-1): with Bo1, Bo3, Bo5... there is always a winner."""
        return (
            self.stage.allows_draws
            and self.best_of % 2 == 0
            and not self.next_match_id
        )

    def clean(self):
        if bool(self.next_match_id) != bool(self.next_match_slot):
            raise ValidationError(
                'next_match y next_match_slot van juntos.'
                )
        if bool(self.loser_next_match_id) != bool(
                self.loser_next_match_slot):
            raise ValidationError(
                'loser_next_match y loser_next_match_slot van juntos.'
                )


class MatchParticipant(models.Model):
    match = models.ForeignKey(
        Match, on_delete=models.CASCADE, related_name='participants'
        )
    # Null while the slot is waiting for the winner of a previous match.
    registration = models.ForeignKey(
        Registration, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='match_entries'
        )
    slot = models.PositiveSmallIntegerField(default=1)
    score = models.IntegerField(default=0)
    placement = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['match', 'slot']
        constraints = [
            models.UniqueConstraint(
                fields=['match', 'slot'],
                name='unique_slot_in_match'
            ),
            models.UniqueConstraint(
                fields=['match', 'registration'],
                name='unique_registration_in_match',
                condition=models.Q(registration__isnull=False)
            ),
        ]

    def __str__(self):
        name = self.registration.display_name if self.registration else 'TBD'
        return f"{name} (slot {self.slot})"


class Stream(models.Model):
    PLATFORM_CHOICES = (
        ('twitch', 'Twitch'),
        ('youtube', 'YouTube'),
        ('facebook', 'Facebook'),
        ('kick', 'Kick'),
        ('tiktok', 'TikTok'),
        ('other', 'Other'),
    )
    title = models.CharField(max_length=150)
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    url = models.URLField()
    game = models.ForeignKey(
        Game, on_delete=models.CASCADE, null=True, blank=True,
        related_name='streams'
        )
    match = models.ForeignKey(
        Match, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='streams'
        )
    is_live = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_live', '-created_at']

    def __str__(self):
        return f"{self.get_platform_display()} - {self.title}"


class MediaContent(models.Model):
    MEDIA_TYPES = (
        ('image', 'Image'),
        ('video', 'Video')
    )
    title = models.CharField(max_length=100)
    file = models.FileField(
        upload_to='media_content/',
        validators=[FileExtensionValidator(MEDIA_CONTENT_EXTENSIONS)]
        )
    type = models.CharField(max_length=10, choices=MEDIA_TYPES)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.title


class ContactInfo(models.Model):
    platform = models.CharField(max_length=50)
    link = models.URLField()

    def __str__(self):
        return f"{self.platform}: {self.link}"


WHATSAPP_GROUP_PREFIX = 'https://chat.whatsapp.com/'


def webhook_secret():
    return secrets.token_hex(32)


class Webhook(models.Model):
    """Address that receives a signed POST when something public happens
    in a tournament (a bot that announces it in Discord, for example).
    Another bot is connected by adding its address here, without code."""
    EVENT_CHOICES = (
        ('match.scheduled', 'Match scheduled'),
        ('match.started', 'Match started'),
        ('stream.live', 'Stream live'),
        ('match.result', 'Official result'),
    )
    name = models.CharField(max_length=100)
    url = models.URLField(max_length=500)
    # Shared with the receiver to check the signature of each request.
    secret = models.CharField(max_length=64, default=webhook_secret)
    # Empty: every event.
    events = models.JSONField(default=list, blank=True)
    active = models.BooleanField(default=True)
    last_delivery_at = models.DateTimeField(null=True, blank=True)
    # HTTP status of the last delivery, or why it failed.
    last_status = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def wants(self, event):
        return not self.events or event in self.events


class OrganizerContact(models.Model):
    """How to reach the organizers: a WhatsApp number, a WhatsApp group,
    a phone or an email. Without tournament it is a general contact of the
    event; otherwise it belongs to that tournament."""
    KIND_CHOICES = (
        ('whatsapp', 'WhatsApp'),
        ('whatsapp_group', 'Grupo de WhatsApp'),
        ('phone', 'Teléfono'),
        ('email', 'Correo'),
        ('link', 'Otro link'),
    )
    NUMBERS = ('whatsapp', 'phone')

    tournament = models.ForeignKey(
        'Tournament', on_delete=models.CASCADE, null=True, blank=True,
        related_name='contacts'
        )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    name = models.CharField(max_length=100)
    role = models.CharField(max_length=100, blank=True)
    value = models.CharField(max_length=255)
    active = models.BooleanField(default=True)
    # Group or clan to join: hidden in the site, shown only to whoever
    # finishes the registration form.
    registered_only = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.get_kind_display()}: {self.name}"

    @classmethod
    def join_links(cls, tournament):
        """Links for the players that just registered in the tournament
        (its own and the general ones)."""
        return cls.objects.filter(
            models.Q(tournament=tournament)
            | models.Q(tournament__isnull=True),
            active=True, registered_only=True,
        ).order_by(
            models.F('tournament').desc(nulls_last=True), 'order', 'id'
        )

    def clean(self):
        value, error = normalize_contact(self.kind, self.value)
        if error:
            raise ValidationError({'value': error})
        self.value = value

    @property
    def link(self):
        """Link that opens the contact (chat, call or email)."""
        if self.kind in self.NUMBERS:
            digits = ''.join(ch for ch in self.value if ch.isdigit())
            if len(digits) == 9:
                digits = f'51{digits}'
            if self.kind == 'whatsapp':
                return f'https://wa.me/{digits}'
            return f'tel:+{digits}'
        if self.kind == 'email':
            return f'mailto:{self.value}'
        return self.value


def normalize_contact(kind, value):
    """Returns (clean value, error message or None)."""
    value = (value or '').strip()
    if not value:
        return value, 'Este campo es obligatorio.'
    if kind in OrganizerContact.NUMBERS:
        digits = ''.join(ch for ch in value if ch.isdigit())
        if len(digits) == 9 and digits.startswith('9'):
            return digits, None
        if len(digits) == 11 and digits.startswith('519'):
            return digits[2:], None
        if value.startswith('+') and 8 <= len(digits) <= 15:
            return f'+{digits}', None
        return value, (
            'Escribe un celular de 9 dígitos (o con +código de país).'
        )
    if kind == 'email':
        try:
            validate_email(value)
        except ValidationError:
            return value, 'Escribe un correo válido.'
        return value, None
    try:
        URLValidator()(value)
    except ValidationError:
        return value, 'Escribe un link válido (https://...).'
    if kind == 'whatsapp_group' and \
            not value.startswith(WHATSAPP_GROUP_PREFIX):
        return value, (
            f'El link del grupo empieza con {WHATSAPP_GROUP_PREFIX}'
        )
    return value, None
