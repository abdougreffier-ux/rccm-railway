"""
Migration de données : supprime le préfixe 'RA' du numéro analytique.

- Tous les RegistreAnalytique dont numero_ra commence par 'RA' sont mis à jour :
  'RA000013' → '000013'
- La séquence de numérotation est mise à jour pour ne plus utiliser de préfixe.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('registres',   '0004_action_historique_immat'),
        # sequences_numerotation est une table SQL pure (hors modèle Django).
        # En Railway (sans Docker/schema.sql), elle doit être créée par migration.
        ('parametrage', '0003_sequences_numerotation'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                -- Supprimer le préfixe 'RA' de tous les numéros analytiques existants
                UPDATE registre_analytique
                SET numero_ra = SUBSTRING(numero_ra FROM 3)
                WHERE numero_ra LIKE 'RA%';

                -- Mettre à jour la séquence pour ne plus utiliser de préfixe
                UPDATE sequences_numerotation
                SET prefixe = ''
                WHERE code = 'RA';
            """,
            reverse_sql="""
                -- Restaurer le préfixe 'RA' (annulation de la migration)
                UPDATE registre_analytique
                SET numero_ra = 'RA' || numero_ra
                WHERE numero_ra NOT LIKE 'RA%'
                  AND numero_ra ~ '^[0-9]+$';

                UPDATE sequences_numerotation
                SET prefixe = 'RA'
                WHERE code = 'RA';
            """,
        ),
    ]
