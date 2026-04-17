from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0008_langue_acte'),
    ]

    operations = [
        migrations.AddField(
            model_name='cession',
            name='cedants',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='cession',
            name='cessionnaires',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='cession',
            name='nouveaux_associes_ids',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
