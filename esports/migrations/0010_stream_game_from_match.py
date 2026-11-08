from django.db import migrations


def fill_stream_game(apps, schema_editor):
    """Streams linked to a match without a game take the game of the
    match, so the admins of that game can manage them."""
    Stream = apps.get_model('esports', 'Stream')
    streams = Stream.objects.filter(
        game__isnull=True, match__isnull=False
    ).select_related('match__stage__tournament')
    for stream in streams:
        stream.game_id = stream.match.stage.tournament.game_id
        stream.save(update_fields=['game'])


class Migration(migrations.Migration):

    dependencies = [
        ('esports', '0009_webhooks'),
    ]

    operations = [
        migrations.RunPython(fill_stream_game, migrations.RunPython.noop),
    ]
