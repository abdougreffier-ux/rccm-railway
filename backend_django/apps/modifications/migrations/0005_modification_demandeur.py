from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('modifications', '0004_modification_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='modification',
            name='demandeur',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Demandeur'),
            preserve_default=False,
        ),
    ]
