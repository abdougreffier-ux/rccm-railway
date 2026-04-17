import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('parametrage', '0001_initial'),
        ('registres',   '0003_audit_journal'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ImmatriculationHistorique',
            fields=[
                ('id',                   models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uuid',                 models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('numero_demande',       models.CharField(max_length=20, unique=True, verbose_name='N° demande')),
                ('statut',               models.CharField(
                    choices=[
                        ('BROUILLON',   'Brouillon'),
                        ('EN_INSTANCE', 'En instance'),
                        ('RETOURNE',    'Retourné'),
                        ('VALIDE',      'Validé'),
                        ('REJETE',      'Rejeté'),
                        ('ANNULE',      'Annulé'),
                    ],
                    db_index=True, default='BROUILLON', max_length=20,
                )),
                ('type_entite',          models.CharField(
                    choices=[('PH', 'Personne physique'), ('PM', 'Personne morale'), ('SC', 'Succursale')],
                    max_length=2,
                )),
                ('numero_ra',            models.CharField(max_length=30, unique=True, verbose_name='N° analytique')),
                ('numero_chrono',        models.IntegerField(verbose_name='N° chronologique')),
                ('annee_chrono',         models.IntegerField(verbose_name='Année du chrono')),
                ('date_immatriculation', models.DateField(verbose_name="Date d'immatriculation")),
                ('donnees',              models.JSONField(blank=True, default=dict)),
                ('observations',         models.TextField(blank=True)),
                ('validated_at',         models.DateTimeField(blank=True, null=True)),
                ('created_at',           models.DateTimeField(auto_now_add=True)),
                ('updated_at',           models.DateTimeField(auto_now=True)),
                ('import_batch',         models.CharField(blank=True, max_length=50)),
                ('import_row',           models.IntegerField(blank=True, null=True)),
                ('localite',   models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='parametrage.localite', verbose_name='Greffe',
                )),
                ('ra',         models.OneToOneField(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='immatriculation_historique',
                    to='registres.registreanalytique',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='hist_crees',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('validated_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='hist_valides',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name':        'Immatriculation historique',
                'verbose_name_plural': 'Immatriculations historiques',
                'db_table':            'immatriculations_historiques',
                'ordering':            ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='immatriculationhistorique',
            constraint=models.UniqueConstraint(
                fields=['numero_chrono', 'annee_chrono'],
                name='unique_chrono_annee',
            ),
        ),
    ]
