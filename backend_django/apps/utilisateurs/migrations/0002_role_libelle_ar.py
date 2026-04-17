from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('utilisateurs', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='libelle_ar',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
