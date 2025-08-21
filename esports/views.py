from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework import viewsets, status
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from esports.serializers import (
    AdminLoginSerializer, ChangePasswordSerializer, ResetPasswordSerializer,
    AdminListSerializer, AdminCreateSerializer
    )
from esports.permissions import IsAdminOrSuperAdmin, IsSuperAdmin


User = get_user_model()


class AdminViewSet(viewsets.ViewSet):

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

    @action(detail=False, methods=['post'], url_path='change-password',
            permission_classes=[IsAdminOrSuperAdmin])
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

    @action(detail=True, methods=['post'], url_path='reset-password',
            permission_classes=[IsSuperAdmin])
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

    @action(detail=False, methods=['get'], url_path='list-admins',
            permission_classes=[IsSuperAdmin])
    def list_admins(self, request):
        users = User.objects.filter(role__in=['admin', 'superadmin'])
        serializer = AdminListSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='create-admin',
            permission_classes=[IsSuperAdmin])
    def create_admin(self, request):
        serializer = AdminCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()
        return Response({
            "message": "Admin created successfully.",
            "admin": AdminListSerializer(user).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['delete'], url_path='delete-admin',
            permission_classes=[IsSuperAdmin])
    def delete_admin(self, request, pk=None):
        try:
            user = User.objects.get(pk=pk, role__in=['admin', 'superadmin'])
        except User.DoesNotExist:
            return Response({
                "error": "Admin not found."
            }, status=status.HTTP_404_NOT_FOUND)

        user.delete()
        return Response({
            "message": "Admin deleted successfully."
        }, status=status.HTTP_204_NO_CONTENT)
