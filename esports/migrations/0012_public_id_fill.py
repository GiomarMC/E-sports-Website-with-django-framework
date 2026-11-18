import secrets
import string

from django.db import migrations

ALPHABET = string.ascii_letters + string.digits

MODELS = [
    'customuser',
    'game',
    'paymentmethod',
    'tournament',
    'registration',
    'registrationmember',
    'stage',
    'stagegroup',
    'match',
    'stream',
    'mediacontent',
    'contactinfo',
    'webhook',
    'organizercontact',
]


def fill(apps, schema_editor):
    used = set()
    for name in MODELS:
        model = apps.get_model('esports', name)
        rows = list(model.objects.filter(public_id__isnull=True))
        for row in rows:
            value = ''.join(secrets.choice(ALPHABET) for _ in range(12))
            while value in used:
                value = ''.join(secrets.choice(ALPHABET) for _ in range(12))
            used.add(value)
            row.public_id = value
        model.objects.bulk_update(rows, ['public_id'], batch_size=500)


class Migration(migrations.Migration):
    """Step 2 of 3: a random public id for every existing row."""

    dependencies = [
        ('esports', '0011_public_id_add'),
    ]

    operations = [
        migrations.RunPython(fill, migrations.RunPython.noop),
    ]
