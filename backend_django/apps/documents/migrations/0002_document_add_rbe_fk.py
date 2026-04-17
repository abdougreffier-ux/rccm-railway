from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0001_initial'),
        ('rbe', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='rbe',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='documents',
                to='rbe.registrebe',
            ),
        ),
    ]
