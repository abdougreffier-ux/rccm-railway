from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('radiations', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='radiation',
            name='demandeur',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Demandeur'),
            preserve_default=False,
        ),
    ]
