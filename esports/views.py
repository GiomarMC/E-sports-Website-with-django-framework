import uuid
from collections import defaultdict

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from esports import services
from esports.models import (
    AdminGame, ContactInfo, Game, Match, MediaContent, Registration,
    SiteSettings, Stage, Stream, Tournament,
)
from esports.permissions import (
    IsAdminOrSuperAdmin, IsGameAdmin, IsSuperAdmin, ReadOnlyOrSuperAdmin,
    game_of, is_admin_user,
)
from esports.serializers import (
    AdminCreateSerializer, AdminListSerializer, AdminLoginSerializer,
    AdminUpdateSerializer, AssignGamesSerializer, ChangePasswordSerializer,
    ContactInfoSerializer, DrawSerializer, GameCreateUpdateSerializer,
    GamePublicSerializer, GroupStandingsSerializer, MatchSerializer,
    MediaContentSerializer, PublicRegistrationSerializer, RejectSerializer,
    RegistrationCreateSerializer, RegistrationSerializer,
    RegistrationStatusSerializer, ResetPasswordSerializer, ResultSerializer,
    ScheduleSerializer, SiteSettingsSerializer, StageDetailSerializer,
    StageSerializer, StreamSerializer, TournamentSerializer,
)


User = get_user_model()

PUBLIC = 'public'


class ActionPermissionMixin:
    """Maps each action to its permission classes. ``PUBLIC`` means no
    permission at all; unknown actions fall back to ``default_permissions``.
    """
    permission_classes_by_action = {}
    default_permissions = [IsAdminOrSuperAdmin]

    def get_permissions(self):
        permissions = self.permission_classes_by_action.get(
            self.action, self.default_permissions
        )
        if permissions == PUBLIC:
            return []
        return [permission() for permission in permissions]


def check_game_permission(user, game):
    if not user.can_manage_game(game):
        raise PermissionDenied('You are not an administrator of this game.')


