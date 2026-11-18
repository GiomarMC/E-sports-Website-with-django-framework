from django.db import migrations, models

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
    """Step 1 of 3: the column, empty, so the existing rows can each get
    their own random value (a default would give every row the same)."""

    dependencies = [
        ('esports', '0010_stream_game_from_match'),
    ]

    operations = [
        migrations.AddField(
            model_name=name,
            name='public_id',
            field=models.CharField(max_length=12, null=True, editable=False),
        )
        for name in MODELS
    ]
