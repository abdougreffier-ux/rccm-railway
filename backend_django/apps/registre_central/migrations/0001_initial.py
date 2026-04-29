from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ReleveActesMensuels',
            fields=[
                ('id',                   models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('annee',                models.IntegerField(db_index=True, verbose_name='Année')),
                ('mois',                 models.IntegerField(db_index=True, verbose_name='Mois (1–12)')),
                ('nb_immatriculations',  models.IntegerField(default=0, verbose_name='Nb immatriculations')),
                ('nb_modifications',     models.IntegerField(default=0, verbose_name='Nb modifications')),
                ('nb_cessions',          models.IntegerField(default=0, verbose_name='Nb cessions')),
                ('nb_radiations',        models.IntegerField(default=0, verbose_name='Nb radiations')),
                ('actes_json',           models.JSONField(default=dict, verbose_name='Actes sérialisés (format RCCM standard)')),
                ('statut',               models.CharField(
                    choices=[
                        ('BROUILLON', 'Brouillon — en cours de génération'),
                        ('FINALISE',  'Finalisé — prêt pour transmission'),
                        ('TRANSMIS',  'Transmis au Registre Central'),
                        ('ACQUITTE',  'Acquitté — réception confirmée par le central'),
                        ('ERREUR',    'Erreur de transmission'),
                        ('ANNULE',    'Annulé'),
                    ],
                    db_index=True, default='BROUILLON', max_length=20,
                )),
                ('genere_le',            models.DateTimeField(auto_now_add=True, verbose_name='Généré le')),
                ('finalise_le',          models.DateTimeField(blank=True, null=True, verbose_name='Finalisé le')),
                ('observations',         models.TextField(blank=True)),
                ('genere_par', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='releves_generes',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Généré par',
                )),
                ('finalise_par', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='releves_finalises',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Finalisé par',
                )),
            ],
            options={
                'verbose_name':        'Relevé actes mensuel',
                'verbose_name_plural': 'Relevés actes mensuels',
                'db_table':            'registre_central_releve',
                'ordering':            ['-annee', '-mois'],
                'unique_together':     {('annee', 'mois')},
            },
        ),
        migrations.CreateModel(
            name='TransmissionReleveActes',
            fields=[
                ('id',                  models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('tentative',           models.IntegerField(default=1, verbose_name='N° tentative')),
                ('url_cible',           models.URLField(blank=True, max_length=500, verbose_name='URL endpoint Registre Central')),
                ('statut',              models.CharField(
                    choices=[
                        ('EN_COURS', 'En cours'),
                        ('SUCCES',   'Succès'),
                        ('ECHEC',    'Échec'),
                        ('TIMEOUT',  'Timeout'),
                        ('REJETE',   'Rejeté par le central'),
                    ],
                    default='EN_COURS', max_length=20, verbose_name='Statut transmission',
                )),
                ('http_status',         models.IntegerField(blank=True, null=True, verbose_name='Code HTTP reçu')),
                ('reference_centrale',  models.CharField(blank=True, max_length=100, verbose_name='Référence Registre Central')),
                ('reponse_json',        models.JSONField(blank=True, null=True, verbose_name='Réponse JSON du Registre Central')),
                ('erreur_detail',       models.TextField(blank=True, verbose_name='Détail erreur')),
                ('transmis_le',         models.DateTimeField(auto_now_add=True, verbose_name='Transmis le')),
                ('duree_ms',            models.IntegerField(blank=True, null=True, verbose_name='Durée transmission (ms)')),
                ('releve', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='transmissions',
                    to='registre_central.releveactesmensuels',
                    verbose_name='Relevé',
                )),
                ('transmis_par', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='transmissions_rc',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Transmis par',
                )),
            ],
            options={
                'verbose_name':        'Transmission relevé',
                'verbose_name_plural': 'Transmissions relevés',
                'db_table':            'registre_central_transmission',
                'ordering':            ['-transmis_le'],
            },
        ),
    ]
