from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('modifications', '0006_horodatage_date_modif'),
    ]

    operations = [
        migrations.AddField(
            model_name='modification',
            name='langue_acte',
            field=models.CharField(
                max_length=2,
                choices=[('fr', 'Français'), ('ar', 'Arabe')],
                default='fr',
                verbose_name="Langue de l'acte",
            ),
        ),
    ]
