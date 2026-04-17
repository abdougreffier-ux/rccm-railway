from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0014_horodatage_date_acte'),
    ]

    operations = [
        migrations.AddField(
            model_name='registrechronologique',
            name='langue_acte',
            field=models.CharField(
                max_length=2,
                choices=[('fr', 'Français'), ('ar', 'Arabe')],
                default='fr',
                verbose_name="Langue de l'acte",
                help_text="Langue utilisée lors de la création de l'acte (fr/ar). "
                          "Détermine la langue des documents PDF générés.",
            ),
        ),
    ]
