from django.contrib import admin
from django.core.exceptions import ValidationError
from .models import (
    CustomUser, Game, AdminGame, Team, TeamPlayer, IndividualInscription,
    Tournament, Match, MatchParticipant, Transmission,
    MediaContent, ContactInfo
)


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('username', 'nickname', 'role', 'email')
    search_fields = ('username', 'nickname', 'email')
    list_filter = ['role']


class AdminGameInline(admin.TabularInline):
    model = AdminGame
    extra = 1
    autocomplete_fields = ['admin']


class TournamentInline(admin.TabularInline):
    model = Tournament
    extra = 1
    readonly_fields = ['name', 'start_date', 'status']


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ('name', 'type_of_game', 'active')
    list_filter = ('type_of_game', 'active')
    search_fields = ('name',)
    inlines = [AdminGameInline, TournamentInline]

    def has_add_permission(self, request):
        return request.user.is_superadmin()

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superadmin()

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superadmin():
            return []
        if request.user.is_admin():
            return ['name', 'description', 'type_of_game', 'images', 'active']
        return self.readonly_fields

    def save_model(self, request, obj, form, change):
        if obj.bases and not obj.bases.name.endswith('.pdf'):
            raise ValidationError("Bases must be a PDF file")
        if obj.images and not obj.images.name.lower().endswith(
                ('.png', '.jpg', '.jpeg')):
            raise ValidationError("Images must be in PNG, JPG, or JPEG format")
        super().save_model(request, obj, form, change)


@admin.register(AdminGame)
class AdminGameAdmin(admin.ModelAdmin):
    list_display = ('admin', 'game')
    list_filter = ('admin', 'game')
    search_fields = ('admin__username', 'game__name')
    autocomplete_fields = ['admin', 'game']


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'captain', 'game', 'registration_status', 'created_at'
        )
    list_filter = ('registration_status', 'game')
    search_fields = ('name',)


@admin.register(TeamPlayer)
class TeamPlayerAdmin(admin.ModelAdmin):
    list_display = ('user', 'team')


@admin.register(IndividualInscription)
class IndividualInscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'game', 'registration_status', 'created_at')
    list_filter = ('registration_status', 'game')


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = ('name', 'game', 'start_date', 'status')
    list_filter = ('status', 'game')


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ('tournament', 'round', 'date', 'status')
    list_filter = ('status', 'tournament')


@admin.register(MatchParticipant)
class MatchParticipantAdmin(admin.ModelAdmin):
    list_display = ('match', 'team', 'user')


@admin.register(Transmission)
class TransmissionAdmin(admin.ModelAdmin):
    list_display = ('match', 'platform', 'url')


@admin.register(MediaContent)
class MediaContentAdmin(admin.ModelAdmin):
    list_display = ('tittle', 'type', 'uploaded_at')


@admin.register(ContactInfo)
class ContactInfoAdmin(admin.ModelAdmin):
    list_display = ('platform', 'link')
