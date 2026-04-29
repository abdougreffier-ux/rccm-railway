"""
apps.registre_central.serializers — Sérialisation des actes pour le Registre Central

Format de transmission standard RCCM :
  Chaque acte est sérialisé avec les informations minimales requises par
  le Registre Central de consolidation nationale.

  La sérialisation est strictement identique en FR et en AR :
  les champs bilingues (denomination, denomination_ar) sont tous deux inclus.
"""
from django.utils import timezone


# ── Sérialisation d'un acte d'immatriculation ──────────────────────────────────

def serialiser_immatriculation(ra):
    """Sérialise un RegistreAnalytique validé pour transmission au Registre Central."""
    from apps.registres.models import RegistreChronologique
    rc = RegistreChronologique.objects.filter(ra=ra, type_acte='IMMATRICULATION').first()
    return {
        'type_acte':           'IMMATRICULATION',
        'numero_ra':           ra.numero_ra,
        'type_entite':         ra.type_entite,
        'denomination':        ra.denomination,
        'denomination_ar':     ra.denomination_ar,
        'date_immatriculation': ra.date_immatriculation.isoformat() if ra.date_immatriculation else None,
        'numero_chrono':        rc.numero_chrono if rc else None,
        'annee_chrono':         rc.annee_chrono if rc else None,
        'localite_code':        ra.localite.code if ra.localite and hasattr(ra.localite, 'code') else None,
        'localite_libelle':     ra.localite.libelle_fr if ra.localite else None,
    }


def serialiser_modification(mod):
    """Sérialise une modification validée."""
    return {
        'type_acte':      'MODIFICATION',
        'numero_modif':   mod.numero_modif,
        'numero_ra':      mod.ra.numero_ra if mod.ra else None,
        'type_entite':    mod.ra.type_entite if mod.ra else None,
        'denomination':   mod.ra.denomination if mod.ra else None,
        'denomination_ar':mod.ra.denomination_ar if mod.ra else None,
        'date_validation': mod.validated_at.isoformat() if mod.validated_at else None,
        'objet':          getattr(mod, 'objet', ''),
    }


def serialiser_cession(ces):
    """Sérialise une cession validée."""
    return {
        'type_acte':      'CESSION',
        'numero_cession': ces.numero_cession,
        'numero_ra':      ces.ra.numero_ra if ces.ra else None,
        'type_entite':    ces.ra.type_entite if ces.ra else None,
        'denomination':   ces.ra.denomination if ces.ra else None,
        'denomination_ar':ces.ra.denomination_ar if ces.ra else None,
        'date_validation': ces.validated_at.isoformat() if ces.validated_at else None,
    }


def serialiser_radiation(rad):
    """Sérialise une radiation validée."""
    return {
        'type_acte':      'RADIATION',
        'numero_radia':   rad.numero_radia,
        'numero_ra':      rad.ra.numero_ra if rad.ra else None,
        'type_entite':    rad.ra.type_entite if rad.ra else None,
        'denomination':   rad.ra.denomination if rad.ra else None,
        'denomination_ar':rad.ra.denomination_ar if rad.ra else None,
        'date_validation': rad.validated_at.isoformat() if rad.validated_at else None,
        'motif':          getattr(rad, 'motif', '') or '',
    }


# ── Génération du contenu JSON d'un relevé mensuel ────────────────────────────

def generer_contenu_releve(annee, mois):
    """
    Génère le contenu JSON du relevé mensuel pour (annee, mois).

    Inclut uniquement les actes VALIDÉS dans la période.
    Retourne un dict avec :
      - immatriculations, modifications, cessions, radiations
      - statistiques de surface
    """
    from django.utils.timezone import make_aware
    import datetime

    debut = make_aware(datetime.datetime(annee, mois, 1))
    # Dernier jour du mois
    if mois == 12:
        fin = make_aware(datetime.datetime(annee + 1, 1, 1))
    else:
        fin = make_aware(datetime.datetime(annee, mois + 1, 1))

    # ── Immatriculations ──────────────────────────────────────────────────────
    from apps.registres.models import RegistreAnalytique
    ras = (RegistreAnalytique.objects
           .select_related('ph', 'pm', 'sc', 'localite')
           .filter(statut='IMMATRICULE', validated_at__gte=debut, validated_at__lt=fin))
    immatriculations = [serialiser_immatriculation(ra) for ra in ras]

    # ── Modifications ─────────────────────────────────────────────────────────
    try:
        from apps.modifications.models import Modification
        mods = (Modification.objects
                .select_related('ra', 'ra__ph', 'ra__pm', 'ra__sc')
                .filter(statut='VALIDE', validated_at__gte=debut, validated_at__lt=fin))
        modifications = [serialiser_modification(m) for m in mods]
    except Exception:
        modifications = []

    # ── Cessions ──────────────────────────────────────────────────────────────
    try:
        from apps.cessions.models import Cession
        ces_qs = (Cession.objects
                  .select_related('ra', 'ra__ph', 'ra__pm', 'ra__sc')
                  .filter(statut='VALIDE', validated_at__gte=debut, validated_at__lt=fin))
        cessions = [serialiser_cession(c) for c in ces_qs]
    except Exception:
        cessions = []

    # ── Radiations ────────────────────────────────────────────────────────────
    try:
        from apps.radiations.models import Radiation
        rads = (Radiation.objects
                .select_related('ra', 'ra__ph', 'ra__pm', 'ra__sc')
                .filter(statut='VALIDE', validated_at__gte=debut, validated_at__lt=fin))
        radiations = [serialiser_radiation(r) for r in rads]
    except Exception:
        radiations = []

    return {
        'periode': {'annee': annee, 'mois': mois},
        'genere_le': timezone.now().isoformat(),
        'immatriculations': immatriculations,
        'modifications':    modifications,
        'cessions':         cessions,
        'radiations':       radiations,
        'statistiques': {
            'nb_immatriculations': len(immatriculations),
            'nb_modifications':    len(modifications),
            'nb_cessions':         len(cessions),
            'nb_radiations':       len(radiations),
            'total':               len(immatriculations) + len(modifications) + len(cessions) + len(radiations),
        },
    }
