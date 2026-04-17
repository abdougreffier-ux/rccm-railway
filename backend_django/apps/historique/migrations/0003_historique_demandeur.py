from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('historique', '0002_heure_immatriculation'),
    ]

    operations = [
        migrations.AddField(
            model_name='immatriculationhistorique',
            name='demandeur',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Demandeur'),
            preserve_default=False,
        ),
    ]
