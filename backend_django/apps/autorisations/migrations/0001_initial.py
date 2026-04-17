import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DemandeAutorisation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type_demande',  models.CharField(choices=[('IMPRESSION', 'Impression'), ('CORRECTION', 'Correction')], max_length=20)),
                ('type_dossier',  models.CharField(choices=[('RA', 'Registre Analytique'), ('HISTORIQUE', 'Immatriculation Historique')], max_length=20)),
                ('dossier_id',    models.IntegerField(help_text='PK du dossier concerné (RA ou Historique)')),
                ('document_type', models.CharField(blank=True, choices=[('EXTRAIT_RA', "Extrait d'immatriculation (RA)"), ('EXTRAIT_RC_COMPLET', 'Extrait RC complet'), ('', 'N/A — Correction')], default='', help_text='Renseigné uniquement pour les demandes de type IMPRESSION', max_length=30)),
                ('motif',         models.TextField(help_text="Motif obligatoire fourni par l'agent")),
                ('statut',        models.CharField(choices=[('EN_ATTENTE', 'En attente'), ('AUTORISEE', 'Autorisée'), ('REFUSEE', 'Refusée'), ('EXPIREE', 'Expirée')], db_index=True, default='EN_ATTENTE', max_length=20)),
                ('motif_decision', models.TextField(blank=True, default='', help_text='Commentaire du greffier lors de sa décision')),
                ('date_demande',   models.DateTimeField(auto_now_add=True)),
                ('date_decision',  models.DateTimeField(blank=True, null=True)),
                ('date_expiration', models.DateTimeField(blank=True, help_text="Pour IMPRESSION : timestamp d'expiration (date_decision + 20 min)", null=True)),
                ('demandeur', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='demandes_autorisation',   to=settings.AUTH_USER_MODEL)),
                ('decideur',  models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decisions_autorisation', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name':        "Demande d'autorisation",
                'verbose_name_plural': "Demandes d'autorisation",
                'ordering': ['-date_demande'],
            },
        ),
        migrations.AddIndex(
            model_name='demandeautorisation',
            index=models.Index(fields=['demandeur', 'type_dossier', 'dossier_id', 'statut'], name='autoris_demandeur_dossier_idx'),
        ),
    ]
