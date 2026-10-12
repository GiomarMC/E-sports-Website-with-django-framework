from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AdminGame, ContactInfo, CustomUser, Game, Match, MatchParticipant,
    MediaContent, Registration, RegistrationMember, SiteSettings, Stage,
    StageGroup, StageParticipant, Stream, Tournament,
)


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'nickname', 'role', 'email')
    search_fields = ('username', 'nickname', 'email')
    list_filter = ['role']
    fieldsets = UserAdmin.fieldsets + (
        ('Esports', {'fields': ('role', 'nickname', 'phone')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Esports', {'fields': ('role',)}),
    )


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = (
        'event_name', 'registration_enabled', 'registration_start',
        'registration_end'
        )

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


class AdminGameInline(admin.TabularInline):
    model = AdminGame
    extra = 1
    autocomplete_fields = ['admin']


class TournamentInline(admin.TabularInline):
    model = Tournament
    extra = 0
    fields = ['name', 'start_date', 'status']
    show_change_link = True


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'type_of_game', 'min_players', 'max_players', 'active'
        )
    list_filter = ('type_of_game', 'active')
    search_fields = ('name',)
    inlines = [AdminGameInline, TournamentInline]


@admin.register(AdminGame)
class AdminGameAdmin(admin.ModelAdmin):
    list_display = ('admin', 'game')
    list_filter = ('admin', 'game')
    search_fields = ('admin__username', 'game__name')
    autocomplete_fields = ['admin', 'game']


class StageInline(admin.TabularInline):
    model = Stage
    extra = 0
    fields = ['order', 'name', 'stage_type', 'status']
    readonly_fields = ['status']
    show_change_link = True


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'game', 'start_date', 'status', 'fee_per_player',
        'registration_enabled'
        )
    list_filter = ('status', 'game')
    search_fields = ('name',)
    inlines = [StageInline]


class RegistrationMemberInline(admin.TabularInline):
    model = RegistrationMember
    extra = 0


@admin.register(Registration)
class RegistrationAdmin(admin.ModelAdmin):
    list_display = (
        'display_name', 'tournament', 'status', 'is_active', 'amount_due',
        'created_at'
        )
    list_filter = ('status', 'is_active', 'tournament__game')
    search_fields = ('team_name', 'members__nickname', 'members__full_name')
    readonly_fields = ('code', 'created_at', 'reviewed_at', 'reviewed_by')
    inlines = [RegistrationMemberInline]


class StageGroupInline(admin.TabularInline):
    model = StageGroup
    extra = 0


class StageParticipantInline(admin.TabularInline):
    model = StageParticipant
    extra = 0


@admin.register(Stage)
class StageAdmin(admin.ModelAdmin):
    list_display = ('name', 'tournament', 'order', 'stage_type', 'status')
    list_filter = ('stage_type', 'status', 'tournament')
    inlines = [StageGroupInline, StageParticipantInline]


class MatchParticipantInline(admin.TabularInline):
    model = MatchParticipant
    extra = 0


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = (
        '__str__', 'stage', 'round', 'scheduled_at', 'status', 'winner'
        )
    list_filter = ('status', 'stage__tournament')
    inlines = [MatchParticipantInline]


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ('title', 'platform', 'game', 'match', 'is_live')
    list_filter = ('platform', 'is_live', 'game')


@admin.register(MediaContent)
class MediaContentAdmin(admin.ModelAdmin):
    list_display = ('title', 'type', 'uploaded_at')


@admin.register(ContactInfo)
class ContactInfoAdmin(admin.ModelAdmin):
    list_display = ('platform', 'link')
