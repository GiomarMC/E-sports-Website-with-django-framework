from django.db import migrations


def copy_general_dates(apps, schema_editor):
    """Tournaments without their own dates used the general ones: copy them
    so their registration keeps opening and closing on the same dates."""
    SiteSettings = apps.get_model('esports', 'SiteSettings')
    Tournament = apps.get_model('esports', 'Tournament')
    site = SiteSettings.objects.filter(pk=1).first()
    if site is None:
        return
    if site.registration_start:
        Tournament.objects.filter(registration_start__isnull=True).update(
            registration_start=site.registration_start
        )
    if site.registration_end:
        Tournament.objects.filter(registration_end__isnull=True).update(
            registration_end=site.registration_end
        )


class Migration(migrations.Migration):

    dependencies = [
        ('esports', '0005_organizer_contact'),
    ]

    operations = [
        migrations.RunPython(copy_general_dates, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='sitesettings',
            name='registration_start',
        ),
        migrations.RemoveField(
            model_name='sitesettings',
            name='registration_end',
        ),
    ]
