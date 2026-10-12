import uuid
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models
from django.utils import timezone


IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
VOUCHER_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']


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
    registration_enabled = models.BooleanField(default=True)
    registration_start = models.DateTimeField(null=True, blank=True)
    registration_end = models.DateTimeField(null=True, blank=True)
    main_stream_url = models.URLField(blank=True)

    class Meta:
        verbose_name = 'Site settings'
        verbose_name_plural = 'Site settings'

    def __str__(self):
        return self.event_name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def clean(self):
        validate_date_range(self.registration_start, self.registration_end)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


def validate_date_range(start, end):
    if start and end and start >= end:
        raise ValidationError(
            {'registration_end': 'End date must be after start date.'}
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
                'Individual games must have exactly 1 player.'
                )
    elif type_of_game == 'team':
        if min_players < 2:
            errors['min_players'] = 'Team games need at least 2 players.'
        elif max_players < min_players:
            errors['max_players'] = (
                'Max players must be greater or equal than min players.'
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
    # When empty, the global dates from SiteSettings are used.
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

    def registration_window(self, site_settings=None):
        site = site_settings or SiteSettings.load()
        start = self.registration_start or site.registration_start
        end = self.registration_end or site.registration_end
        return start, end

    def active_registrations(self):
        return self.registrations.exclude(status='rejected')

    def registration_state(self, site_settings=None):
        """Returns (is_open, reason)."""
        site = site_settings or SiteSettings.load()
        if not self.game.active:
            return False, 'The game is not active.'
        if self.status != 'upcoming':
            return False, 'The tournament is not accepting registrations.'
        if not site.registration_enabled:
            return False, 'Registrations are globally disabled.'
        if not self.registration_enabled:
            return False, 'Registrations are disabled for this tournament.'
        start, end = self.registration_window(site)
        now = timezone.now()
        if start and now < start:
            return False, 'Registrations have not started yet.'
        if end and now > end:
            return False, 'Registrations are closed.'
        if (self.max_registrations is not None
                and self.active_registrations().count()
                >= self.max_registrations):
            return False, 'There are no slots available.'
        return True, 'Registrations are open.'

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
        upload_to='vouchers/', blank=True,
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
    number_of_groups = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
        )
    # How many participants of each group qualify to the next stage.
    advance_per_group = models.PositiveSmallIntegerField(default=0)
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

    def clean(self):
        if bool(self.next_match_id) != bool(self.next_match_slot):
            raise ValidationError(
                'next_match and next_match_slot must be set together.'
                )
        if bool(self.loser_next_match_id) != bool(
                self.loser_next_match_slot):
            raise ValidationError(
                'loser_next_match and loser_next_match_slot must be set '
                'together.'
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
    file = models.FileField(upload_to='media_content/')
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
