from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0004_document_modification_cession'),
    ]

    operations = [
        migrations.AddField(
            model_name='cession',
            name='snapshot_avant',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='cession',
            name='nouveau_associe_id',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cession',
            name='corrections',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name='cession',
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
