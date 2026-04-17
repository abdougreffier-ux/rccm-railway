from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0004_document_radiation_fk'),
        ('historique', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='immatriculation_hist',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='documents',
                to='historique.immatriculationhistorique',
            ),
        ),
    ]
