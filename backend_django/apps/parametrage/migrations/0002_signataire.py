from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('parametrage', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Signataire',
            fields=[
                ('id',         models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom',        models.CharField(max_length=200, verbose_name='Nom du signataire')),
                ('nom_ar',     models.CharField(blank=True, max_length=200, verbose_name='Nom (arabe)')),
                ('qualite',    models.CharField(max_length=200, verbose_name='Qualité / Titre')),
                ('qualite_ar', models.CharField(blank=True, max_length=200, verbose_name='Qualité (arabe)')),
                ('actif',      models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name':        'Signataire',
                'verbose_name_plural': 'Signataires',
                'db_table':            'signataires',
            },
        ),
    ]
