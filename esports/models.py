from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError


class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('player', 'Player'),
        ('captain', 'Captain'),
        ('admin', 'Administrator'),
        ('superadmin', 'Super Administrator')
    )
    phone = models.CharField(max_length=20, blank=True)
    nickname = models.CharField(max_length=30)
    role = models.CharField(
        max_length=10, choices=ROLE_CHOICES, default='player'
        )

    def __str__(self):
        return (
            f"{self.first_name} {self.last_name} "
            f"({self.nickname}) - {self.get_role_display()}"
        )

    def is_admin(self):
        return self.role in ['admin', 'superadmin']

    def is_superadmin(self):
        return self.role == 'superadmin'


class Game(models.Model):
    TYPE_CHOICES = (
        ('individual', 'Individual'),
        ('team', 'Team'),
    )
    name = models.CharField(max_length=100)
    description = models.TextField()
    type_of_game = models.CharField(max_length=10, choices=TYPE_CHOICES)
    bases = models.FileField(upload_to='bases/')
    images = models.ImageField(upload_to='games/')
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Team(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
    )
    name = models.CharField(max_length=100)
    logo = models.ImageField(upload_to='logos/')
    captain = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name='captain_of'
        )
    game = models.ForeignKey(Game, on_delete=models.CASCADE)
    voucher = models.FileField(upload_to='vouchers/')
    registration_status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='pending'
        )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    def clean(self):
        qs = Team.objects.filter(
            captain=self.captain,
            game=self.game,
            registration_status='confirmed'
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError(
                "This captain is already registered for this game."
                )


class TeamPlayer(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    team = models.ForeignKey(Team, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.user.nickname} in {self.team.name}"


class IndividualInscription(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
    )
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    game = models.ForeignKey(Game, on_delete=models.CASCADE)
    voucher = models.FileField(upload_to='vouchers/')
    registration_status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='pending'
        )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.nickname} for {self.game.name}"

    def clean(self):
        qs = IndividualInscription.objects.filter(
            user=self.user,
            game=self.game,
            registration_status='confirmed'
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError("User is already registered for this game.")


class Tournament(models.Model):
    STATUS_CHOICES = (
        ('upcoming', 'Upcoming'),
        ('ongoing', 'Ongoing'),
        ('completed', 'Completed'),
    )
    game = models.ForeignKey(Game, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    start_date = models.DateTimeField()
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='upcoming'
        )

    def __str__(self):
        return self.name


class Match(models.Model):
    STATUS_CHOICES = (
        ('programmed', 'Programmed'),
        ('played', 'Played'),
        ('canceled', 'Canceled'),
    )
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE)
    date = models.DateTimeField()
    results = models.CharField(max_length=50, blank=True)
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='programmed'
        )
    round = models.CharField(max_length=50)

    def __str__(self):
        participants = self.participants.all()
        names = [
            p.team.name if p.team else p.user.nickname for p in participants
            ]
        return f"Match {self.id} - {self.round} - {' vs '.join(names)}"


class MatchParticipant(models.Model):
    match = models.ForeignKey(
        Match, on_delete=models.CASCADE, related_name='participants'
        )
    team = models.ForeignKey(
        Team, on_delete=models.CASCADE, null=True, blank=True
        )
    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, null=True, blank=True
        )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['match', 'team'],
                name='unique_team_in_match',
                condition=models.Q(team__isnull=False)
            ),
            models.UniqueConstraint(
                fields=['match', 'user'],
                name='unique_user_in_match',
                condition=models.Q(user__isnull=False)
            )
        ]

    def clean(self):
        if self.team and self.user:
            raise ValidationError(
                "A match participant cannot be both a team and a user."
                )
        if not self.team and not self.user:
            raise ValidationError(
                "A match participant must be either a team or a user."
            )

    def __str__(self):
        return self.team.name if self.team else self.user.nickname


class Transmission(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE)
    platform = models.CharField(max_length=50)
    url = models.URLField()

    def __str__(self):
        return f"{self.platform} - {self.match}"


class MediaContent(models.Model):
    MEDIA_TYPES = (
        ('image', 'Image'),
        ('video', 'Video')
    )
    tittle = models.CharField(max_length=100)
    file = models.FileField(upload_to='media_content/')
    type = models.CharField(max_length=10, choices=MEDIA_TYPES)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.tittle


class ContactInfo(models.Model):
    platform = models.CharField(max_length=50)
    link = models.URLField()

    def __str__(self):
        return f"{self.platform}: {self.link}"
