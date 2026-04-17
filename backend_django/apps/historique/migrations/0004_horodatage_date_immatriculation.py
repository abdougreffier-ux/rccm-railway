# -*- coding: utf-8 -*-
"""
Migration 0004 — Horodatage RCCM : DateField → DateTimeField pour
ImmatriculationHistorique.date_immatriculation.

L'heure était précédemment stockée sous forme de chaîne dans le champ JSON
`donnees.heure_immatriculation`. Elle est désormais intégrée directement dans
le champ DateTimeField, ce qui permet un horodatage précis et immutable.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('historique', '0003_historique_demandeur'),
    ]

    operations = [
        migrations.AlterField(
            model_name='immatriculationhistorique',
            name='date_immatriculation',
            field=models.DateTimeField(
                verbose_name="Date et heure d'immatriculation",
            ),
        ),
    ]
