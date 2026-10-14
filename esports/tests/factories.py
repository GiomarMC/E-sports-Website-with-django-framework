import io
from datetime import timedelta
from decimal import Decimal

import factory
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from faker import Faker
from PIL import Image

from esports.models import (
    AdminGame, CustomUser, Game, OrganizerContact, PaymentMethod,
    Registration, RegistrationMember, SiteSettings, Stage, Stream,
    Tournament,
)


fake = Faker()

DEFAULT_PASSWORD = 'testpass123'


def pdf_file(name='bases.pdf'):
    return SimpleUploadedFile(
        name, b'%PDF-1.4 test', content_type='application/pdf'
    )


def image_file(name='image.png'):
    buffer = io.BytesIO()
    Image.new('RGB', (1, 1)).save(buffer, format='PNG')
    return SimpleUploadedFile(
        name, buffer.getvalue(), content_type='image/png'
    )


class AdminUserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = CustomUser
        skip_postgeneration_save = True

    username = factory.Sequence(lambda n: f"admin_{n}")
    email = factory.LazyFunction(lambda: fake.email())
    first_name = factory.LazyFunction(lambda: fake.first_name())
    last_name = factory.LazyFunction(lambda: fake.last_name())
    role = 'admin'

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        self.set_password(extracted or DEFAULT_PASSWORD)
        if create:
            self.save()


class SuperAdminFactory(AdminUserFactory):
    username = factory.Sequence(lambda n: f"superadmin_{n}")
    role = 'superadmin'


class GameFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Game

    name = factory.Sequence(lambda n: f"Game {n}")
    description = factory.LazyFunction(lambda: fake.sentence())
    type_of_game = 'team'
    min_players = 5
    max_players = 7
    active = True


class IndividualGameFactory(GameFactory):
    type_of_game = 'individual'
    min_players = 1
    max_players = 1


class AdminGameFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = AdminGame

    admin = factory.SubFactory(AdminUserFactory)
    game = factory.SubFactory(GameFactory)


class PaymentMethodFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PaymentMethod

    game = factory.SubFactory(GameFactory)
    method = 'yape'
    holder_name = factory.LazyFunction(lambda: fake.name())
    phone_number = factory.Sequence(lambda n: f"9{n:08d}")


class OrganizerContactFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = OrganizerContact

    tournament = factory.SubFactory(
        'esports.tests.factories.TournamentFactory'
    )
    kind = 'whatsapp'
    name = factory.LazyFunction(lambda: fake.name())
    value = factory.Sequence(lambda n: f"9{n:08d}")


class SiteSettingsFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = SiteSettings
        django_get_or_create = ('id',)

    id = 1
    event_name = 'Esports Test'
    registration_enabled = True


class TournamentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Tournament

    game = factory.SubFactory(GameFactory)
    name = factory.Sequence(lambda n: f"Tournament {n}")
    start_date = factory.LazyFunction(
        lambda: timezone.now() + timedelta(days=30)
    )
    fee_per_player = Decimal('5.00')
    registration_enabled = True


class RegistrationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Registration

    tournament = factory.SubFactory(TournamentFactory)
    team_name = factory.Sequence(lambda n: f"Team {n}")
    contact_email = factory.LazyFunction(lambda: fake.email())
    status = 'confirmed'
    amount_due = Decimal('25.00')


class RegistrationMemberFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = RegistrationMember

    registration = factory.SubFactory(RegistrationFactory)
    full_name = factory.LazyFunction(lambda: fake.name())
    student_code = factory.Sequence(lambda n: f"2026{n:06d}")
    nickname = factory.Sequence(lambda n: f"player{n}")
    is_captain = False


class StageFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Stage

    tournament = factory.SubFactory(TournamentFactory)
    name = factory.Sequence(lambda n: f"Stage {n}")
    order = 1
    stage_type = 'single_elimination'


class StreamFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Stream

    title = factory.Sequence(lambda n: f"Stream {n}")
    platform = 'twitch'
    url = factory.Sequence(lambda n: f"https://twitch.tv/channel{n}")
    game = factory.SubFactory(GameFactory)


def confirmed_registrations(tournament, count, **kwargs):
    """Creates ``count`` confirmed registrations with a captain each."""
    registrations = []
    for _ in range(count):
        registration = RegistrationFactory(tournament=tournament, **kwargs)
        RegistrationMemberFactory(
            registration=registration, is_captain=True
        )
        registrations.append(registration)
    return registrations


def member_payload(count, captain_index=0, prefix='2026'):
    return [
        {
            'full_name': fake.name(),
            'student_code': f"{prefix}{index:04d}",
            'nickname': f"nick{prefix}{index}",
            'game_account_id': f"id{prefix}{index}",
            'is_captain': index == captain_index,
        }
        for index in range(count)
    ]
