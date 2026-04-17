import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('registres', '0001_initial'),
        ('parametrage', '0002_signataire'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RegistreBE',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uuid', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('numero_rbe', models.CharField(blank=True, max_length=30, unique=True)),
                ('type_entite', models.CharField(
                    choices=[
                        ('SOCIETE', 'Société'),
                        ('ASSOCIATION', 'Association'),
                        ('CONSTRUCTION_JURIDIQUE', 'Construction juridique / Fiducie'),
                        ('FONDATION', 'Fondation et constructions similaires'),
                    ],
                    max_length=30,
                )),
                ('denomination_entite', models.CharField(blank=True, max_length=300)),
                ('denomination_entite_ar', models.CharField(blank=True, max_length=300)),
                ('type_declaration', models.CharField(
                    choices=[
                        ('INITIALE', 'Déclaration initiale'),
                        ('MODIFICATION', 'Modification'),
                        ('RADIATION', 'Radiation'),
                    ],
                    default='INITIALE',
                    max_length=20,
                )),
                ('statut', models.CharField(
                    choices=[
                        ('BROUILLON', 'Brouillon'),
                        ('EN_ATTENTE', 'En attente de validation'),
                        ('RETOURNE', 'Retourné pour correction'),
                        ('VALIDE', 'Validé'),
                        ('MODIFIE', 'Modifié'),
                        ('RADIE', 'Radié'),
                    ],
                    db_index=True,
                    default='BROUILLON',
                    max_length=20,
                )),
                ('declarant_nom', models.CharField(blank=True, max_length=200)),
                ('declarant_prenom', models.CharField(blank=True, max_length=200)),
                ('declarant_nom_ar', models.CharField(blank=True, max_length=200)),
                ('declarant_qualite', models.CharField(blank=True, max_length=200)),
                ('declarant_qualite_ar', models.CharField(blank=True, max_length=200)),
                ('declarant_adresse', models.TextField(blank=True)),
                ('declarant_telephone', models.CharField(blank=True, max_length=50)),
                ('declarant_email', models.EmailField(blank=True, max_length=254)),
                ('date_declaration', models.DateField(blank=True, null=True)),
                ('motif', models.TextField(blank=True)),
                ('observations', models.TextField(blank=True)),
                ('observations_greffier', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('validated_at', models.DateTimeField(blank=True, null=True)),
                ('ra', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='declarations_rbe',
                    to='registres.registreanalytique',
                )),
                ('localite', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='parametrage.localite',
                )),
                ('declaration_initiale', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='suites',
                    to='rbe.registrebe',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='rbe_crees',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('validated_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='rbe_valides',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Déclaration RBE',
                'verbose_name_plural': 'Déclarations RBE',
                'db_table': 'rbe_declarations',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='BeneficiaireEffectif',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom', models.CharField(max_length=200)),
                ('prenom', models.CharField(blank=True, max_length=200)),
                ('nom_ar', models.CharField(blank=True, max_length=200)),
                ('prenom_ar', models.CharField(blank=True, max_length=200)),
                ('date_naissance', models.DateField(blank=True, null=True)),
                ('lieu_naissance', models.CharField(blank=True, max_length=200)),
                ('lieu_naissance_ar', models.CharField(blank=True, max_length=200)),
                ('nationalite_autre', models.CharField(blank=True, max_length=100)),
                ('type_document', models.CharField(
                    blank=True,
                    choices=[
                        ('NNI', "Carte Nationale d'Identité"),
                        ('PASSEPORT', 'Passeport'),
                        ('AUTRE', 'Autre document'),
                    ],
                    max_length=20,
                )),
                ('numero_document', models.CharField(blank=True, max_length=100)),
                ('adresse', models.TextField(blank=True)),
                ('adresse_ar', models.TextField(blank=True)),
                ('telephone', models.CharField(blank=True, max_length=50)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('nature_controle', models.CharField(
                    blank=True,
                    choices=[
                        ('PARTICIPATION_DIRECTE', 'Participation directe (actions/parts)'),
                        ('PARTICIPATION_INDIRECTE', 'Participation indirecte'),
                        ('CONTROLE_DIRECTION', 'Contrôle de la direction'),
                        ('REPRESENTANT_LEGAL', 'Représentant légal (à défaut)'),
                        ('BENEFICIAIRE_BIENS', 'Bénéficiaire des biens (≥20%)'),
                        ('CONTROLE_ULTIME', 'Contrôle en dernier ressort'),
                        ('AUTRE', 'Autre'),
                    ],
                    max_length=30,
                )),
                ('nature_controle_detail', models.TextField(blank=True)),
                ('pourcentage_detention', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('date_prise_effet', models.DateField(blank=True, null=True)),
                ('actif', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('rbe', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='beneficiaires',
                    to='rbe.registrebe',
                )),
                ('nationalite', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='parametrage.nationalite',
                )),
            ],
            options={
                'verbose_name': 'Bénéficiaire effectif',
                'verbose_name_plural': 'Bénéficiaires effectifs',
                'db_table': 'rbe_beneficiaires',
                'ordering': ['-actif', 'nom', 'prenom'],
            },
        ),
        migrations.CreateModel(
            name='ActionHistoriqueRBE',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(
                    choices=[
                        ('CREATION', 'Création'),
                        ('MODIFICATION', 'Modification'),
                        ('ENVOI', 'Envoi au greffier'),
                        ('RETOUR', 'Retour pour correction'),
                        ('VALIDATION', 'Validation'),
                        ('RADIATION', 'Radiation'),
                    ],
                    max_length=20,
                )),
                ('commentaire', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('rbe', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='historique',
                    to='rbe.registrebe',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Historique RBE',
                'verbose_name_plural': 'Historique RBE',
                'db_table': 'rbe_historique',
                'ordering': ['-created_at'],
            },
        ),
    ]
