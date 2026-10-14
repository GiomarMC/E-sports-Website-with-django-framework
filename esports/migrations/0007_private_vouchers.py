import os
import shutil
import uuid

import django.core.validators
import esports.models
from django.conf import settings
from django.db import migrations, models


def move_vouchers(apps, schema_editor):
    """Moves the vouchers out of the public media folder and gives them a
    random name (the old ones were guessable: voucher-<team>.png)."""
    Registration = apps.get_model('esports', 'Registration')
    public = settings.MEDIA_ROOT
    private = settings.PRIVATE_MEDIA_ROOT
    for registration in Registration.objects.exclude(voucher=''):
        source = os.path.join(public, registration.voucher.name)
        if not os.path.isfile(source):
            continue
        extension = os.path.splitext(source)[1].lower()
        name = f'vouchers/{uuid.uuid4().hex}{extension}'
        target = os.path.join(private, name)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.move(source, target)
        Registration.objects.filter(pk=registration.pk).update(voucher=name)


class Migration(migrations.Migration):

    dependencies = [
        ('esports', '0006_remove_site_registration_dates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='mediacontent',
            name='file',
            field=models.FileField(upload_to='media_content/', validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm'])]),
        ),
        migrations.AlterField(
            model_name='registration',
            name='voucher',
            field=models.FileField(blank=True, storage=esports.models.private_storage, upload_to=esports.models.voucher_path, validators=[django.core.validators.FileExtensionValidator(['pdf', 'jpg', 'jpeg', 'png'])]),
        ),
        migrations.RunPython(move_vouchers, migrations.RunPython.noop),
    ]
