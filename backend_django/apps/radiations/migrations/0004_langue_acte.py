from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('radiations', '0003_horodatage_date_radiation'),
    ]

    operations = [
        migrations.AddField(
            model_name='radiation',
            name='langue_acte',
            field=models.CharField(
                max_length=2,
                choices=[('fr', 'Français'), ('ar', 'Arabe')],
                default='fr',
                verbose_name="Langue de l'acte",
            ),
        ),
    ]
