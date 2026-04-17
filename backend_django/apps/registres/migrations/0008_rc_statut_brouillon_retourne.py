from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0007_statut_be'),
    ]

    operations = [
        migrations.AlterField(
            model_name='registrechronologique',
            name='statut',
            field=models.CharField(
                choices=[
                    ('BROUILLON',   'Brouillon'),
                    ('EN_INSTANCE', 'En instance'),
                    ('RETOURNE',    'Retourné'),
                    ('VALIDE',      'Validé'),
                    ('REJETE',      'Rejeté'),
                    ('ANNULE',      'Annulé'),
                ],
                db_index=True,
                default='BROUILLON',
                max_length=20,
            ),
        ),
    ]
