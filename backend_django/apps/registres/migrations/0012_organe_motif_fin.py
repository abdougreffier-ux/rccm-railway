"""
Migration 0012 — Ajout de motif_fin et ref_decision aux modèles organes.

Ces champs permettent d'historiser juridiquement les sorties d'organes sociaux :
  - motif_fin  : DEMISSION | REVOCATION | FIN_MANDAT
  - ref_decision : référence de la délibération (AG, CA…)
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0011_administrateur_commissaire_comptes'),
    ]

    operations = [
        # ── Gerant ────────────────────────────────────────────────────────────
        migrations.AddField(
            model_name='gerant',
            name='motif_fin',
            field=models.CharField(
                blank=True, max_length=20,
                verbose_name='Motif de fin',
                help_text='DEMISSION | REVOCATION | FIN_MANDAT',
            ),
        ),
        migrations.AddField(
            model_name='gerant',
            name='ref_decision',
            field=models.CharField(
                blank=True, max_length=200,
                verbose_name='Référence de la décision',
            ),
        ),
        # ── Administrateur (SA) ───────────────────────────────────────────────
        migrations.AddField(
            model_name='administrateur',
            name='motif_fin',
            field=models.CharField(
                blank=True, max_length=20,
                verbose_name='Motif de fin',
                help_text='DEMISSION | REVOCATION | FIN_MANDAT',
            ),
        ),
        migrations.AddField(
            model_name='administrateur',
            name='ref_decision',
            field=models.CharField(
                blank=True, max_length=200,
                verbose_name='Référence de la décision',
            ),
        ),
        # ── CommissaireComptes (SA) ───────────────────────────────────────────
        migrations.AddField(
            model_name='commissairecomptes',
            name='motif_fin',
            field=models.CharField(
                blank=True, max_length=20,
                verbose_name='Motif de fin',
                help_text='DEMISSION | REVOCATION | FIN_MANDAT',
            ),
        ),
        migrations.AddField(
            model_name='commissairecomptes',
            name='ref_decision',
            field=models.CharField(
                blank=True, max_length=200,
                verbose_name='Référence de la décision',
            ),
        ),
    ]
