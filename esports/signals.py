from django.db.models.signals import post_migrate
from django.dispatch import receiver
from django.conf import settings
from .models import CustomUser


@receiver(post_migrate)
def create_default_superadmin(sender, **kwargs):
    username = getattr(settings, 'DEFAULT_SUPERADMIN_USERNAME')
    password = getattr(settings, 'DEFAULT_SUPERADMIN_PASSWORD')

    superadmin, created = CustomUser.objects.get_or_create(
        username=username,
        defaults={'role': 'superadmin'}
    )

    if created:
        superadmin.set_password(password)
        superadmin.save()
        print(f"Default superadmin created: {username}")
    else:
        superadmin.set_password(password)
        superadmin.role = 'superadmin'
        superadmin.save()
        print(f"Default superadmin updated: {username}")
