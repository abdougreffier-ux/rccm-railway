"""
Migration 0004 — Séquences de numérotation : parité analytique + reset annuel chrono

Contexte légal :
  Règle RCCM de parité (non négociable) :
    • Personne physique  (PH) → numéro analytique PAIR   → séquence RA_PP
    • Personne morale    (PM) → numéro analytique IMPAIR → séquence RA_PM
    • Succursale         (SC) → numéro analytique IMPAIR → séquence RA_PM

  Règle RCCM chronologique (non négociable) :
    • La numérotation chronologique est ANNUELLE.
    • Le compteur CHRONO se remet à 1 au 1er janvier de chaque nouvelle année.

Opérations :
  1. Création de la séquence RA_PP (pair), initialisée au premier pair
     supérieur au dernier numéro émis par l'ancien compteur RA unifié.
  2. Création de la séquence RA_PM (impair), initialisée au dernier numéro
     émis par l'ancien compteur RA unifié (qui était déjà impair).
  3. Mise à jour de la séquence CHRONO : le champ annee est calé sur l'année
     courante pour activer la logique de reset annuel.

Compatibilité :
  L'ancienne séquence RA (compteur unifié impair) est conservée dans la table
  à titre de référence historique — elle ne sera plus incrémentée par le code.
  Les données existantes en production ne sont pas modifiées.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('parametrage', '0003_sequences_numerotation'),
    ]

    operations = [

        migrations.RunSQL(
            sql="""
                -- ── 1. Séquence RA_PP (Personnes Physiques → PAIR) ──────────────────────
                -- Initialisée au premier nombre pair SUPÉRIEUR au dernier numéro impair
                -- émis par l'ancien compteur RA.  Formule :
                --   Si RA.dernier_num est impair N → RA_PP démarre à N+1 (pair)
                --   Si RA.dernier_num est pair  N → RA_PP démarre à N+2 (pair suivant)
                --   Si la ligne RA n'existe pas encore → RA_PP démarre à 2
                INSERT INTO sequences_numerotation
                    (code, prefixe, annee, dernier_num, nb_chiffres)
                SELECT
                    'RA_PP',
                    '',
                    0,
                    CASE
                        WHEN ra.dernier_num IS NULL          THEN 2
                        WHEN ra.dernier_num % 2 = 1          THEN ra.dernier_num + 1
                        ELSE                                      ra.dernier_num + 2
                    END,
                    6
                FROM (
                    SELECT dernier_num
                    FROM   sequences_numerotation
                    WHERE  code = 'RA'
                    LIMIT  1
                ) AS ra
                RIGHT JOIN (SELECT 1) AS dummy ON true
                ON CONFLICT (code) DO NOTHING;

                -- ── 2. Séquence RA_PM (Personnes Morales + Succursales → IMPAIR) ────────
                -- Continue exactement là où l'ancien compteur RA s'est arrêté :
                -- le dernier numéro RA était déjà impair, on repart de ce même point.
                -- Si la ligne RA n'existe pas → RA_PM démarre à 1.
                INSERT INTO sequences_numerotation
                    (code, prefixe, annee, dernier_num, nb_chiffres)
                SELECT
                    'RA_PM',
                    '',
                    0,
                    COALESCE(
                        (SELECT dernier_num FROM sequences_numerotation WHERE code = 'RA'),
                        1
                    ),
                    6
                ON CONFLICT (code) DO NOTHING;

                -- ── 3. Séquence CHRONO — activer le reset annuel ────────────────────────
                -- Le champ annee était à 0 (héritage de la logique continue).
                -- On le cale sur l'année courante : dès le 1er janvier prochain,
                -- le code Python détectera annee != année courante et remettra à 1.
                UPDATE sequences_numerotation
                SET    annee = EXTRACT(YEAR FROM NOW())::INTEGER
                WHERE  code  = 'CHRONO'
                  AND  annee = 0;
            """,
            reverse_sql="""
                -- Suppression des deux nouvelles séquences
                DELETE FROM sequences_numerotation WHERE code IN ('RA_PP', 'RA_PM');
                -- Remise à 0 de l'année CHRONO
                UPDATE sequences_numerotation SET annee = 0 WHERE code = 'CHRONO';
            """,
        ),

    ]
