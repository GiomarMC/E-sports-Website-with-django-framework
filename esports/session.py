"""Admin session: the JWT refresh token lives in an HttpOnly cookie.

JavaScript cannot read that cookie, so a script injected in the page (XSS)
cannot steal a session that lasts: the short access token (15 minutes)
stays in the memory of the page and the browser sends the cookie on its own
only to ``/api/token/`` (refresh and logout). ``SameSite=Strict`` and the
``Origin`` check stop other sites (even other subdomains) from using it.
"""
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken


def set_refresh_cookie(response, refresh):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        str(refresh),
        max_age=int(
            settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()
        ),
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite='Strict',
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite='Strict',
    )
    return response


def check_origin(request):
    """Browsers send ``Origin`` on every POST: it must be the site itself
    (or a configured origin). Requests without it do not come from a web
    page, so they cannot be a forged request from another site (CSRF)."""
    origin = request.headers.get('Origin')
    if not origin:
        return
    allowed = {
        f'{request.scheme}://{request.get_host()}',
        *settings.CSRF_TRUSTED_ORIGINS,
        *settings.CORS_ALLOWED_ORIGINS,
    }
    if origin not in allowed:
        raise PermissionDenied('Origen no permitido.')


def login_response(user, data):
    """Response of a successful login: the access token in the body, the
    refresh token only in the cookie."""
    refresh = RefreshToken.for_user(user)
    response = Response(
        {'access': str(refresh.access_token), **data},
        status=status.HTTP_200_OK,
    )
    return set_refresh_cookie(response, refresh)


class SessionView(APIView):
    # No Authorization header is read: an expired access token must not
    # stop the refresh.
    authentication_classes = []
    permission_classes = []

    def get_authenticate_header(self, request):
        # A missing or revoked session answers 401 (log in again), not 403.
        return 'Bearer realm="api"'

    def refresh_token(self, request):
        return request.COOKIES.get(settings.REFRESH_COOKIE_NAME, '')


class RefreshView(SessionView):
    """New access token from the cookie. The refresh token rotates: the
    cookie gets a new one and the old one is blacklisted."""

    def post(self, request):
        check_origin(request)
        token = self.refresh_token(request)
        if not token:
            raise InvalidToken('No hay una sesión abierta.')
        serializer = TokenRefreshSerializer(data={'refresh': token})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as error:
            # The cookie is not deleted: another tab may have rotated it at
            # the same time and the browser already has the new one.
            raise InvalidToken(error.args[0])
        data = serializer.validated_data
        response = Response({'access': data['access']})
        return set_refresh_cookie(response, data['refresh'])


class LogoutView(SessionView):
    """Blacklists the refresh token and deletes the cookie."""

    def post(self, request):
        check_origin(request)
        try:
            RefreshToken(self.refresh_token(request)).blacklist()
        except TokenError:
            pass  # Already expired or invalid: nothing to revoke.
        return clear_refresh_cookie(
            Response(status=status.HTTP_204_NO_CONTENT)
        )
