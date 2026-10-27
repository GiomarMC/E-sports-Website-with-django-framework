from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminViewSet, ContactInfoViewSet, GameViewSet, MatchViewSet,
    MediaContentViewSet, OrganizerContactViewSet, PaymentMethodViewSet,
    RegistrationViewSet, SiteSettingsView, StageViewSet, StreamViewSet,
    TournamentViewSet, WebhookViewSet,
)


router = DefaultRouter()
router.register(r'admin', AdminViewSet, basename='admin')
router.register(r'games', GameViewSet, basename='games')
router.register(
    r'payment-methods', PaymentMethodViewSet, basename='payment-methods'
)
router.register(r'tournaments', TournamentViewSet, basename='tournaments')
router.register(
    r'registrations', RegistrationViewSet, basename='registrations'
)
router.register(r'stages', StageViewSet, basename='stages')
router.register(r'matches', MatchViewSet, basename='matches')
router.register(r'streams', StreamViewSet, basename='streams')
router.register(r'media', MediaContentViewSet, basename='media')
router.register(r'contacts', ContactInfoViewSet, basename='contacts')
router.register(r'webhooks', WebhookViewSet, basename='webhooks')
router.register(
    r'organizer-contacts', OrganizerContactViewSet,
    basename='organizer-contacts',
)

urlpatterns = [
    path('settings/', SiteSettingsView.as_view(), name='site-settings'),
] + router.urls
