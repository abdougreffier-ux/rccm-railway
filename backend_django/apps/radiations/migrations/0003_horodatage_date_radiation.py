# -*- coding: utf-8 -*-
"""
Migration 0003 — Horodatage RCCM : DateField → DateTimeField pour date_radiation.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('radiations', '0002_radiation_demandeur'),
    ]

    operations = [
        migrations.AlterField(
            model_name='radiation',
            name='date_radiation',
            field=models.DateTimeField(
                auto_now_add=True,
                verbose_name='Date et heure de la radiation',
            ),
        ),
    ]
