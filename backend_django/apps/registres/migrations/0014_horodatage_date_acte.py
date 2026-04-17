# -*- coding: utf-8 -*-
"""
Migration 0014 — Horodatage RCCM (date + heure)
================================================

Convertit les champs DateField en DateTimeField pour le RegistreChronologique :
  • date_acte           : l'horodatage légal de l'acte (date + heure)
  • date_enregistrement : l'horodatage système de l'enregistrement

Les lignes existantes verront leur date convertie en minuit UTC (comportement
standard PostgreSQL / SQLite lors du passage DATE → TIMESTAMP).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0013_civilite_registres'),
    ]

    operations = [
        migrations.AlterField(
            model_name='registrechronologique',
            name='date_acte',
            field=models.DateTimeField(
                verbose_name="Date et heure de l'acte",
            ),
        ),
        migrations.AlterField(
            model_name='registrechronologique',
            name='date_enregistrement',
            field=models.DateTimeField(
                auto_now_add=True,
                verbose_name="Date et heure d'enregistrement",
            ),
        ),
    ]
