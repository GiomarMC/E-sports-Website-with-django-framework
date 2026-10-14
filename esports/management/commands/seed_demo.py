"""Demo data to try the site locally: games, tournaments, teams, stages,
results and streams.

    python manage.py seed_demo            # without images
    python manage.py seed_demo --images   # downloads placeholder images
    python manage.py seed_demo --reset    # deletes games (and everything
                                          # related) before creating them
"""
import random
import urllib.request
from datetime import timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from esports import services
from esports.models import (
    AdminGame, ContactInfo, CustomUser, Game, OrganizerContact,
    PaymentMethod, Registration, RegistrationMember, SiteSettings, Stage,
    Stream, Tournament,
)

# Password of the demo game admins (local development only).
DEMO_ADMIN_PASSWORD = 'demo-admin-2026'

GAMES = [
    {
        'name': 'Dota 2',
        'type_of_game': 'team', 'min_players': 5, 'max_players': 7,
        'description': (
            'MOBA 5 contra 5. Dos equipos se enfrentan para destruir el '
            'Ancient rival en el mapa clásico.'
        ),
        'fee': Decimal('5.00'),
        'teams': [
            'Cóndores del Misti', 'Llamas Furiosas', 'Volcán Esports',
            'Sillar Gaming', 'Pumas de Yanahuara', 'Chachani Five',
            'Rocoto Relleno', 'Los Andinos',
        ],
    },
    {
        'name': 'Brawl Stars',
        'type_of_game': 'team', 'min_players': 3, 'max_players': 4,
        'description': 'Combates 3 contra 3 en modos rotativos.',
        'fee': Decimal('3.00'),
        'teams': [
            'Tormenta Chili', 'Brawlers del Sur', 'Quinoa Squad',
            'Arequipa Bulls', 'Los Ckuchis', 'Cerro Colorado',
        ],
    },
    {
        'name': 'Clash Royale',
        'type_of_game': 'individual', 'min_players': 1, 'max_players': 1,
        'description': 'Duelo 1 contra 1 de cartas en tiempo real.',
        'fee': Decimal('2.00'),
        'teams': [
            'Valeria Quispe', 'Renzo Mamani', 'Lucía Huamán',
            'Diego Apaza', 'Camila Condori', 'Mateo Ccama',
            'Andrea Chávez', 'Sebastián Pari',
        ],
    },
    {
        'name': 'Left 4 Dead 2',
        'type_of_game': 'team', 'min_players': 4, 'max_players': 4,
        'description': (
            'Campañas cooperativas contra la horda. Cada equipo suma '
            'puntos según su desempeño en cada mapa.'
        ),
        'fee': Decimal('4.00'),
        'teams': [
            'Supervivientes UNSA', 'Los Infectados', 'Molotov Club',
            'Última Línea',
        ],
    },
]

NICKS = [
    'Kusi', 'Wayra', 'Inti', 'Pacha', 'Killa', 'Amaru', 'Sumaq', 'Yaku',
    'Rumi', 'Tika', 'Waman', 'Chaska', 'Puma', 'Kuntur', 'Sami', 'Ayar',
]


