"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from drf_yasg import openapi
from drf_yasg.views import get_schema_view
from rest_framework import permissions

from esports.session import LogoutView, RefreshView

schema_view = get_schema_view(
    openapi.Info(
        title='Esports API',
        default_version='v1',
        description='Esports tournaments: games, registrations, stages, '
                    'matches and streams.',
    ),
    public=True,
    permission_classes=[permissions.AllowAny],
)

urlpatterns = [
    path('api/', include('esports.urls')),
    # The refresh token travels in an HttpOnly cookie (esports/session.py).
    path('api/token/refresh/', RefreshView.as_view(), name='token_refresh'),
    path('api/token/logout/', LogoutView.as_view(), name='token_logout'),
]

if settings.API_DOCS:
    urlpatterns += [
        path('api/docs/',
             schema_view.with_ui('swagger', cache_timeout=0),
             name='api-docs'),
        path('api/redoc/',
             schema_view.with_ui('redoc', cache_timeout=0),
             name='api-redoc'),
    ]

# Only with DEBUG: in production the web server serves MEDIA_ROOT.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
