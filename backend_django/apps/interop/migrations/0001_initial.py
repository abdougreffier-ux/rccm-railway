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
            name='SystemeExterne',
            fields=[
                ('id',                models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('code',              models.CharField(max_length=50, unique=True, verbose_name='Code système')),
                ('libelle',           models.CharField(max_length=200, verbose_name='Libellé')),
                ('libelle_ar',        models.CharField(blank=True, max_length=200, verbose_name='Libellé (arabe)')),
                ('type_systeme',      models.CharField(
                    choices=[
                        ('KHIDMATY',         'Portail usager KHIDMATY'),
                        ('ANRPTS',           "ANRPTS — Autorité Nationale d'État Civil"),
                        ('DGI',              'Direction Générale des Impôts'),
                        ('CNSS',             'Caisse Nationale de Sécurité Sociale'),
                        ('APIM',             'APIM — Guichet Unique des Entreprises'),
                        ('REGISTRE_CENTRAL', 'Registre Central du Commerce (consolidation nationale)'),
                        ('AUTRE',            'Autre administration / partenaire'),
                    ],
                    default='AUTRE', max_length=30, verbose_name='Type de système',
                )),
                ('actif',             models.BooleanField(default=True, verbose_name='Actif')),
                ('ip_autorises',      models.JSONField(blank=True, default=list, verbose_name='IPs autorisées (whitelist CIDR/IPv4)')),
                ('scopes',            models.JSONField(blank=True, default=list, verbose_name='Scopes autorisés')),
                ('description',       models.TextField(blank=True)),
                ('contact_technique', models.EmailField(blank=True, verbose_name='Contact technique')),
                ('url_documentation', models.URLField(blank=True, verbose_name='URL documentation API partenaire')),
                ('created_at',        models.DateTimeField(auto_now_add=True)),
                ('updated_at',        models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name':        'Système externe',
                'verbose_name_plural': 'Systèmes externes',
                'db_table':            'interop_systeme_externe',
                'ordering':            ['code'],
            },
        ),
        migrations.CreateModel(
            name='CleAPIExterne',
            fields=[
                ('id',                   models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('cle_hachee',           models.CharField(max_length=64, unique=True, verbose_name='Clé hachée (SHA-256, 64 hex chars)')),
                ('prefixe',              models.CharField(max_length=12, verbose_name='Préfixe public')),
                ('libelle',              models.CharField(blank=True, max_length=200, verbose_name='Libellé')),
                ('actif',                models.BooleanField(default=True, verbose_name='Active')),
                ('scopes',               models.JSONField(blank=True, default=list, verbose_name='Scopes spécifiques à cette clé')),
                ('date_expiration',      models.DateTimeField(blank=True, null=True, verbose_name="Date d'expiration")),
                ('derniere_utilisation', models.DateTimeField(blank=True, null=True, verbose_name='Dernière utilisation')),
                ('nb_appels_total',      models.BigIntegerField(default=0, verbose_name='Nb appels total')),
                ('created_at',           models.DateTimeField(auto_now_add=True)),
                ('systeme', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='cles',
                    to='interop.systemeexterne',
                    verbose_name='Système',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='cles_api_creees',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Créée par',
                )),
            ],
            options={
                'verbose_name':        'Clé API externe',
                'verbose_name_plural': 'Clés API externes',
                'db_table':            'interop_cle_api_externe',
                'ordering':            ['systeme__code', 'prefixe'],
            },
        ),
        migrations.CreateModel(
            name='JournalAppelExterne',
            fields=[
                ('id',          models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('methode',     models.CharField(max_length=10, verbose_name='Méthode HTTP')),
                ('endpoint',    models.CharField(max_length=500, verbose_name='Endpoint appelé')),
                ('ip_appelant', models.GenericIPAddressField(blank=True, null=True, verbose_name='IP appelant')),
                ('statut_http', models.IntegerField(verbose_name='Code HTTP réponse')),
                ('duree_ms',    models.IntegerField(blank=True, null=True, verbose_name='Durée traitement (ms)')),
                ('parametres',  models.JSONField(blank=True, default=dict, verbose_name='Paramètres requête (résumé)')),
                ('erreur',      models.TextField(blank=True, verbose_name='Détail erreur')),
                ('created_at',  models.DateTimeField(auto_now_add=True, db_index=True)),
                ('systeme', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='appels',
                    to='interop.systemeexterne',
                    verbose_name='Système appelant',
                )),
                ('cle', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='appels',
                    to='interop.cleapiexterne',
                    verbose_name='Clé API utilisée',
                )),
            ],
            options={
                'verbose_name':        'Journal appel externe',
                'verbose_name_plural': 'Journal appels externes',
                'db_table':            'interop_journal_appel_externe',
                'ordering':            ['-created_at'],
                'indexes': [
                    models.Index(fields=['systeme', 'created_at'], name='interop_jrnl_sys_idx'),
                    models.Index(fields=['statut_http', 'created_at'], name='interop_jrnl_status_idx'),
                ],
            },
        ),
    ]
