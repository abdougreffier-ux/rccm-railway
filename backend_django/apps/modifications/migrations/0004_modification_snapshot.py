from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('modifications', '0003_document_modification_cession'),
    ]

    operations = [
        migrations.AddField(
            model_name='modification',
            name='avant_donnees',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='modification',
            name='corrections',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name='modification',
            name='statut',
            field=models.CharField(
                choices=[
                    ('BROUILLON', 'Brouillon'),
                    ('EN_INSTANCE', 'En instance de validation'),
                    ('RETOURNE', 'Retourné'),
                    ('VALIDE', 'Validé'),
                    ('ANNULE', 'Annulé'),
                    ('ANNULE_GREFFIER', 'Annulé par le greffier'),
                ],
                db_index=True,
                default='BROUILLON',
                max_length=20,
            ),
        ),
    ]
