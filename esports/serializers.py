from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from .models import CustomUser, AdminGame, Game


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


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class ResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ['id', 'name']


class AdminListSerializer(serializers.ModelSerializer):
    games = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'role', 'games']

    def get_games(self, obj):
        if obj.role == 'superadmin':
            return GameSerializer(Game.objects.all(), many=True).data

        elif obj.role == 'admin':
            qs = AdminGame.objects.filter(admin=obj)
            return GameSerializer([ag.game for ag in qs], many=True).data
        return []


class AdminCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = ['username', 'password', 'role']

    def validate_role(self, value):
        if value not in ['admin', 'superadmin']:
            raise serializers.ValidationError("Invalid role.")
        return value

    def create(self, validated_data):
        user = CustomUser.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            role=validated_data['role']
        )
        return user


class GameCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ['id', 'name', 'description',
                  'type_of_game', 'active', 'images', 'bases']

    def validate_name(self, value):
        request = self.context.get('request')
        if request and request.method in ['PUT', 'PATCH']:
            game_id = self.instance.id if self.instance else None
            if Game.objects.exclude(id=game_id).filter(name=value).exists():
                raise serializers.ValidationError(
                    "Game with this name already exists.")
        else:
            if Game.objects.filter(name=value).exists():
                raise serializers.ValidationError(
                    "Game with this name already exists.")
        return value

    def validate_bases(self, value):
        if value and not value.name.lower().endswith('.pdf'):
            raise serializers.ValidationError("Bases file must be a PDF.")
        return value

    def validate_images(self, value):
        if value and not value.name.lower().endswith((
                '.png', '.jpg', '.jpeg')):
            raise serializers.ValidationError(
                "Images must be in PNG, JPG, or JPEG format."
                )
        return value

    def update(self, instance, validated_data):
        user = self.context['request'].user

        if user.role == 'admin':
            allowed_fields = ['description', 'bases']
            for field in allowed_fields:
                if field in validated_data:
                    setattr(instance, field, validated_data[field])
            instance.save()
            return instance

        return super().update(instance, validated_data)


class GamePublicSerializer(serializers.ModelSerializer):
    tournaments = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = ['id', 'name', 'description', 'type_of_game',
                  'active', 'images', 'bases', 'tournaments']

    def get_tournaments(self, obj):
        return [{
            'id': t.id,
            'name': t.name,
            'status': t.status} for t in obj.tournament_set.all()]
