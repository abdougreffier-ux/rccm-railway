from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0007_horodatage_date_cession'),
    ]

    operations = [
        migrations.AddField(
            model_name='cession',
            name='langue_acte',
            field=models.CharField(
                max_length=2,
                choices=[('fr', 'Français'), ('ar', 'Arabe')],
                default='fr',
                verbose_name="Langue de l'acte",
            ),
        ),
    ]
