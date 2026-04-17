"""
Migration vide — heure_immatriculation est stockée dans le champ JSONField `donnees`
et non comme colonne séparée.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('historique', '0001_initial'),
    ]

    operations = []
