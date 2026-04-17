"""
Migration 0003: cleanup cession table
- Add 'observations' field (TextField)
- Remove old legacy fields: type_cession, prix_cession, description,
  cedant_ph, cedant_pm, cessionnaire_ph, cessionnaire_pm
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cessions', '0002_cession_workflow'),
        ('entites', '0001_initial'),
    ]

    operations = [
        # Add new field
        migrations.AddField(
            model_name='cession',
            name='observations',
            field=models.TextField(blank=True),
        ),
        # Remove old legacy fields
        migrations.RemoveField(model_name='cession', name='type_cession'),
        migrations.RemoveField(model_name='cession', name='prix_cession'),
        migrations.RemoveField(model_name='cession', name='description'),
        migrations.RemoveField(model_name='cession', name='cedant_ph'),
        migrations.RemoveField(model_name='cession', name='cedant_pm'),
        migrations.RemoveField(model_name='cession', name='cessionnaire_ph'),
        migrations.RemoveField(model_name='cession', name='cessionnaire_pm'),
    ]
