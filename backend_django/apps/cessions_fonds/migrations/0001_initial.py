import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('registres', '0010_numero_ra_nullable'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CessionFonds',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uuid', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('numero_cession_fonds', models.CharField(max_length=30, unique=True)),
                ('date_cession', models.DateField(verbose_name='Date de cession')),
                ('type_acte', models.CharField(choices=[('NOTARIE', 'Acte notarié'), ('SEING_PRIVE', 'Acte sous seing privé')], max_length=20)),
                ('observations', models.TextField(blank=True)),
                ('cessionnaire_data', models.JSONField(blank=True, default=dict)),
                ('snapshot_cedant', models.JSONField(blank=True, default=dict)),
                ('cessionnaire_ph_id', models.IntegerField(blank=True, null=True)),
                ('statut', models.CharField(
                    choices=[
                        ('BROUILLON', 'Brouillon'),
                        ('EN_INSTANCE', 'En instance de validation'),
                        ('RETOURNE', 'Retourné'),
                        ('VALIDE', 'Validé'),
                        ('ANNULE', 'Annulé'),
                        ('ANNULE_GREFFIER', 'Annulé par le greffier'),
                    ],
                    db_index=True, default='BROUILLON', max_length=20,
                )),
                ('corrections', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('validated_at', models.DateTimeField(blank=True, null=True)),
                ('ra', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='cessions_fonds',
                    to='registres.registreanalytique',
                )),
                ('chrono', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='registres.registrechronologique',
                )),
                ('validated_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='cessions_fonds_validees',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='cessions_fonds_creees',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Cession de fonds de commerce',
                'verbose_name_plural': 'Cessions de fonds de commerce',
                'db_table': 'cessions_fonds',
                'ordering': ['-created_at'],
            },
        ),
    ]
