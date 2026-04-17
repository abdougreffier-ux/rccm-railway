import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0001_initial'),
        ('registres', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='cession',
            name='associe_cedant',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='cessions_cedant',
                to='registres.associe',
            ),
        ),
        migrations.AddField(
            model_name='cession',
            name='type_cession_parts',
            field=models.CharField(
                blank=True,
                choices=[('TOTALE', 'Cession totale'), ('PARTIELLE', 'Cession partielle')],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='cession',
            name='nombre_parts_cedees',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cession',
            name='beneficiaire_type',
            field=models.CharField(
                choices=[('EXISTANT', 'Associé existant'), ('NOUVEAU', 'Nouvel associé')],
                default='EXISTANT',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='cession',
            name='beneficiaire_associe',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='cessions_beneficiaire',
                to='registres.associe',
            ),
        ),
        migrations.AddField(
            model_name='cession',
            name='beneficiaire_data',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='cession',
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
