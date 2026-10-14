from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models.signals import post_migrate
from django.dispatch import receiver

from .models import CustomUser


@receiver(post_migrate)
def create_default_superadmin(sender, **kwargs):
    # post_migrate is sent once per installed app: only react to ours.
    if sender.name != 'esports':
        return

    username = getattr(settings, 'DEFAULT_SUPERADMIN_USERNAME', '')
    password = getattr(settings, 'DEFAULT_SUPERADMIN_PASSWORD', '')
    if not username or not password:
        return

    # Only create it: the password must not be reset on every migrate,
    # otherwise any password change would be lost on the next deploy.
    if CustomUser.objects.filter(username=username).exists():
        return

    superadmin = CustomUser(username=username, role='superadmin')
    try:
        validate_password(password, superadmin)
    except ValidationError as error:
        print(
            f"Default superadmin NOT created, weak password: "
            f"{' '.join(error.messages)}"
        )
        return
    superadmin.set_password(password)
    superadmin.save()
    print(f"Default superadmin created: {username}")
