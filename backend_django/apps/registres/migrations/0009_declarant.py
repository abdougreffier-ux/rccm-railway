from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('parametrage', '0001_initial'),
        ('registres', '0008_rc_statut_brouillon_retourne'),
    ]

    operations = [
        # 1. Créer la table declarant
        migrations.CreateModel(
            name='Declarant',
            fields=[
                ('id',             models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom',            models.CharField(max_length=200, verbose_name='Nom')),
                ('prenom',         models.CharField(blank=True, max_length=200, verbose_name='Prénom(s)')),
                ('nni',            models.CharField(blank=True, db_index=True, max_length=20, verbose_name='NNI')),
                ('num_passeport',  models.CharField(blank=True, max_length=30, verbose_name='N° Passeport')),
                ('date_naissance', models.DateField(blank=True, null=True, verbose_name='Date de naissance')),
                ('lieu_naissance', models.CharField(blank=True, max_length=200, verbose_name='Lieu de naissance')),
                ('nationalite',    models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='parametrage.nationalite',
                    verbose_name='Nationalité',
                )),
                ('created_at',     models.DateTimeField(auto_now_add=True)),
                ('updated_at',     models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name':        'Déclarant',
                'verbose_name_plural': 'Déclarants',
                'db_table':            'declarant',
                'ordering':            ['nom', 'prenom'],
            },
        ),
        # 2. Ajouter la FK declarant sur RegistreChronologique
        migrations.AddField(
            model_name='registrechronologique',
            name='declarant',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='registres',
                to='registres.declarant',
                verbose_name='Déclarant',
            ),
        ),
    ]
