from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0001_initial'),
        ('utilisateurs', '0001_initial'),
    ]

    operations = [
        # 1. Elargir statut max_length et mettre à jour les choices + default
        migrations.AlterField(
            model_name='registreanalytique',
            name='statut',
            field=models.CharField(
                choices=[
                    ('BROUILLON',              'Brouillon'),
                    ('EN_INSTANCE_VALIDATION', 'En instance de validation'),
                    ('RETOURNE',               'Retourné'),
                    ('EN_COURS',               'En cours'),
                    ('IMMATRICULE',            'Immatriculé'),
                    ('RADIE',                  'Radié'),
                    ('SUSPENDU',               'Suspendu'),
                    ('ANNULE',                 'Annulé'),
                ],
                db_index=True,
                default='BROUILLON',
                max_length=30,
            ),
        ),

        # 2. Ajouter le champ observations_greffier
        migrations.AddField(
            model_name='registreanalytique',
            name='observations_greffier',
            field=models.TextField(blank=True, verbose_name='Observations greffier'),
        ),

        # 3. Créer le modèle ActionHistorique
        migrations.CreateModel(
            name='ActionHistorique',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(
                    choices=[
                        ('CREATION',   'Création'),
                        ('COMPLETION', 'Complétion'),
                        ('ENVOI',      'Envoi au greffier'),
                        ('RETOUR',     "Retour à l'agent"),
                        ('VALIDATION', 'Validation / Immatriculation'),
                    ],
                    max_length=30,
                )),
                ('commentaire', models.TextField(blank=True)),
                ('created_at',  models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='utilisateurs.utilisateur',
                )),
                ('ra', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='historique',
                    to='registres.registreanalytique',
                )),
            ],
            options={
                'db_table': 'ra_historique',
                'ordering': ['-created_at'],
                'verbose_name': 'Action historique',
                'verbose_name_plural': 'Historique des actions',
            },
        ),
    ]
