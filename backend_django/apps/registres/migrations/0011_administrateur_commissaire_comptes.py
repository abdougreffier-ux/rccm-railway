from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('registres',   '0010_numero_ra_nullable'),
        ('parametrage', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Administrateur',
            fields=[
                ('id',             models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom',            models.CharField(max_length=200)),
                ('prenom',         models.CharField(blank=True, max_length=200)),
                ('nom_ar',         models.CharField(blank=True, max_length=200, verbose_name='Nom (arabe)')),
                ('prenom_ar',      models.CharField(blank=True, max_length=200, verbose_name='Prénom (arabe)')),
                ('date_naissance', models.DateField(blank=True, null=True)),
                ('lieu_naissance', models.CharField(blank=True, max_length=200)),
                ('nni',            models.CharField(blank=True, max_length=20, verbose_name='NNI')),
                ('num_passeport',  models.CharField(blank=True, max_length=50)),
                ('adresse',        models.TextField(blank=True)),
                ('telephone',      models.CharField(blank=True, max_length=20)),
                ('email',          models.EmailField(blank=True, max_length=254)),
                ('fonction',       models.CharField(
                    blank=True, max_length=100,
                    verbose_name='Fonction au CA',
                    help_text='Ex. : Président, Vice-président, Administrateur délégué',
                )),
                ('date_debut',     models.DateField(blank=True, null=True, verbose_name='Date de prise de fonction')),
                ('date_fin',       models.DateField(blank=True, null=True, verbose_name='Date de fin de mandat')),
                ('actif',          models.BooleanField(default=True)),
                ('created_at',     models.DateTimeField(auto_now_add=True)),
                ('updated_at',     models.DateTimeField(auto_now=True)),
                ('ra',             models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='administrateurs',
                    to='registres.registreanalytique',
                )),
                ('nationalite',    models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='parametrage.nationalite',
                )),
            ],
            options={
                'verbose_name':        'Administrateur SA',
                'verbose_name_plural': 'Administrateurs SA',
                'db_table':            'administrateurs_sa',
                'ordering':            ['nom', 'prenom'],
            },
        ),
        migrations.CreateModel(
            name='CommissaireComptes',
            fields=[
                ('id',               models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type_commissaire', models.CharField(
                    choices=[('PH', 'Personne physique'), ('PM', 'Personne morale')],
                    default='PH', max_length=2, verbose_name='Type',
                )),
                ('role',             models.CharField(
                    choices=[('TITULAIRE', 'Titulaire'), ('SUPPLEANT', 'Suppléant')],
                    default='TITULAIRE', max_length=20, verbose_name='Rôle',
                )),
                ('nom',              models.CharField(
                    max_length=200,
                    help_text='Nom (PH) ou dénomination sociale (PM)',
                )),
                ('prenom',           models.CharField(blank=True, max_length=200)),
                ('nom_ar',           models.CharField(blank=True, max_length=200, verbose_name='Nom (arabe)')),
                ('date_naissance',   models.DateField(blank=True, null=True)),
                ('lieu_naissance',   models.CharField(blank=True, max_length=200)),
                ('nni',              models.CharField(blank=True, max_length=20, verbose_name='NNI')),
                ('num_passeport',    models.CharField(blank=True, max_length=50)),
                ('adresse',          models.TextField(blank=True)),
                ('telephone',        models.CharField(blank=True, max_length=20)),
                ('email',            models.EmailField(blank=True, max_length=254)),
                ('date_debut',       models.DateField(blank=True, null=True, verbose_name='Date de nomination')),
                ('date_fin',         models.DateField(blank=True, null=True, verbose_name='Date de fin de mandat')),
                ('actif',            models.BooleanField(default=True)),
                ('created_at',       models.DateTimeField(auto_now_add=True)),
                ('updated_at',       models.DateTimeField(auto_now=True)),
                ('ra',               models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='commissaires',
                    to='registres.registreanalytique',
                )),
                ('nationalite',      models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='parametrage.nationalite',
                )),
            ],
            options={
                'verbose_name':        'Commissaire aux comptes',
                'verbose_name_plural': 'Commissaires aux comptes',
                'db_table':            'commissaires_comptes_sa',
                'ordering':            ['role', 'nom'],
            },
        ),
    ]
