from rest_framework.routers import DefaultRouter
from .views import AdminViewSet, GameViewSet


router = DefaultRouter()
router.register(r'admin', AdminViewSet, basename='admin')
router.register(r'games', GameViewSet, basename='games')

urlpatterns = router.urls
