from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Ajout du champ `civilite` sur PersonnePhysique.

    Opération : AddField(blank=True) — NON DESTRUCTIVE.
    Les enregistrements existants reçoivent civilite='' (chaîne vide).

    Comportement documenté pour les enregistrements existants :
      • Affichage listes/tables     : "Prénom Nom"  (sans préfixe)
      • Propriété nom_complet       : "Prénom Nom"  (sans préfixe)
      • PDFs (extrait RC, certificat): "Prénom Nom"  (strip() absorbe l'espace)
      • Formulaire édition          : Select vide → civilité requise à la prochaine
                                      modification (complétion progressive)

    Aucune incohérence documentaire : un PDF regénéré sur un dossier non modifié
    est strictement identique à celui produit avant cette migration.

    Documentation complète : web/CIVILITE_EXISTANTS.md
    Gouvernance déploiement : web/DEPLOIEMENT.md
    """

    dependencies = [
        ('entites', '0002_profession_textfield'),
    ]

    operations = [
        migrations.AddField(
            model_name='personnephysique',
            name='civilite',
            field=models.CharField(
                blank=True,
                choices=[('MR', 'M.'), ('MME', 'Mme'), ('MLLE', 'Mlle')],
                max_length=5,
                verbose_name='Civilité',
            ),
        ),
    ]
