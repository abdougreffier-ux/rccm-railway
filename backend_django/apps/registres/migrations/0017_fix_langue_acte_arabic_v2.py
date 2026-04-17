"""
Migration de correction v2 : detection etendue des actes arabes.
Complements la 0016 en detectant les cas ou le texte arabe
est dans le champ denomination principal (pas seulement denomination_ar).
"""
from django.db import migrations


_ARABIC_RANGE = range(0x0600, 0x0700)  # bloc Unicode arabe


def _contient_arabe(text):
    if not text:
        return False
    return any(ord(c) in _ARABIC_RANGE for c in text)


def _ra_est_arabe(ra):
    """
    Detecte si le RA a ete cree via l'interface arabe en cherchant
    des caracteres arabes dans tous les champs denominatifs.
    """
    try:
        pm = getattr(ra, 'pm', None)
        if pm:
            if getattr(pm, 'denomination_ar', ''):
                return True
            if _contient_arabe(getattr(pm, 'denomination', '')):
                return True
    except Exception:
        pass
    try:
        sc = getattr(ra, 'sc', None)
        if sc:
            if getattr(sc, 'denomination_ar', ''):
                return True
            if _contient_arabe(getattr(sc, 'denomination', '')):
                return True
    except Exception:
        pass
    try:
        ph = getattr(ra, 'ph', None)
        if ph:
            if getattr(ph, 'nom_ar', ''):
                return True
            if _contient_arabe(getattr(ph, 'nom', '')):
                return True
    except Exception:
        pass
    return False


def fix_all_models(apps, schema_editor):
    totals = {}

    RegistreChronologique = apps.get_model('registres', 'RegistreChronologique')
    n = 0
    for rc in RegistreChronologique.objects.filter(
        langue_acte='fr'
    ).select_related('ra', 'ra__pm', 'ra__sc', 'ra__ph'):
        if _ra_est_arabe(rc.ra):
            rc.langue_acte = 'ar'
            rc.save(update_fields=['langue_acte'])
            n += 1
    totals['RegistreChronologique'] = n

    for ModelName, AppLabel in [
        ('Radiation',    'radiations'),
        ('Modification', 'modifications'),
        ('Cession',      'cessions'),
        ('CessionFonds', 'cessions_fonds'),
    ]:
        Model = apps.get_model(AppLabel, ModelName)
        n = 0
        for obj in Model.objects.filter(
            langue_acte='fr'
        ).select_related('ra', 'ra__pm', 'ra__sc', 'ra__ph'):
            if _ra_est_arabe(obj.ra):
                obj.langue_acte = 'ar'
                obj.save(update_fields=['langue_acte'])
                n += 1
        totals[ModelName] = n

    for name, count in totals.items():
        print(f'  {name}: {count} enregistrement(s) corrige(s) -> ar')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('registres', '0016_fix_langue_acte_arabic'),
    ]

    operations = [
        migrations.RunPython(fix_all_models, reverse_code=noop),
    ]
