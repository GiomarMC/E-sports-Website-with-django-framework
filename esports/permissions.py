from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Game, Match, Registration, Stage, Stream, Tournament


def is_admin_user(user):
    return (
        user.is_authenticated
        and getattr(user, 'role', None) in ['admin', 'superadmin']
    )


def game_of(obj):
    """Returns the game an object belongs to (None for global objects)."""
    if isinstance(obj, Game):
        return obj
    if isinstance(obj, Tournament):
        return obj.game
    if isinstance(obj, (Registration, Stage)):
        return obj.tournament.game
    if isinstance(obj, Match):
        return obj.stage.tournament.game
    if isinstance(obj, Stream):
        if obj.game_id:
            return obj.game
        if obj.match_id:
            return obj.match.stage.tournament.game
        return None
    return getattr(obj, 'game', None)


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == 'superadmin'
        )


class IsAdminOrSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return is_admin_user(request.user)


class IsGameAdmin(BasePermission):
    """Superadmins manage everything; game admins only manage the objects
    of the games assigned to them through AdminGame."""
    message = 'You are not an administrator of this game.'

    def has_permission(self, request, view):
        return is_admin_user(request.user)

    def has_object_permission(self, request, view, obj):
        return request.user.can_manage_game(game_of(obj))


class ReadOnlyOrGameAdmin(IsGameAdmin):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().has_permission(request, view)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return super().has_object_permission(request, view, obj)


class ReadOnlyOrSuperAdmin(IsSuperAdmin):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().has_permission(request, view)
