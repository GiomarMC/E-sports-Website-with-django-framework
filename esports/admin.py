from django.contrib import admin
from .models import (
    CustomUser, Game, Team, TeamPlayer, IndividualInscription,
    Tournament, Match, MatchParticipant, Transmission,
    MediaContent, ContactInfo
)


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('username', 'nickname', 'role', 'email')
    search_fields = ('username', 'nickname', 'email')
    list_filter = ['role']


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ('name', 'type_of_game', 'active')
    list_filter = ('type_of_game', 'active')


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
