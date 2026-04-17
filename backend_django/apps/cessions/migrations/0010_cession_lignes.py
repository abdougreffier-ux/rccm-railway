from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0009_cession_multi_parties'),
    ]

    operations = [
        migrations.AddField(
            model_name='cession',
            name='lignes',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text=(
                    'Lignes élémentaires de cession RCCM. '
                    'Chaque ligne : {cedant_associe_id, cedant_nom, '
                    'cessionnaire_type, cessionnaire_associe_id, '
                    'cessionnaire_prenom, cessionnaire_nom, '
                    'cessionnaire_nationalite_id, nombre_parts}. '
                    'Un même cédant peut apparaître dans plusieurs lignes.'
                ),
            ),
        ),
    ]
