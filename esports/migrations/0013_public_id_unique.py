from django.db import migrations, models

import esports.models

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


class Migration(migrations.Migration):
    """Step 3 of 3: required and unique, new rows get it on their own."""

    dependencies = [
        ('esports', '0012_public_id_fill'),
    ]

    operations = [
        migrations.AlterField(
            model_name=name,
            name='public_id',
            field=models.CharField(
                default=esports.models.new_public_id, editable=False,
                max_length=12, unique=True,
            ),
        )
        for name in MODELS
    ]
