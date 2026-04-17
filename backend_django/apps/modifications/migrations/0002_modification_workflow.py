from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('modifications', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='modification',
            name='nouvelles_donnees',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='modification',
            name='statut',
            field=models.CharField(
                choices=[
                    ('BROUILLON',   'Brouillon'),
                    ('EN_INSTANCE', 'En instance de validation'),
                    ('RETOURNE',    'Retourné'),
                    ('VALIDE',      'Validé'),
                    ('ANNULE',      'Annulé'),
                ],
                db_index=True,
                default='BROUILLON',
                max_length=20,
            ),
        ),
    ]
