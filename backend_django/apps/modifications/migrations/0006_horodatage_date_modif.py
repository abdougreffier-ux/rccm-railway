# -*- coding: utf-8 -*-
"""
Migration 0006 — Horodatage RCCM : DateField → DateTimeField pour date_modif.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('modifications', '0005_modification_demandeur'),
    ]

    operations = [
        migrations.AlterField(
            model_name='modification',
            name='date_modif',
            field=models.DateTimeField(
                auto_now_add=True,
                verbose_name='Date et heure de la modification',
            ),
        ),
    ]
