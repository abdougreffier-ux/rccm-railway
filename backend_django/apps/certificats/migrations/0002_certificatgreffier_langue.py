from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Ajoute le champ `langue` (FR/AR) au modèle CertificatGreffier.

    Règle RCCM : un certificat est délivré dans une seule langue, figée
    à la délivrance. Il est interdit de proposer une version bilingue ou
    de basculer la langue après coup.

    Les certificats existants reçoivent la valeur 'FR' par défaut,
    ce qui reflète leur contexte de délivrance présumé.
    Aucune donnée n'est détruite.
    """

    dependencies = [
        ('certificats', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='certificatgreffier',
            name='langue',
            field=models.CharField(
                choices=[('FR', 'Français'), ('AR', 'Arabe / عربي')],
                default='FR',
                editable=False,
                help_text=(
                    "Langue figée à la délivrance. "
                    "Un nouveau certificat doit être délivré pour obtenir "
                    "une version dans l'autre langue."
                ),
                max_length=2,
                verbose_name='Langue du certificat',
            ),
        ),
    ]
