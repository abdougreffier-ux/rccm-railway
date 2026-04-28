"""
Migration corrective : RC immatriculation invisibles après validation RA.

Contexte (bug signalé le 2026-04-28) :
  Quand l'agent envoyait le RA au greffier via EnvoyerRAView (sans passer
  par EnvoyerRChronoView), le RC d'immatriculation restait en BROUILLON.
  La vue ValiderRAView ne mettait à jour que les RC en EN_INSTANCE, donc
  les RC en BROUILLON/RETOURNE n'étaient jamais basculés en VALIDE.

  Résultat : l'agent ne voyait aucun dossier dans le filtre "Validé" du
  registre chronologique, alors que le RA associé était bien IMMATRICULE.

Correction :
  Pour chaque RC d'immatriculation en BROUILLON, EN_INSTANCE ou RETOURNE
  dont le RA est IMMATRICULE, on force statut → VALIDE et on hérite les
  champs validated_at / validated_by du RA (premier validateur trouvé).
"""

from django.db import migrations
from django.utils import timezone


def fix_rc_valide_immatricule(apps, schema_editor):
    RegistreChronologique = apps.get_model('registres', 'RegistreChronologique')
    RegistreAnalytique    = apps.get_model('registres', 'RegistreAnalytique')

    # Tous les RA déjà immatriculés
    ras_immatricules = RegistreAnalytique.objects.filter(statut='IMMATRICULE')

    corriges = 0
    for ra in ras_immatricules:
        now = ra.validated_at or timezone.now()
        validated_by = ra.validated_by  # peut être None si données ancienneset

        nb = RegistreChronologique.objects.filter(
            ra=ra,
            type_acte='IMMATRICULATION',
            statut__in=('BROUILLON', 'EN_INSTANCE', 'RETOURNE'),
        ).update(
            statut='VALIDE',
            validated_at=now,
            validated_by=validated_by,
        )
        corriges += nb

    if corriges:
        print(f'\n  [0018] {corriges} RC(s) IMMATRICULATION corrigé(s) → VALIDE')
    else:
        print('\n  [0018] Aucun RC à corriger (données déjà cohérentes)')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0017_fix_langue_acte_arabic_v2'),
    ]

    operations = [
        migrations.RunPython(fix_rc_valide_immatricule, reverse_code=noop),
    ]
