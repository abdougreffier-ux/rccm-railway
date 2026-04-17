from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0005_document_immatriculation_hist_fk'),
        ('cessions_fonds', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='cession_fonds',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='documents',
                to='cessions_fonds.cessionfonds',
            ),
        ),
    ]
