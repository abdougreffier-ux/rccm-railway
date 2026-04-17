# -*- coding: utf-8 -*-
"""
Migration 0003 — Horodatage RCCM : DateField → DateTimeField pour CessionFonds.date_cession.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions_fonds', '0002_cession_fonds_demandeur'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cessionfonds',
            name='date_cession',
            field=models.DateTimeField(
                verbose_name='Date et heure de cession',
            ),
        ),
    ]
