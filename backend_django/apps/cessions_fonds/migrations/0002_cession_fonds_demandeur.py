from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions_fonds', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='cessionfonds',
            name='demandeur',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Demandeur'),
            preserve_default=False,
        ),
    ]
