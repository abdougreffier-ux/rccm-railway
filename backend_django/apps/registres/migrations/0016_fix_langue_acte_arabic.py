"""
Migration de correction : détecte les actes créés via l'interface arabe
et corrige leur champ langue_acte de 'fr' (défaut migration) → 'ar'.

Heuristique : si le RA lié possède du contenu arabe
  - PM / SC : denomination_ar non vide
  - PH      : nom_ar non vide
alors l'acte a très probablement été créé via l'interface arabe.
"""
from django.db import migrations


_ARABIC_RANGE = range(0x0600, 0x0700)  # bloc Unicode arabe


def _contient_arabe(text):
    """True si la chaîne contient au moins un caractère du bloc arabe Unicode."""
    if not text:
        return False
    return any(ord(c) in _ARABIC_RANGE for c in text)


def _ra_est_arabe(ra):
    """
    Retourne True si le RA contient du texte arabe,
    indiquant qu'il a probablement été créé via l'interface arabe.
    Critères (par ordre de fiabilité) :
      1. PM / SC : denomination_ar non vide
      2. PH      : nom_ar non vide
      3. PM / SC : denomination (champ principal) contient des caractères arabes
      4. PH      : nom contient des caractères arabes
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


def fix_registre_chronologique(apps, schema_editor):
    RegistreChronologique = apps.get_model('registres', 'RegistreChronologique')
    updated = 0
    for rc in RegistreChronologique.objects.filter(
        langue_acte='fr'
    ).select_related('ra', 'ra__pm', 'ra__sc', 'ra__ph'):
        if _ra_est_arabe(rc.ra):
            rc.langue_acte = 'ar'
            rc.save(update_fields=['langue_acte'])
            updated += 1
    print(f'  RegistreChronologique : {updated} enregistrement(s) corrige(s) -> ar')


def fix_radiations(apps, schema_editor):
    Radiation = apps.get_model('radiations', 'Radiation')
    updated = 0
    for obj in Radiation.objects.filter(
        langue_acte='fr'
    ).select_related('ra', 'ra__pm', 'ra__sc', 'ra__ph'):
        if _ra_est_arabe(obj.ra):
            obj.langue_acte = 'ar'
            obj.save(update_fields=['langue_acte'])
            updated += 1
    print(f'  Radiation : {updated} enregistrement(s) corrige(s) -> ar')


def fix_modifications(apps, schema_editor):
    Modification = apps.get_model('modifications', 'Modification')
    updated = 0
    for obj in Modification.objects.filter(
        langue_acte='fr'
    ).select_related('ra', 'ra__pm', 'ra__sc', 'ra__ph'):
        if _ra_est_arabe(obj.ra):
            obj.langue_acte = 'ar'
            obj.save(update_fields=['langue_acte'])
            updated += 1
    print(f'  Modification : {updated} enregistrement(s) corrige(s) -> ar')


def fix_cessions(apps, schema_editor):
    Cession = apps.get_model('cessions', 'Cession')
    updated = 0
    for obj in Cession.objects.filter(
        langue_acte='fr'
    ).select_related('ra', 'ra__pm', 'ra__sc', 'ra__ph'):
        if _ra_est_arabe(obj.ra):
            obj.langue_acte = 'ar'
            obj.save(update_fields=['langue_acte'])
            updated += 1
    print(f'  Cession : {updated} enregistrement(s) corrige(s) -> ar')


def fix_cessions_fonds(apps, schema_editor):
    CessionFonds = apps.get_model('cessions_fonds', 'CessionFonds')
    updated = 0
    for obj in CessionFonds.objects.filter(
        langue_acte='fr'
    ).select_related('ra', 'ra__pm', 'ra__sc', 'ra__ph'):
        if _ra_est_arabe(obj.ra):
            obj.langue_acte = 'ar'
            obj.save(update_fields=['langue_acte'])
            updated += 1
    print(f'  CessionFonds : {updated} enregistrement(s) corrige(s) -> ar')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    """
    Correction des enregistrements existants dont langue_acte est resté à 'fr'
    par défaut alors que l'acte a été créé en arabe.
    """
    dependencies = [
        ('registres',    '0015_langue_acte'),
        ('radiations',   '0004_langue_acte'),
        ('modifications','0007_langue_acte'),
        ('cessions',     '0008_langue_acte'),
        ('cessions_fonds','0004_langue_acte'),
    ]

    operations = [
        migrations.RunPython(fix_registre_chronologique, reverse_code=noop),
        migrations.RunPython(fix_radiations,             reverse_code=noop),
        migrations.RunPython(fix_modifications,          reverse_code=noop),
        migrations.RunPython(fix_cessions,               reverse_code=noop),
        migrations.RunPython(fix_cessions_fonds,         reverse_code=noop),
    ]
