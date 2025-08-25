from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework import viewsets, status
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from esports.models import Game
from esports.serializers import (
    AdminLoginSerializer, ChangePasswordSerializer, ResetPasswordSerializer,
    AdminListSerializer, AdminCreateSerializer, GamePublicSerializer,
    GameCreateUpdateSerializer
)
from esports.permissions import IsAdminOrSuperAdmin, IsSuperAdmin


User = get_user_model()


class AdminViewSet(viewsets.ViewSet):
    permission_classes_by_action = {
        'change_password': [IsAdminOrSuperAdmin],
        'reset_password': [IsSuperAdmin],
        'list': [IsSuperAdmin],
        'create': [IsSuperAdmin],
        'destroy': [IsSuperAdmin]
    }

    def get_permissions(self):
        try:
            return [
                permission()
                for permission in
                self.permission_classes_by_action[self.action]]
        except KeyError:
            return []

    @action(detail=False, methods=['post'], url_path='login')
    def login(self, request):
        serializer = AdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)

        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token)
        }, status=status.HTTP_200_OK)

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

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = User.objects.get(pk=pk, role__in=['admin', 'superadmin'])
        except User.DoesNotExist:
            return Response({
                "error": "Admin not found."
            }, status=status.HTTP_404_NOT_FOUND)

        new_password = serializer.validated_data['new_password']
        user.set_password(new_password)
        user.save()

        return Response({
            "message": "Password reset successfully."
        }, status=status.HTTP_200_OK)

    def list(self, request):
        users = User.objects.filter(role__in=['admin', 'superadmin'])
        serializer = AdminListSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request):
        serializer = AdminCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()
        return Response({
            "message": "Admin created successfully.",
            "admin": AdminListSerializer(user).data
        }, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        user = get_object_or_404(User, pk=pk, role__in=['admin', 'superadmin'])

        if user.id == request.user.id:
            return Response({
                "error": "You cannot delete your own account."
            }, status=status.HTTP_403_FORBIDDEN)

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameViewSet(viewsets.ViewSet):
    permission_classes_by_action = {
        'list': [],
        'retrieve': [],
        'create': [IsSuperAdmin],
        'update': [IsSuperAdmin],
        'partial_update': [IsAdminOrSuperAdmin],
        'destroy': [IsSuperAdmin],
        'activate': [IsSuperAdmin],
        'deactivate': [IsSuperAdmin],
    }

    def get_permissions(self):
        try:
            return [permission()
                    for permission in
                    self.permission_classes_by_action[self.action]]
        except KeyError:
            return [IsAuthenticated()]

    def list(self, request):
        games = Game.objects.all()
        serializer = GamePublicSerializer(games, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        game = get_object_or_404(Game, pk=pk)
        serializer = GamePublicSerializer(game)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request):
        serializer = GameCreateUpdateSerializer(data=request.data,
                                                context={'request': request})
        serializer.is_valid(raise_exception=True)
        game = serializer.save()
        return Response(GamePublicSerializer(game).data,
                        status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        game = get_object_or_404(Game, pk=pk)
        serializer = GameCreateUpdateSerializer(instance=game,
                                                data=request.data,
                                                context={'request': request})
        serializer.is_valid(raise_exception=True)
        game = serializer.save()
        return Response(GamePublicSerializer(game).data,
                        status=status.HTTP_200_OK)

    def partial_update(self, request, pk=None):
        game = get_object_or_404(Game, pk=pk)
        serializer = GameCreateUpdateSerializer(instance=game,
                                                data=request.data,
                                                partial=True,
                                                context={'request': request})
        serializer.is_valid(raise_exception=True)
        game = serializer.save()
        return Response(GamePublicSerializer(game).data,
                        status=status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        if not request.user.is_superadmin():
            return Response({
                "error": "Permission denied."
            }, status=status.HTTP_403_FORBIDDEN)

        game = get_object_or_404(Game, pk=pk)
        game.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        game = get_object_or_404(Game, pk=pk)
        game.active = True
        game.save()
        return Response({"message": "Game activated successfully."},
                        status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        game = get_object_or_404(Game, pk=pk)
        game.active = False
        game.save()
        return Response({"message": "Game deactivated successfully."},
                        status=status.HTTP_200_OK)
