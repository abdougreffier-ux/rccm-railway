"""
Migration 0019 — Numérotation chronologique annuelle (règle RCCM)

Contexte légal :
  La règle RCCM impose que la numérotation chronologique soit ANNUELLE :
  le compteur est remis à 1 au 1er janvier de chaque nouvelle année.
  L'identifiant juridique d'un acte est le COUPLE (annee_chrono, numero_chrono).

Opérations :
  1. Ajout du champ annee_chrono (nullable — pour compatibilité données existantes).
  2. Rétro-remplissage (backfill) : annee_chrono ← YEAR(date_enregistrement)
     pour tous les enregistrements existants.
  3. Suppression de l'index unique global sur numero_chrono seul (un même numéro
     séquentiel peut désormais exister dans deux années différentes).
  4. Ajout de la contrainte UNIQUE composite (annee_chrono, numero_chrono).

Données existantes :
  Tous les enregistrements antérieurs à cette migration sont rétro-renseignés
  avec l'année de leur date_enregistrement — aucune donnée n'est perdue.

Imports :
  Les imports historiques passent par la table immatriculations_historiques
  (apps/historique) qui possède déjà annee_chrono et unique_together —
  cette migration ne les affecte PAS.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0018_fix_rc_valide_immatricule'),
    ]

    operations = [

        # ── Étape 1 : ajout du champ annee_chrono (nullable) ──────────────────
        migrations.AddField(
            model_name='registrechronologique',
            name='annee_chrono',
            field=models.IntegerField(
                null=True,
                blank=True,
                verbose_name='Année chronologique',
                db_index=True,
            ),
        ),

        # ── Étape 2 : rétro-remplissage depuis date_enregistrement ────────────
        # Tous les RC existants reçoivent l'année de leur date d'enregistrement.
        # Cette opération est irréversible (reverse : remet annee_chrono à NULL).
        migrations.RunSQL(
            sql="""
                UPDATE registre_chronologique
                SET    annee_chrono = EXTRACT(YEAR FROM date_enregistrement)::INTEGER
                WHERE  annee_chrono IS NULL;
            """,
            reverse_sql="""
                UPDATE registre_chronologique
                SET    annee_chrono = NULL;
            """,
        ),

        # ── Étape 3 : suppression de l'index unique global sur numero_chrono ──
        # Le numéro seul n'est plus unique globalement ; seul le couple
        # (annee_chrono, numero_chrono) l'est (étape 4).
        migrations.AlterField(
            model_name='registrechronologique',
            name='numero_chrono',
            field=models.CharField(
                max_length=30,
                verbose_name='N° chronologique',
                db_index=True,
            ),
        ),

        # ── Étape 4 : contrainte UNIQUE composite ─────────────────────────────
        # Garantit l'unicité juridique de l'identifiant (annee_chrono / numero_chrono).
        migrations.AlterUniqueTogether(
            name='registrechronologique',
            unique_together={('annee_chrono', 'numero_chrono')},
        ),

    ]
