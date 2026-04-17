from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('depots', '0001_initial'),
        ('parametrage', '0002_signataire'),
    ]

    operations = [
        # Step 1: make ra nullable before removing
        migrations.AlterField(
            model_name='depot',
            name='ra',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='depots',
                to='registres.registreanalytique',
            ),
        ),
        # Step 2: remove old fields
        migrations.RemoveField(model_name='depot', name='ra'),
        migrations.RemoveField(model_name='depot', name='type_depot'),
        migrations.RemoveField(model_name='depot', name='annee_exercice'),
        migrations.RemoveField(model_name='depot', name='description'),
        migrations.RemoveField(model_name='depot', name='statut'),
        migrations.RemoveField(model_name='depot', name='validated_at'),
        migrations.RemoveField(model_name='depot', name='validated_by'),
        # Step 3: add new fields
        migrations.AddField(
            model_name='depot',
            name='prenom_deposant',
            field=models.CharField(default='', max_length=150, verbose_name='Prénom du déposant'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='depot',
            name='nom_deposant',
            field=models.CharField(default='', max_length=150, verbose_name='Nom du déposant'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='depot',
            name='telephone_deposant',
            field=models.CharField(blank=True, max_length=30, verbose_name='Téléphone'),
        ),
        migrations.AddField(
            model_name='depot',
            name='denomination',
            field=models.CharField(default='', max_length=300, verbose_name='Dénomination'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='depot',
            name='forme_juridique',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='parametrage.formejuridique',
                verbose_name='Forme juridique',
            ),
        ),
        migrations.AddField(
            model_name='depot',
            name='objet_social',
            field=models.TextField(blank=True, verbose_name='Objet social'),
        ),
        migrations.AddField(
            model_name='depot',
            name='capital',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True, verbose_name='Capital (MRU)'),
        ),
        migrations.AddField(
            model_name='depot',
            name='siege_social',
            field=models.TextField(blank=True, verbose_name='Siège social'),
        ),
    ]
