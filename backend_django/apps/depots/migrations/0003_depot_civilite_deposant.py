from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('depots', '0002_depot_refonte'),
    ]

    operations = [
        migrations.AddField(
            model_name='depot',
            name='civilite_deposant',
            field=models.CharField(
                blank=True,
                choices=[('MR', 'M.'), ('MME', 'Mme'), ('MLLE', 'Mlle')],
                max_length=5,
                verbose_name='Civilité du déposant',
            ),
        ),
    ]
