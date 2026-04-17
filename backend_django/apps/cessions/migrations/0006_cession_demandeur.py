from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0005_cession_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='cession',
            name='demandeur',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Demandeur'),
            preserve_default=False,
        ),
    ]
