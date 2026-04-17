# -*- coding: utf-8 -*-
"""
Migration 0007 — Horodatage RCCM : DateField → DateTimeField pour date_cession.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0006_cession_demandeur'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cession',
            name='date_cession',
            field=models.DateTimeField(
                auto_now_add=True,
                verbose_name='Date et heure de la cession',
            ),
        ),
    ]
