from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0005_fix_numero_ra'),
    ]

    operations = [
        migrations.AddField(
            model_name='associe',
            name='donnees_ident',
            field=models.JSONField(blank=True, default=dict, verbose_name='Données identité complémentaires'),
        ),
        migrations.AddField(
            model_name='gerant',
            name='donnees_ident',
            field=models.JSONField(blank=True, default=dict, verbose_name='Données identité complémentaires'),
        ),
    ]
