from rest_framework import serializers
from django.contrib.auth import authenticate
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied


class AdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            raise serializers.ValidationError(
                "Username and password are required."
                )

        user = authenticate(username=username, password=password)

        if not user:
            raise AuthenticationFailed("Invalid credentials")

        if user.role not in ['admin', 'superadmin']:
            raise PermissionDenied(
                "You do not have permission to access this resource."
                )

        data['user'] = user
        return data
