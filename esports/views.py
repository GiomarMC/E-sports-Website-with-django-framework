from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework import viewsets, status
from rest_framework_simplejwt.tokens import RefreshToken
from esports.serializers import AdminLoginSerializer


class AdminLoginView(viewsets.ViewSet):

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