class Command(BaseCommand):
    help = 'Creates demo data (games, tournaments, teams and results).'

    def add_arguments(self, parser):
        parser.add_argument('--images', action='store_true',
                            help='Download placeholder images.')
        parser.add_argument('--reset', action='store_true',
                            help='Delete existing games first.')

    def handle(self, *args, **options):
        if Game.objects.exists() and not options['reset']:
            raise CommandError(
                'There are games already. Use --reset to replace them.'
            )
        random.seed(2026)
        with transaction.atomic():
            if options['reset']:
                Game.objects.all().delete()
                Stream.objects.all().delete()
            self.seed(options['images'])
        self.stdout.write(self.style.SUCCESS('Demo data created.'))
        self.stdout.write(
            'Game admins: admin_dota2, admin_brawl_stars, ... '
            '(password in esports/management/commands/seed_demo.py)'
        )

    def seed(self, images):
        site = SiteSettings.load()
        site.event_name = 'UNSA Esports'
        site.registration_enabled = True
        site.registration_start = timezone.now() - timedelta(days=7)
        site.registration_end = timezone.now() + timedelta(days=14)
        site.save()
        ContactInfo.objects.get_or_create(
            platform='Instagram', link='https://instagram.com/unsa.esports'
        )

        for index, data in enumerate(GAMES):
            game = Game.objects.create(
                name=data['name'], description=data['description'],
                type_of_game=data['type_of_game'],
                min_players=data['min_players'],
                max_players=data['max_players'],
                rules=(
                    '1. Puntualidad: 10 minutos de tolerancia.\n'
                    '2. Se juega con la última versión del juego.\n'
                    '3. Cualquier reclamo lo resuelve el admin del juego.'
                ),
            )
            if images:
                self.attach_image(game)
            self.create_admin(game)
            self.create_payment_methods(game, index)
            tournament = Tournament.objects.create(
                game=game, name=f"Copa {data['name']} 2026",
                start_date=timezone.now() + timedelta(days=index - 1),
                fee_per_player=data['fee'],
            )
            # Demo data: fake number and group link.
            OrganizerContact.objects.create(
                tournament=tournament, kind='whatsapp',
                name=f"Organizador de {data['name']}", role='Admin del juego',
                value=f'9100000{index:02d}',
            )
            regs = [
                self.create_registration(tournament, name, game)
                for name in data['teams']
            ]
            # One pending registration to review in the admin panel.
            self.create_registration(
                tournament, f"{data['teams'][0]} B", game, status='pending'
            )
            getattr(self, f"format_{index}")(tournament, regs)

        OrganizerContact.objects.create(
            kind='whatsapp_group', name='Comunidad UNSA Esports (demo)',
            value='https://chat.whatsapp.com/DemoEsportsEPCC',
        )
        OrganizerContact.objects.create(
            kind='email', name='Organización', order=1,
            value='esports.demo@example.com',
        )
        Stream.objects.create(
            title='Canal oficial', platform='twitch',
            url='https://www.twitch.tv/unsa_esports', is_live=True,
        )

    def attach_image(self, game):
        seed = game.name.lower().replace(' ', '-')
        url = f'https://picsum.photos/seed/{seed}/1600/900'
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                game.images.save(
                    f'{seed}.jpg', ContentFile(response.read()), save=True
                )
        except OSError as error:
            self.stderr.write(f'Image for {game.name} skipped: {error}')

    def create_payment_methods(self, game, index):
        # Demo data: fake numbers, nobody should pay to them.
        PaymentMethod.objects.create(
            game=game, method='yape', holder_name='Delegación EPCC (demo)',
            phone_number=f'9000000{index:02d}',
            instructions='En el mensaje escribe el nombre del equipo.',
        )
        PaymentMethod.objects.create(
            game=game, method='bank_transfer',
            holder_name='Delegación EPCC (demo)', bank_name='BCP',
            account_number=f'000-0000000{index}-0-00', order=1,
        )

    def create_admin(self, game):
        username = 'admin_' + game.name.lower().replace(' ', '_')
        admin, created = CustomUser.objects.get_or_create(
            username=username, defaults={'role': 'admin'}
        )
        if created:
            admin.set_password(DEMO_ADMIN_PASSWORD)
            admin.save()
        AdminGame.objects.get_or_create(admin=admin, game=game)

    def create_registration(self, tournament, name, game, status='confirmed'):
        players = game.min_players
        if game.max_players > game.min_players:
            players = random.randint(game.min_players, game.max_players)
        team = game.type_of_game == 'team'
        registration = Registration.objects.create(
            tournament=tournament,
            team_name=name if team else '',
            contact_email=f'{random.randint(10000, 99999)}@unsa.edu.pe',
            amount_due=tournament.calculate_fee(players),
            status=status,
        )
        for number in range(players):
            nickname = name.split()[0] if not team else (
                f'{random.choice(NICKS)}{random.randint(1, 99)}'
            )
            RegistrationMember.objects.create(
                registration=registration,
                full_name=name if not team else f'Jugador {number + 1}',
                student_code=f'2026{random.randint(100000, 999999)}',
                nickname=nickname,
                is_captain=number == 0,
            )
        return registration

    def play(self, stage, limit=None):
        played = 0
        for match in stage.matches.filter(is_bye=False).order_by(
                'round', 'position'):
            match.refresh_from_db()
            entries = list(match.participants.all())
            if any(e.registration_id is None for e in entries):
                continue
            if limit is not None and played >= limit:
                break
            if len(entries) > 2:
                services.record_result(match, {
                    e.registration_id: random.randint(0, 40)
                    for e in entries
                })
            else:
                winner = random.choice(entries)
                loser = next(e for e in entries if e is not winner)
                services.record_result(
                    match,
                    {winner.registration_id: 2,
                     loser.registration_id: random.randint(0, 1)},
                )
            played += 1

    def format_0(self, tournament, regs):
        """Dota 2: GSL-like groups and playoffs with third place."""
        groups = Stage.objects.create(
            tournament=tournament, name='Fase de grupos', order=1,
            stage_type='round_robin', number_of_groups=2,
            advance_per_group=2, best_of=3,
        )
        playoffs = Stage.objects.create(
            tournament=tournament, name='Playoffs', order=2,
            stage_type='single_elimination', best_of=3,
            third_place_match=True,
        )
        services.draw_stage(groups)
        services.schedule_stage(
            groups, timezone.now() - timedelta(days=1), 90, parallel=2
        )
        self.play(groups)
        services.draw_stage(playoffs, shuffle=False)
        services.schedule_stage(
            playoffs, timezone.now() + timedelta(hours=2), 120
        )
        self.play(playoffs, limit=1)

    def format_1(self, tournament, regs):
        """Brawl Stars: a single group, results half played."""
        stage = Stage.objects.create(
            tournament=tournament, name='Liga', order=1,
            stage_type='round_robin', best_of=3,
        )
        services.draw_stage(stage)
        services.schedule_stage(stage, timezone.now(), 30, parallel=3)
        self.play(stage, limit=6)

    def format_2(self, tournament, regs):
        """Clash Royale: single elimination, registrations still open."""
        stage = Stage.objects.create(
            tournament=tournament, name='Eliminatoria', order=1,
            stage_type='single_elimination', best_of=3,
        )
        services.draw_stage(stage)
        services.schedule_stage(
            stage, timezone.now() + timedelta(days=1), 20, parallel=4
        )

    def format_3(self, tournament, regs):
        """Left 4 Dead 2: free for all by points, registrations open."""
        stage = Stage.objects.create(
            tournament=tournament, name='Campañas', order=1,
            stage_type='free_for_all', ffa_rounds=3,
        )
        services.draw_stage(stage)
        services.schedule_stage(
            stage, timezone.now() + timedelta(days=2), 60
        )
