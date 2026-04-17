from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('rbe', '0001_initial'),
        ('registres', '0007_statut_be'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── 1. Table EntiteJuridique ──────────────────────────────────────────
        migrations.CreateModel(
            name='EntiteJuridique',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uuid', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('type_entite', models.CharField(
                    choices=[
                        ('SOCIETE',     'Société commerciale'),
                        ('SUCCURSALE',  'Succursale de société étrangère'),
                        ('ASSOCIATION', 'Association'),
                        ('ONG',         'ONG'),
                        ('FONDATION',   'Fondation'),
                        ('FIDUCIE',     'Fiducie / Construction juridique'),
                    ],
                    db_index=True, max_length=20,
                )),
                ('denomination', models.CharField(max_length=300, verbose_name='Dénomination (FR)')),
                ('denomination_ar', models.CharField(blank=True, max_length=300, verbose_name='Dénomination (AR)')),
                ('source_entite', models.CharField(
                    choices=[('RC', 'Registre du Commerce'), ('HORS_RC', 'Hors Registre du Commerce')],
                    db_index=True, default='HORS_RC', max_length=10,
                )),
                ('numero_rc', models.CharField(blank=True, max_length=50, verbose_name='N° RC')),
                ('autorite_enregistrement', models.CharField(
                    choices=[
                        ('RC',        'Registre du Commerce'),
                        ('MINISTERE', 'Ministère'),
                        ('TRIBUNAL',  'Tribunal'),
                        ('AUTRE',     'Autre autorité'),
                    ],
                    default='AUTRE', max_length=20,
                    verbose_name="Autorité d'enregistrement",
                )),
                ('numero_enregistrement', models.CharField(blank=True, max_length=100, verbose_name="N° d'enregistrement")),
                ('date_creation', models.DateField(blank=True, null=True, verbose_name='Date de création')),
                ('pays', models.CharField(default='Mauritanie', max_length=100, verbose_name='Pays')),
                ('siege_social', models.TextField(blank=True, verbose_name='Siège social / Adresse')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('ra', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='entite_juridique', to='registres.registreanalytique',
                    verbose_name='Registre analytique lié',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='entites_juridiques_creees', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Entité juridique',
                'verbose_name_plural': 'Entités juridiques',
                'db_table': 'rbe_entites_juridiques',
                'ordering': ['-created_at'],
            },
        ),

        # ── 2. Table NatureControle ───────────────────────────────────────────
        migrations.CreateModel(
            name='NatureControle',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type_controle', models.CharField(
                    choices=[
                        ('DETENTION_DIRECTE',    'Détention directe (≥ 20 %)'),
                        ('DETENTION_INDIRECTE',  'Détention indirecte'),
                        ('CONTROLE',             'Contrôle (autre mécanisme)'),
                        ('DIRIGEANT_PAR_DEFAUT', 'Dirigeant par défaut'),
                    ],
                    max_length=30,
                )),
                ('pourcentage', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('description', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('beneficiaire', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='natures_controle', to='rbe.beneficiaireeffectif',
                )),
            ],
            options={
                'verbose_name': 'Nature de contrôle',
                'verbose_name_plural': 'Natures de contrôle',
                'db_table': 'rbe_natures_controle',
            },
        ),

        # ── 3. Champs additionnels sur RegistreBE ─────────────────────────────
        migrations.AddField(
            model_name='registrebe',
            name='entite',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='declarations', to='rbe.entitejuridique',
                verbose_name='Entité juridique',
            ),
        ),
        migrations.AddField(
            model_name='registrebe',
            name='mode_declaration',
            field=models.CharField(
                blank=True,
                choices=[
                    ('IMMEDIATE', 'Déclaration immédiate'),
                    ('DIFFEREE',  'Déclaration différée (15 jours)'),
                ],
                default='IMMEDIATE', max_length=20,
                verbose_name='Mode de déclaration',
            ),
        ),
        migrations.AddField(
            model_name='registrebe',
            name='date_limite',
            field=models.DateField(
                blank=True, null=True,
                verbose_name='Date limite de déclaration',
            ),
        ),

        # ── 4. Étendre choices type_entite sur RegistreBE ─────────────────────
        migrations.AlterField(
            model_name='registrebe',
            name='type_entite',
            field=models.CharField(
                max_length=30,
                choices=[
                    ('SOCIETE',                'Société commerciale'),
                    ('SUCCURSALE',             'Succursale de société étrangère'),
                    ('ASSOCIATION',            'Association'),
                    ('ONG',                    'ONG'),
                    ('FONDATION',              'Fondation'),
                    ('FIDUCIE',                'Fiducie / Construction juridique'),
                    ('CONSTRUCTION_JURIDIQUE', 'Construction juridique / Fiducie'),
                ],
            ),
        ),

        # ── 5. Champs additionnels sur BeneficiaireEffectif ───────────────────
        migrations.AddField(
            model_name='beneficiaireeffectif',
            name='domicile',
            field=models.TextField(blank=True, verbose_name='Domicile'),
        ),
        migrations.AddField(
            model_name='beneficiaireeffectif',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),

        # ── 6. Étendre nature_controle sur BeneficiaireEffectif ───────────────
        migrations.AlterField(
            model_name='beneficiaireeffectif',
            name='nature_controle',
            field=models.CharField(
                blank=True, max_length=30,
                choices=[
                    ('DETENTION_DIRECTE',       'Détention directe (≥ 20 % des parts / droits de vote)'),
                    ('DETENTION_INDIRECTE',     'Détention indirecte'),
                    ('CONTROLE',                'Contrôle (autre mécanisme)'),
                    ('DIRIGEANT_PAR_DEFAUT',    'Dirigeant par défaut (aucun autre BE identifié)'),
                    ('BENEFICIAIRE_BIENS',      'Bénéficiaire des biens (≥ 20 %)'),
                    ('GROUPE_BENEFICIAIRE',     'Appartenance à un groupe de bénéficiaires'),
                    ('CONTROLEUR_ASSO',         "Contrôleur de l'association"),
                    ('BENEFICIAIRE_ACTUEL',     'Bénéficiaire actuel de la fiducie'),
                    ('BENEFICIAIRE_CATEGORIE',  'Appartenance à une catégorie de bénéficiaires'),
                    ('CONTROLEUR_FINAL',        'Contrôleur final de la fiducie'),
                    ('CONTROLE_DERNIER_RESSORT','Contrôle en dernier ressort (fondation)'),
                    ('REPRESENTANT_LEGAL',      'Représentant légal'),
                    ('AUTRE',                   'Autre'),
                ],
            ),
        ),

        # ── 7. Champs additionnels sur ActionHistoriqueRBE ────────────────────
        migrations.AddField(
            model_name='actionhistoriquerbe',
            name='ancien_etat',
            field=models.JSONField(blank=True, null=True, verbose_name='État avant'),
        ),
        migrations.AddField(
            model_name='actionhistoriquerbe',
            name='nouvel_etat',
            field=models.JSONField(blank=True, null=True, verbose_name='État après'),
        ),
    ]
