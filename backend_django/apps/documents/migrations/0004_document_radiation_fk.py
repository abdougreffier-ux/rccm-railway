from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('radiations', '0001_initial'),
        ('documents', '0003_document_modification_cession'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='radiation',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='documents',
                to='radiations.radiation',
            ),
        ),
    ]
