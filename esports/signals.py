from django.db.models.signals import post_migrate
from django.dispatch import receiver
from django.conf import settings
from .models import CustomUser


@receiver(post_migrate)
def create_default_superadmin(sender, **kwargs):
    if not CustomUser.objects.filter(role='superadmin').exists():
        username = getattr(settings, 'DEFAULT_SUPERADMIN_USERNAME')
        password = getattr(settings, 'DEFAULT_SUPERADMIN_PASSWORD')

        CustomUser.objects.create_superuser(
            username=username,
            password=password,
            role='superadmin'
        )
        print(f"Default superadmin created: {username}")
