from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0006_donnees_ident'),
    ]

    operations = [
        migrations.AddField(
            model_name='registreanalytique',
            name='statut_be',
            field=models.CharField(
                choices=[
                    ('NON_DECLARE', 'Non déclaré'),
                    ('EN_ATTENTE',  'En attente (délai 15 jours)'),
                    ('DECLARE',     'Déclaré'),
                    ('EN_RETARD',   'En retard'),
                ],
                db_index=True,
                default='NON_DECLARE',
                max_length=20,
                verbose_name='Statut bénéficiaire effectif',
            ),
        ),
        migrations.AddField(
            model_name='registreanalytique',
            name='date_declaration_be',
            field=models.DateTimeField(
                blank=True, null=True,
                verbose_name='Date de déclaration BE',
            ),
        ),
        migrations.AddField(
            model_name='registreanalytique',
            name='date_limite_be',
            field=models.DateField(
                blank=True, null=True,
                verbose_name='Date limite déclaration BE',
            ),
        ),
    ]
