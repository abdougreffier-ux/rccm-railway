from django.db import migrations, models

_CHOICES = [('MR', 'M.'), ('MME', 'Mme'), ('MLLE', 'Mlle')]


class Migration(migrations.Migration):

    dependencies = [
        ('rbe', '0003_rbe_demandeur'),
    ]

    operations = [
        # BeneficiaireEffectif — personne physique uniquement
        migrations.AddField(
            model_name='beneficiaireeffectif',
            name='civilite',
            field=models.CharField(blank=True, choices=_CHOICES, max_length=5, verbose_name='Civilité'),
        ),
        # RegistreBE — déclarant
        migrations.AddField(
            model_name='registrebe',
            name='declarant_civilite',
            field=models.CharField(blank=True, choices=_CHOICES, max_length=5, verbose_name='Civilité du déclarant'),
        ),
    ]
