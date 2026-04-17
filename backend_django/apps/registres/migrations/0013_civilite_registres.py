from django.db import migrations, models

_CHOICES = [('MR', 'M.'), ('MME', 'Mme'), ('MLLE', 'Mlle')]


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0012_organe_motif_fin'),
    ]

    operations = [
        # Déclarant
        migrations.AddField(
            model_name='declarant',
            name='civilite',
            field=models.CharField(blank=True, choices=_CHOICES, max_length=5, verbose_name='Civilité'),
        ),
        # Administrateur SA
        migrations.AddField(
            model_name='administrateur',
            name='civilite',
            field=models.CharField(blank=True, choices=_CHOICES, max_length=5, verbose_name='Civilité'),
        ),
        # Commissaire aux comptes SA
        migrations.AddField(
            model_name='commissairecomptes',
            name='civilite',
            field=models.CharField(
                blank=True, choices=_CHOICES, max_length=5,
                verbose_name='Civilité',
                help_text='Applicable uniquement aux personnes physiques (PH)',
            ),
        ),
    ]
