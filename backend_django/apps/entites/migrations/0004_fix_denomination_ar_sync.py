"""
Migration de correction : synchronisation des champs denomination / denomination_ar.

Règle métier RCCM : la dénomination sociale est une déclaration juridique libre
pouvant contenir arabe, latin, sigles, chiffres et symboles.
Les deux champs doivent être cohérents pour garantir l'affichage dans les deux
interfaces (FR et AR).

Cas traités :
  - denomination rempli, denomination_ar vide → copier denomination dans denomination_ar
  - denomination_ar rempli, denomination vide  → copier denomination_ar dans denomination
"""
from django.db import migrations


def sync_denominations(apps, schema_editor):
    totals = {}

    PersonneMorale = apps.get_model('entites', 'PersonneMorale')
    n = 0
    # denomination rempli, denomination_ar vide → copier
    for pm in PersonneMorale.objects.filter(denomination_ar='').exclude(denomination=''):
        pm.denomination_ar = pm.denomination
        pm.save(update_fields=['denomination_ar'])
        n += 1
    # denomination vide, denomination_ar rempli → copier (cas rare)
    for pm in PersonneMorale.objects.filter(denomination='').exclude(denomination_ar=''):
        pm.denomination = pm.denomination_ar
        pm.save(update_fields=['denomination'])
        n += 1
    totals['PersonneMorale'] = n

    Succursale = apps.get_model('entites', 'Succursale')
    n = 0
    for sc in Succursale.objects.filter(denomination_ar='').exclude(denomination=''):
        sc.denomination_ar = sc.denomination
        sc.save(update_fields=['denomination_ar'])
        n += 1
    for sc in Succursale.objects.filter(denomination='').exclude(denomination_ar=''):
        sc.denomination = sc.denomination_ar
        sc.save(update_fields=['denomination'])
        n += 1
    totals['Succursale'] = n

    for name, count in totals.items():
        print(f'  {name}: {count} enregistrement(s) denomination_ar synchronise(s)')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('entites', '0003_personnephysique_civilite'),
    ]

    operations = [
        migrations.RunPython(sync_denominations, reverse_code=noop),
    ]
