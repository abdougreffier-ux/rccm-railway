from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ReleveGuichetUnique',
            fields=[
                ('id',           models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('annee',        models.IntegerField(verbose_name='Année')),
                ('mois',         models.IntegerField(verbose_name='Mois')),
                ('statut',       models.CharField(
                    choices=[('BROUILLON', 'Brouillon'), ('FINALISE', 'Finalisé')],
                    db_index=True, default='BROUILLON', max_length=20,
                )),
                ('nb_ph',        models.IntegerField(default=0, verbose_name='Immatriculations PH')),
                ('nb_pm',        models.IntegerField(default=0, verbose_name='Immatriculations PM')),
                ('nb_sc',        models.IntegerField(default=0, verbose_name='Immatriculations SC')),
                ('nb_total',     models.IntegerField(default=0, verbose_name='Total immatriculations')),
                ('contenu_json', models.JSONField(default=dict, verbose_name='Contenu figé (JSON)')),
                ('genere_le',    models.DateTimeField(auto_now_add=True)),
                ('finalise_le',  models.DateTimeField(blank=True, null=True)),
                ('genere_par', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='releves_gu_generes',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('finalise_par', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='releves_gu_finalises',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name':        'Relevé mensuel Guichet unique',
                'verbose_name_plural': 'Relevés mensuels Guichet unique',
                'db_table':            'releves_guichet_unique',
                'ordering':            ['-annee', '-mois'],
                'unique_together':     {('annee', 'mois')},
            },
        ),
    ]
