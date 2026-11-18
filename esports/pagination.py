from django.db.models import F
from rest_framework.pagination import PageNumberPagination

from .permissions import is_admin_user


class TeamPagination(PageNumberPagination):
    """Lists of teams, 20 per page (``?page=2``). Visitors cannot ask for
    bigger pages; the admins can (``?page_size=``), e.g. to choose the
    teams of a draw among all the confirmed ones."""
    page_size = 20
    page_size_query_param = 'page_size'
    PUBLIC_MAX_PAGE_SIZE = 20
    ADMIN_MAX_PAGE_SIZE = 500

    def get_page_size(self, request):
        self.max_page_size = (
            self.ADMIN_MAX_PAGE_SIZE if is_admin_user(request.user)
            else self.PUBLIC_MAX_PAGE_SIZE
        )
        return super().get_page_size(request)


# Stable order: without the pk two teams created at the same time could
# swap places between pages.
TEAM_ORDER = (F('seed').asc(nulls_last=True), 'created_at', 'pk')