def run_service(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except services.TournamentError as error:
        raise ValidationError({'detail': str(error)})


def query_flag(request, name):
    value = request.query_params.get(name)
    if value is None:
        return None
    return value.lower() in ['1', 'true', 'yes']


# --------------------------------------------------------------- admins

class AdminViewSet(ActionPermissionMixin, viewsets.ViewSet):
    permission_classes_by_action = {
        'login': PUBLIC,
        'me': [IsAdminOrSuperAdmin],
        'change_password': [IsAdminOrSuperAdmin],
        'reset_password': [IsSuperAdmin],
        'list': [IsSuperAdmin],
        'retrieve': [IsSuperAdmin],
        'create': [IsSuperAdmin],
        'partial_update': [IsSuperAdmin],
        'destroy': [IsSuperAdmin],
        'games': [IsSuperAdmin],
    }

    def get_admin(self, pk):
        return get_object_or_404(
            User, pk=pk, role__in=['admin', 'superadmin']
        )

    @swagger_auto_schema(request_body=AdminLoginSerializer)
    @action(detail=False, methods=['post'], url_path='login')
    def login(self, request):
        serializer = AdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)

        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'admin': AdminListSerializer(user).data,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        return Response(AdminListSerializer(request.user).data)

    @swagger_auto_schema(request_body=ChangePasswordSerializer)
    @action(detail=False, methods=['post'], url_path='change-password')
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        old_password = serializer.validated_data['old_password']
        new_password = serializer.validated_data['new_password']

        if not user.check_password(old_password):
            return Response({
                "error": "Old password is incorrect."
            }, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        return Response({
            "message": "Password updated successfully."
        }, status=status.HTTP_200_OK)

    @swagger_auto_schema(request_body=ResetPasswordSerializer)
    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = self.get_admin(pk)
        user.set_password(serializer.validated_data['new_password'])
        user.save()

        return Response({
            "message": "Password reset successfully."
        }, status=status.HTTP_200_OK)

    def list(self, request):
        users = User.objects.filter(role__in=['admin', 'superadmin'])
        serializer = AdminListSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        return Response(AdminListSerializer(self.get_admin(pk)).data)

    @swagger_auto_schema(request_body=AdminCreateSerializer)
    def create(self, request):
        serializer = AdminCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()
        return Response({
            "message": "Admin created successfully.",
            "admin": AdminListSerializer(user).data
        }, status=status.HTTP_201_CREATED)

    @swagger_auto_schema(request_body=AdminUpdateSerializer)
    def partial_update(self, request, pk=None):
        user = self.get_admin(pk)
        serializer = AdminUpdateSerializer(
            user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        if user.id == request.user.id and \
                serializer.validated_data.get('role', user.role) != user.role:
            raise PermissionDenied('You cannot change your own role.')
        serializer.save()
        return Response(AdminListSerializer(user).data)

    def destroy(self, request, pk=None):
        user = self.get_admin(pk)

        if user.id == request.user.id:
            return Response({
                "error": "You cannot delete your own account."
            }, status=status.HTTP_403_FORBIDDEN)

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @swagger_auto_schema(request_body=AssignGamesSerializer)
    @action(detail=True, methods=['put'], url_path='games')
    def games(self, request, pk=None):
        """Replaces the games managed by a game admin."""
        user = self.get_admin(pk)
        if user.role != 'admin':
            return Response({
                "error": "Superadmins already manage every game."
            }, status=status.HTTP_400_BAD_REQUEST)
        serializer = AssignGamesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            AdminGame.objects.filter(admin=user).delete()
            AdminGame.objects.bulk_create([
                AdminGame(admin=user, game=game)
                for game in serializer.validated_data['game_ids']
            ])
        return Response(AdminListSerializer(user).data)


# ------------------------------------------------------------- settings

class SiteSettingsView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return []
        return [IsSuperAdmin()]

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)

    @swagger_auto_schema(request_body=SiteSettingsSerializer)
    def patch(self, request):
        serializer = SiteSettingsSerializer(
            SiteSettings.load(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------- games

class GameViewSet(ActionPermissionMixin, viewsets.ModelViewSet):
    permission_classes_by_action = {
        'list': PUBLIC,
        'retrieve': PUBLIC,
        'create': [IsSuperAdmin],
        'update': [IsGameAdmin],
        'partial_update': [IsGameAdmin],
        'destroy': [IsSuperAdmin],
        'activate': [IsSuperAdmin],
        'deactivate': [IsSuperAdmin],
    }
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        games = Game.objects.prefetch_related('tournaments')
        if is_admin_user(self.request.user):
            return games
        return games.filter(active=True)

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return GameCreateUpdateSerializer
        return GamePublicSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        game = serializer.save()
        return Response(
            GamePublicSerializer(game, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        game = self.get_object()
        serializer = self.get_serializer(
            game, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        game = serializer.save()
        return Response(
            GamePublicSerializer(game, context={'request': request}).data
        )

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        game = self.get_object()
        game.active = True
        game.save(update_fields=['active'])
        return Response({"message": "Game activated successfully."},
                        status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        game = self.get_object()
        game.active = False
        game.save(update_fields=['active'])
        return Response({"message": "Game deactivated successfully."},
                        status=status.HTTP_200_OK)


# ---------------------------------------------------------- tournaments

class TournamentViewSet(ActionPermissionMixin, viewsets.ModelViewSet):
    serializer_class = TournamentSerializer
    permission_classes_by_action = {
        'list': PUBLIC,
        'retrieve': PUBLIC,
        'quote': PUBLIC,
        'register': PUBLIC,
        'participants': PUBLIC,
        'schedule': PUBLIC,
        'create': [IsGameAdmin],
        'update': [IsGameAdmin],
        'partial_update': [IsGameAdmin],
        'destroy': [IsGameAdmin],
        'open_registration': [IsGameAdmin],
        'close_registration': [IsGameAdmin],
    }

    def get_queryset(self):
        tournaments = Tournament.objects.select_related(
            'game'
        ).prefetch_related('stages')
        if not is_admin_user(self.request.user):
            tournaments = tournaments.filter(game__active=True)
        params = self.request.query_params
        if params.get('game'):
            tournaments = tournaments.filter(game_id=params['game'])
        if params.get('status'):
            tournaments = tournaments.filter(status=params['status'])
        return tournaments

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['site_settings'] = SiteSettings.load()
        return context

    def perform_create(self, serializer):
        check_game_permission(
            self.request.user, serializer.validated_data['game']
        )
        serializer.save()

    @swagger_auto_schema(manual_parameters=[openapi.Parameter(
        'players', openapi.IN_QUERY, type=openapi.TYPE_INTEGER,
        description='Number of players to register'
    )])
    @action(detail=True, methods=['get'])
    def quote(self, request, pk=None):
        """Registration fee for a number of players."""
        tournament = self.get_object()
        game = tournament.game
        try:
            players = int(request.query_params.get(
                'players', game.min_players
            ))
        except ValueError:
            raise ValidationError({'players': 'Must be a number.'})
        if not game.min_players <= players <= game.max_players:
            raise ValidationError({'players': (
                f"Must be between {game.min_players} and "
                f"{game.max_players}."
            )})
        return Response({
            'players': players,
            'fee_per_player': str(tournament.fee_per_player),
            'total': str(tournament.calculate_fee(players)),
            'currency': settings.CURRENCY,
        })

    @swagger_auto_schema(request_body=RegistrationCreateSerializer)
    @action(
        detail=True, methods=['post'],
        parser_classes=[MultiPartParser, FormParser, JSONParser]
    )
    def register(self, request, pk=None):
        """Public registration form. Multipart: send ``members`` as a JSON
        string, plus the ``voucher`` (and optional ``logo``) files."""
        tournament = self.get_object()
        serializer = RegistrationCreateSerializer(
            data=request.data,
            context={'request': request, 'tournament': tournament}
        )
        serializer.is_valid(raise_exception=True)
        registration = serializer.save()
        return Response({
            'message': 'Registration received. It will be reviewed by the '
                       'administrators.',
            'code': registration.code,
            'amount_due': str(registration.amount_due),
            'status': registration.status,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def participants(self, request, pk=None):
        """Confirmed and enabled participants."""
        tournament = self.get_object()
        registrations = services.eligible_registrations(
            tournament
        ).prefetch_related('members')
        return Response(PublicRegistrationSerializer(
            registrations, many=True, context={'request': request}
        ).data)

    @action(detail=True, methods=['get'])
    def schedule(self, request, pk=None):
        """All the matches of the tournament ordered by date."""
        tournament = self.get_object()
        matches = match_queryset().filter(
            stage__tournament=tournament
        ).order_by(
            'scheduled_at', 'stage__order', 'round', 'position'
        ).exclude(is_bye=True)
        return Response(MatchSerializer(
            matches, many=True, context={'request': request}
        ).data)

    @action(detail=True, methods=['post'], url_path='open-registration')
    def open_registration(self, request, pk=None):
        return self.set_registration(True)

    @action(detail=True, methods=['post'], url_path='close-registration')
    def close_registration(self, request, pk=None):
        return self.set_registration(False)

    def set_registration(self, enabled):
        tournament = self.get_object()
        tournament.registration_enabled = enabled
        tournament.save(update_fields=['registration_enabled'])
        return Response(self.get_serializer(tournament).data)


# -------------------------------------------------------- registrations

class RegistrationViewSet(ActionPermissionMixin,
                          mixins.ListModelMixin,
                          mixins.RetrieveModelMixin,
                          mixins.UpdateModelMixin,
                          mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    """Registrations management (game admins). New registrations are created
    with ``POST /tournaments/{id}/register/``."""
    serializer_class = RegistrationSerializer
    default_permissions = [IsGameAdmin]
    permission_classes_by_action = {'check_status': PUBLIC}
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        registrations = Registration.objects.select_related(
            'tournament__game', 'reviewed_by'
        ).prefetch_related('members')
        user = self.request.user
        if getattr(self, 'swagger_fake_view', False) or \
                not is_admin_user(user):
            return Registration.objects.none()
        if not user.is_superadmin():
            registrations = registrations.filter(
                tournament__game__in=user.managed_games()
            )
        params = self.request.query_params
        for param, lookup in [('tournament', 'tournament_id'),
                              ('game', 'tournament__game_id'),
                              ('status', 'status')]:
            if params.get(param):
                registrations = registrations.filter(
                    **{lookup: params[param]}
                )
        active = query_flag(self.request, 'is_active')
        if active is not None:
            registrations = registrations.filter(is_active=active)
        if params.get('search'):
            term = params['search']
            registrations = registrations.filter(
                Q(team_name__icontains=term)
                | Q(members__nickname__icontains=term)
                | Q(members__student_code__icontains=term)
                | Q(members__full_name__icontains=term)
            ).distinct()
        return registrations

    @action(
        detail=False, methods=['get'],
        url_path=r'status/(?P<code>[0-9a-fA-F-]+)'
    )
    def check_status(self, request, code=None):
        """Public: status of a registration by its code."""
        try:
            code = uuid.UUID(code)
        except ValueError:
            raise ValidationError({'code': 'Invalid code.'})
        registration = get_object_or_404(
            Registration.objects.select_related('tournament'), code=code
        )
        return Response(RegistrationStatusSerializer(registration).data)

    def review(self, registration, new_status, reason=''):
        registration.status = new_status
        registration.rejection_reason = reason
        registration.reviewed_at = timezone.now()
        registration.reviewed_by = self.request.user
        registration.save(update_fields=[
            'status', 'rejection_reason', 'reviewed_at', 'reviewed_by'
        ])
        return Response(self.get_serializer(registration).data)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        return self.review(self.get_object(), 'confirmed')

    @swagger_auto_schema(request_body=RejectSerializer)
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self.review(
            self.get_object(), 'rejected',
            serializer.validated_data.get('reason', '')
        )

    @action(detail=True, methods=['post'])
    def enable(self, request, pk=None):
        return self.set_active(True)

    @action(detail=True, methods=['post'])
    def disable(self, request, pk=None):
        return self.set_active(False)

    def set_active(self, value):
        registration = self.get_object()
        registration.is_active = value
        registration.save(update_fields=['is_active'])
        return Response(self.get_serializer(registration).data)


# --------------------------------------------------------------- stages

class StageViewSet(ActionPermissionMixin, viewsets.ModelViewSet):
    permission_classes_by_action = {
        'list': PUBLIC,
        'retrieve': PUBLIC,
        'standings': PUBLIC,
        'bracket': PUBLIC,
    }
    default_permissions = [IsGameAdmin]

    def get_queryset(self):
        stages = Stage.objects.select_related('tournament__game')
        if not is_admin_user(self.request.user):
            stages = stages.filter(tournament__game__active=True)
        tournament = self.request.query_params.get('tournament')
        if tournament:
            stages = stages.filter(tournament_id=tournament)
        if self.action == 'retrieve':
            stages = stages.prefetch_related(
                'groups__participants__registration__members'
            )
        return stages

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return StageDetailSerializer
        return StageSerializer

    def perform_create(self, serializer):
        check_game_permission(
            self.request.user, serializer.validated_data['tournament'].game
        )
        serializer.save()

    @swagger_auto_schema(request_body=DrawSerializer)
    @action(detail=True, methods=['post'])
    def draw(self, request, pk=None):
        """Draw (sorteo): assigns participants and generates the matches.
        It can be repeated while there are no results."""
        stage = self.get_object()
        serializer = DrawSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stage = run_service(
            services.draw_stage, stage,
            serializer.validated_data.get('registration_ids') or None,
            serializer.validated_data['shuffle'],
        )
        return Response(
            StageDetailSerializer(stage, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def reset(self, request, pk=None):
        """Deletes groups, participants, matches and results of the stage."""
        stage = self.get_object()
        run_service(services.reset_stage, stage)
        return Response(StageSerializer(stage).data)

    @swagger_auto_schema(request_body=ScheduleSerializer)
    @action(detail=True, methods=['post'], url_path='auto-schedule')
    def auto_schedule(self, request, pk=None):
        """Assigns date and time to the matches of the stage."""
        stage = self.get_object()
        serializer = ScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        count = run_service(
            services.schedule_stage, stage, **serializer.validated_data
        )
        return Response({'scheduled_matches': count})

    @swagger_auto_schema(responses={200: GroupStandingsSerializer(many=True)})
    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        stage = self.get_object()
        return Response(GroupStandingsSerializer(
            services.stage_standings(stage), many=True,
            context={'request': request}
        ).data)

    @action(detail=True, methods=['get'])
    def bracket(self, request, pk=None):
        """Matches of the stage grouped by group and round."""
        stage = self.get_object()
        matches = match_queryset().filter(stage=stage)
        sections = defaultdict(lambda: defaultdict(list))
        data = MatchSerializer(
            matches, many=True, context={'request': request}
        ).data
        for match in data:
            sections[match['group_name']][match['round']].append(match)
        return Response([
            {
                'group': group,
                'rounds': [
                    {'round': number, 'matches': items}
                    for number, items in sorted(rounds.items())
                ],
            }
            for group, rounds in sections.items()
        ])


# -------------------------------------------------------------- matches

def match_queryset():
    return Match.objects.select_related(
        'stage__tournament', 'group'
    ).prefetch_related('participants__registration__members', 'streams')


class MatchViewSet(ActionPermissionMixin, viewsets.ModelViewSet):
    serializer_class = MatchSerializer
    permission_classes_by_action = {
        'list': PUBLIC,
        'retrieve': PUBLIC,
    }
    default_permissions = [IsGameAdmin]

    def get_queryset(self):
        matches = match_queryset()
        if not is_admin_user(self.request.user):
            matches = matches.filter(stage__tournament__game__active=True)
        params = self.request.query_params
        for param, lookup in [('tournament', 'stage__tournament_id'),
                              ('game', 'stage__tournament__game_id'),
                              ('stage', 'stage_id'),
                              ('group', 'group_id'),
                              ('round', 'round'),
                              ('status', 'status')]:
            if params.get(param):
                matches = matches.filter(**{lookup: params[param]})
        if params.get('date'):
            day = parse_date(params['date'])
            if day is None:
                raise ValidationError({'date': 'Use YYYY-MM-DD.'})
            matches = matches.filter(scheduled_at__date=day)
        for param, lookup in [('from', 'scheduled_at__gte'),
                              ('to', 'scheduled_at__lte')]:
            if params.get(param):
                value = parse_datetime(params[param])
                if value is None:
                    raise ValidationError(
                        {param: 'Use an ISO 8601 date time.'}
                    )
                matches = matches.filter(**{lookup: value})
        if query_flag(self.request, 'upcoming'):
            matches = matches.filter(
                scheduled_at__gte=timezone.now(),
                status__in=['scheduled', 'live'],
            ).order_by('scheduled_at')
        if query_flag(self.request, 'hide_byes') is not False:
            matches = matches.exclude(is_bye=True)
        return matches

    def perform_create(self, serializer):
        check_game_permission(
            self.request.user,
            serializer.validated_data['stage'].tournament.game
        )
        serializer.save()

    def perform_destroy(self, instance):
        if instance.status == 'completed' and not instance.is_bye:
            raise ValidationError(
                {'detail': 'Reset the result before deleting the match.'}
            )
        instance.delete()

    @swagger_auto_schema(request_body=ResultSerializer)
    @action(detail=True, methods=['post'])
    def result(self, request, pk=None):
        """The admin defines the winner (scores optional). The winner
        advances and the loser is eliminated (or goes to its
        ``loser_next_match``). It can be corrected while the next match has
        not been played."""
        match = self.get_object()
        serializer = ResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        scores = serializer.validated_data.get('scores', [])
        placements = {
            s['registration']: s['placement']
            for s in scores if 'placement' in s
        }
        run_service(
            services.record_result, match,
            {s['registration']: s['score'] for s in scores} or None,
            winner_id=serializer.validated_data.get('winner'),
            placements=placements or None,
        )
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=['post'], url_path='reset-result')
    def reset_result(self, request, pk=None):
        match = self.get_object()
        run_service(services.reset_result, match)
        return Response(self.get_serializer(self.get_object()).data)


# -------------------------------------------------------------- streams

class StreamViewSet(ActionPermissionMixin, viewsets.ModelViewSet):
    serializer_class = StreamSerializer
    permission_classes_by_action = {
        'list': PUBLIC,
        'retrieve': PUBLIC,
    }
    default_permissions = [IsGameAdmin]

    def get_queryset(self):
        streams = Stream.objects.select_related(
            'game', 'match__stage__tournament__game'
        )
        params = self.request.query_params
        live = query_flag(self.request, 'live')
        if live is not None:
            streams = streams.filter(is_live=live)
        if params.get('game'):
            streams = streams.filter(
                Q(game_id=params['game'])
                | Q(match__stage__tournament__game_id=params['game'])
            )
        if params.get('match'):
            streams = streams.filter(match_id=params['match'])
        return streams

    def check_stream_game(self, serializer):
        data = serializer.validated_data
        instance = serializer.instance
        game = data.get('game', getattr(instance, 'game', None))
        match = data.get('match', getattr(instance, 'match', None))
        if game is None and match is not None:
            game = game_of(match)
        if game is not None and match is not None and \
                game_of(match) != game:
            raise ValidationError(
                {'match': 'The match does not belong to the game.'}
            )
        check_game_permission(self.request.user, game)

    def perform_create(self, serializer):
        self.check_stream_game(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self.check_stream_game(serializer)
        serializer.save()


# ----------------------------------------------------------------- misc

class MediaContentViewSet(viewsets.ModelViewSet):
    queryset = MediaContent.objects.all()
    serializer_class = MediaContentSerializer
    permission_classes = [ReadOnlyOrSuperAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]


class ContactInfoViewSet(viewsets.ModelViewSet):
    queryset = ContactInfo.objects.all()
    serializer_class = ContactInfoSerializer
    permission_classes = [ReadOnlyOrSuperAdmin]
