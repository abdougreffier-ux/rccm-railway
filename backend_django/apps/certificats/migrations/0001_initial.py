from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('registres', '0013_civilite_registres'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CertificatGreffier',
            fields=[
                ('id',              models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('numero',          models.CharField(editable=False, max_length=30, unique=True, verbose_name='Numéro de certificat')),
                ('type_certificat', models.CharField(
                    choices=[
                        ('NON_FAILLITE',             'Certificat de non faillite'),
                        ('NON_LITIGE',               'Certificat de non litige'),
                        ('NEG_PRIVILEGES',           'Certificat négatif de privilèges et de nantissements'),
                        ('ABS_PROCEDURE_COLLECTIVE', "Certificat d'absence de procédure collective"),
                        ('NON_LIQUIDATION',          'Certificat de non liquidation judiciaire'),
                    ],
                    max_length=30, verbose_name='Type de certificat',
                )),
                ('observations',    models.TextField(blank=True, verbose_name='Observations')),
                ('date_delivrance', models.DateTimeField(auto_now_add=True, verbose_name='Date de délivrance')),
                ('ra',              models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='certificats_greffier',
                    to='registres.registreanalytique',
                    verbose_name='Entité (RA)',
                )),
                ('delivre_par',     models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='certificats_delivres',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Délivré par (greffier)',
                )),
            ],
            options={
                'verbose_name':        'Certificat greffier',
                'verbose_name_plural': 'Certificats greffier',
                'db_table':            'certificats_greffier',
                'ordering':            ['-date_delivrance'],
            },
        ),
    ]
