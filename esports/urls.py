from rest_framework.routers import DefaultRouter
from .views import AdminLoginView


router = DefaultRouter()
router.register(r'admin', AdminLoginView, basename='admin-login')

urlpatterns = router.urls
