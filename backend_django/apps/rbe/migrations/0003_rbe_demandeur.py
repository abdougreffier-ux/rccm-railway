from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('rbe', '0002_refonte_rbe'),
    ]

    operations = [
        migrations.AddField(
            model_name='registrebe',
            name='demandeur',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Demandeur'),
            preserve_default=False,
        ),
    ]
