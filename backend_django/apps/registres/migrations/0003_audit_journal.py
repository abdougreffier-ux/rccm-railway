from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0002_workflow'),
    ]

    operations = [
        migrations.AddField(
            model_name='actionhistorique',
            name='etat_avant',
            field=models.JSONField(blank=True, null=True, default=None),
        ),
        migrations.AddField(
            model_name='actionhistorique',
            name='etat_apres',
            field=models.JSONField(blank=True, null=True, default=None),
        ),
        migrations.AddField(
            model_name='actionhistorique',
            name='reference_operation',
            field=models.CharField(max_length=50, blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='actionhistorique',
            name='action',
            field=models.CharField(
                max_length=30,
                choices=[
                    ('CREATION',                'Création'),
                    ('COMPLETION',              'Complétion'),
                    ('ENVOI',                   'Envoi au greffier'),
                    ('RETOUR',                  "Retour à l'agent"),
                    ('VALIDATION',              'Validation / Immatriculation'),
                    ('VALIDATION_MODIFICATION', 'Validation de modification'),
                    ('RETOUR_MODIFICATION',     'Retour de modification'),
                    ('ANNULATION_MODIFICATION', 'Annulation de modification'),
                    ('MODIFICATION_CORRECTIVE', 'Modification corrective'),
                    ('VALIDATION_CESSION',      'Validation de cession'),
                    ('RETOUR_CESSION',          'Retour de cession'),
                    ('ANNULATION_CESSION',      'Annulation de cession'),
                    ('CESSION_CORRECTIVE',      'Cession corrective'),
                    ('CREATION_RADIATION',      'Création de radiation'),
                    ('VALIDATION_RADIATION',    'Validation de radiation'),
                    ('REJET_RADIATION',         'Rejet de radiation'),
                    ('ANNULATION_RADIATION',    'Annulation de radiation'),
                ],
            ),
        ),
    ]
