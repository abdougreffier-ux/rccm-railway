"""
Migration : création de la table sequences_numerotation et de la fonction generer_numero.

En déploiement Docker, ces objets sont créés par schema.sql (initdb).
En déploiement Railway/direct (sans Docker), les migrations Django sont la
seule source de vérité — cette migration crée donc les objets SQL "hors modèle".

Utilise IF NOT EXISTS / CREATE OR REPLACE pour rester idempotente et ne pas
casser les environnements Docker existants où la table est déjà présente.
"""

from django.db import migrations


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sequences_numerotation (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50) UNIQUE NOT NULL,
    prefixe     VARCHAR(20),
    annee       INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
    dernier_num INTEGER DEFAULT 0,
    nb_chiffres INTEGER DEFAULT 6,
    localite_id INTEGER REFERENCES localites(id),
    updated_at  TIMESTAMP DEFAULT NOW()
);
"""

SEED_SQL = """
INSERT INTO sequences_numerotation (code, prefixe, annee, dernier_num, nb_chiffres) VALUES
  ('RA',     'RA',  EXTRACT(YEAR FROM NOW()), 0, 6),
  ('CHRONO', 'RC',  EXTRACT(YEAR FROM NOW()), 0, 6),
  ('DMD',    'DMD', EXTRACT(YEAR FROM NOW()), 0, 6),
  ('DEP',    'DEP', EXTRACT(YEAR FROM NOW()), 0, 6),
  ('MOD',    'MOD', EXTRACT(YEAR FROM NOW()), 0, 6),
  ('RAD',    'RAD', EXTRACT(YEAR FROM NOW()), 0, 6),
  ('CES',    'CES', EXTRACT(YEAR FROM NOW()), 0, 6)
ON CONFLICT (code) DO NOTHING;
"""

CREATE_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION generer_numero(p_code VARCHAR, p_localite_id INTEGER DEFAULT NULL)
RETURNS VARCHAR AS $$
DECLARE
    v_seq        sequences_numerotation%%ROWTYPE;
    v_annee      INTEGER;
    v_num        INTEGER;
    v_resultat   VARCHAR;
BEGIN
    v_annee := EXTRACT(YEAR FROM NOW());

    SELECT * INTO v_seq
    FROM sequences_numerotation
    WHERE code = p_code
    AND (localite_id = p_localite_id OR (localite_id IS NULL AND p_localite_id IS NULL))
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Séquence % non trouvée', p_code;
    END IF;

    IF v_seq.annee != v_annee THEN
        UPDATE sequences_numerotation
        SET annee = v_annee, dernier_num = 1, updated_at = NOW()
        WHERE code = p_code;
        v_num := 1;
    ELSE
        v_num := v_seq.dernier_num + 1;
        UPDATE sequences_numerotation
        SET dernier_num = v_num, updated_at = NOW()
        WHERE code = p_code;
    END IF;

    v_resultat := COALESCE(v_seq.prefixe, '') ||
                  v_annee::TEXT ||
                  LPAD(v_num::TEXT, v_seq.nb_chiffres, '0');
    RETURN v_resultat;
END;
$$ LANGUAGE plpgsql;
"""

DROP_FUNCTION_SQL = "DROP FUNCTION IF EXISTS generer_numero(VARCHAR, INTEGER);"
DROP_TABLE_SQL    = "DROP TABLE IF EXISTS sequences_numerotation;"


class Migration(migrations.Migration):

    dependencies = [
        ('parametrage', '0002_signataire'),
    ]

    operations = [
        migrations.RunSQL(
            sql     = CREATE_TABLE_SQL + SEED_SQL + CREATE_FUNCTION_SQL,
            reverse_sql = DROP_FUNCTION_SQL + DROP_TABLE_SQL,
        ),
    ]
