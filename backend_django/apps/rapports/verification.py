# -*- coding: utf-8 -*-
"""
Vérification publique des documents officiels RCCM
====================================================

Endpoint : GET /api/verifier/?ref=<reference>&type=<type_document>

Accessible sans authentification à tout tiers porteur d'un document RCCM.
Permet de confirmer l'authenticité, le type, la date, l'entité et l'autorité
de délivrance — sans exposer de données sensibles (PII, identifiants internes).

Règle RCCM :
  • L'URL encodée dans le QR code pointe vers cet endpoint.
  • La réponse est identique en français et en arabe (champs _ar en parallèle).
  • Aucune donnée personnelle confidentielle n'est exposée.

Documents pris en charge :
  • CERT_*         → CertificatGreffier    (non faillite, non litige, etc.)
  • DEP            → Depot                 (certificat de dépôt)
  • IMMATRICULATION, MODIFICATION, etc. → RegistreChronologique
"""
import logging

from rest_framework.views     import APIView
from rest_framework.response  import Response
from rest_framework           import status as http_status

logger = logging.getLogger('rccm.verification')

# ── Libellés des types de certificats greffier ───────────────────────────────
_CERT_TYPE_LABELS = {
    'NON_FAILLITE':             {'fr': 'Certificat de non faillite',
                                 'ar': 'شهادة عدم الإفلاس'},
    'NON_LITIGE':               {'fr': 'Certificat de non litige',
                                 'ar': 'شهادة عدم النزاع'},
    'NEG_PRIVILEGES':           {'fr': 'Certificat négatif de privilèges et de nantissements',
                                 'ar': 'شهادة سلبية بالامتيازات والرهون'},
    'ABS_PROCEDURE_COLLECTIVE': {'fr': "Certificat d'absence de procédure collective",
                                 'ar': 'شهادة انعدام إجراءات التسوية الجماعية'},
    'NON_LIQUIDATION':          {'fr': 'Certificat de non liquidation judiciaire',
                                 'ar': 'شهادة عدم التصفية القضائية'},
}

# ── Libellés des types d'actes chronologiques ────────────────────────────────
_ACTE_TYPE_LABELS = {
    'IMMATRICULATION':   {'fr': 'Immatriculation au RCCM',
                          'ar': 'تسجيل في السجل التجاري'},
    'MODIFICATION':      {'fr': 'Modification',
                          'ar': 'تعديل'},
    'RADIATION':         {'fr': 'Radiation',
                          'ar': 'شطب'},
    'CESSION_PARTS':     {'fr': 'Cession de parts sociales',
                          'ar': 'تنازل عن الحصص'},
    'CESSION_FONDS':     {'fr': 'Cession de fonds de commerce',
                          'ar': 'تنازل عن الأصول التجارية'},
    'DEPOT':             {'fr': 'Dépôt de documents',
                          'ar': 'إيداع وثائق'},
    'DEP':               {'fr': 'Dépôt au greffe',
                          'ar': 'إيداع لدى كتابة الضبط'},
}

# ── Message d'authenticité officiel ──────────────────────────────────────────
_MSG_AUTHENTIQUE = {
    'fr': (
        "Ce document est authentique et a été délivré par le Greffe "
        "du Tribunal de Commerce de Nouakchott (RCCM Mauritanie)."
    ),
    'ar': (
        "هذه الوثيقة أصيلة وصادرة عن كتابة ضبط المحكمة التجارية بنواكشوط "
        "(السجل التجاري والائتماني الموريتاني)."
    ),
}

_AUTORITE = {
    'fr': 'Tribunal de Commerce de Nouakchott — Greffe RCCM',
    'ar': 'المحكمة التجارية بنواكشوط — كتابة الضبط للسجل التجاري',
}


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers internes
# ─────────────────────────────────────────────────────────────────────────────

def _denomination_ra(ra):
    """Retourne la dénomination publique d'un RegistreAnalytique (sans PII)."""
    if not ra:
        return '—'
    if ra.type_entite == 'PH' and ra.ph:
        # Personne physique : nom complet uniquement (pas de NNI, date de naissance, etc.)
        ph = ra.ph
        return f"{ph.prenom or ''} {ph.nom or ''}".strip() or '—'
    if ra.type_entite == 'PM' and ra.pm:
        return ra.pm.denomination or '—'
    if ra.type_entite == 'SC' and ra.sc:
        return ra.sc.denomination or '—'
    return '—'


def _verifier_certificat_greffier(ref):
    """
    Recherche un CertificatGreffier par son numéro.
    Retourne un dict de métadonnées publiques ou None si introuvable.
    """
    from apps.certificats.models import CertificatGreffier
    try:
        cert = (
            CertificatGreffier.objects
            .select_related('ra', 'ra__ph', 'ra__pm', 'ra__sc', 'delivre_par')
            .get(numero=ref)
        )
    except CertificatGreffier.DoesNotExist:
        return None

    ra          = cert.ra
    tc          = cert.type_certificat
    labels      = _CERT_TYPE_LABELS.get(tc, {'fr': tc, 'ar': tc})
    type_entite = ra.type_entite if ra else ''

    _TYPE_SUFFIXES = {
        'PH': {'fr': 'Personne physique', 'ar': 'شخص طبيعي'},
        'PM': {'fr': 'Société',           'ar': 'شركة'},
        'SC': {'fr': 'Succursale',        'ar': 'فرع أجنبي'},
    }
    suffix = _TYPE_SUFFIXES.get(type_entite, {'fr': '', 'ar': ''})

    type_fr = f"{labels['fr']} — {suffix['fr']}" if suffix['fr'] else labels['fr']
    type_ar = f"{labels['ar']} — {suffix['ar']}" if suffix['ar'] else labels['ar']

    delivre_par = ''
    if cert.delivre_par:
        delivre_par = f"{cert.delivre_par.prenom or ''} {cert.delivre_par.nom or ''}".strip()

    logger.info(
        'RCCM — Vérification publique  ref=%s  type=%s  entité=%s',
        ref, tc, _denomination_ra(ra),
    )
    return {
        'valide':           True,
        'ref':              cert.numero,
        'type_document':    type_fr,
        'type_document_ar': type_ar,
        'entite':           _denomination_ra(ra),
        'numero_ra':        (ra.numero_ra or '—') if ra else '—',
        'date_delivrance':  cert.date_delivrance.strftime('%d/%m/%Y'),
        'langue':           cert.langue,
        'delivre_par':      delivre_par or '—',
        'autorite':         _AUTORITE['fr'],
        'autorite_ar':      _AUTORITE['ar'],
        'statut':           'VALIDE',
        'message':          _MSG_AUTHENTIQUE['fr'],
        'message_ar':       _MSG_AUTHENTIQUE['ar'],
    }


def _verifier_depot(ref):
    """
    Recherche un Depot par son numéro de dépôt.
    Retourne un dict de métadonnées publiques ou None si introuvable.
    """
    try:
        from apps.depots.models import Depot
        depot = Depot.objects.get(numero_depot=ref)
    except Exception:
        return None

    logger.info('RCCM — Vérification publique dépôt  ref=%s', ref)
    return {
        'valide':           True,
        'ref':              depot.numero_depot,
        'type_document':    'Certificat de dépôt au greffe',
        'type_document_ar': 'شهادة الإيداع لدى كتابة الضبط',
        'entite':           depot.denomination or '—',
        'numero_ra':        '—',
        'date_delivrance':  str(depot.date_depot) if depot.date_depot else '—',
        'langue':           'FR',
        'delivre_par':      '—',
        'autorite':         _AUTORITE['fr'],
        'autorite_ar':      _AUTORITE['ar'],
        'statut':           'VALIDE',
        'message':          _MSG_AUTHENTIQUE['fr'],
        'message_ar':       _MSG_AUTHENTIQUE['ar'],
    }


def _verifier_chrono(ref):
    """
    Recherche un RegistreChronologique par numero_chrono.
    Retourne un dict de métadonnées publiques ou None si introuvable.
    """
    from apps.registres.models import RegistreChronologique
    try:
        chrono = (
            RegistreChronologique.objects
            .select_related('ra', 'ra__ph', 'ra__pm', 'ra__sc')
            .get(numero_chrono=ref)
        )
    except RegistreChronologique.DoesNotExist:
        return None

    ra      = chrono.ra
    labels  = _ACTE_TYPE_LABELS.get(
        chrono.type_acte,
        {'fr': chrono.type_acte, 'ar': chrono.type_acte},
    )

    _STATUTS = {
        'VALIDE':      {'fr': 'Validé',     'ar': 'مصادق عليه'},
        'EN_INSTANCE': {'fr': 'En instance', 'ar': 'قيد المعالجة'},
        'BROUILLON':   {'fr': 'En cours',   'ar': 'قيد الإنجاز'},
        'RETOURNE':    {'fr': 'Retourné',   'ar': 'مُرجَع'},
        'REJETE':      {'fr': 'Rejeté',     'ar': 'مرفوض'},
        'ANNULE':      {'fr': 'Annulé',     'ar': 'ملغى'},
    }
    statut_labels = _STATUTS.get(chrono.statut, {'fr': chrono.statut, 'ar': chrono.statut})

    logger.info(
        'RCCM — Vérification publique chrono  ref=%s  type=%s  statut=%s',
        ref, chrono.type_acte, chrono.statut,
    )
    return {
        'valide':           chrono.statut == 'VALIDE',
        'ref':              chrono.numero_chrono,
        'type_document':    labels['fr'],
        'type_document_ar': labels['ar'],
        'entite':           _denomination_ra(ra),
        'numero_ra':        (ra.numero_ra or '—') if ra else '—',
        'date_delivrance':  chrono.date_acte.strftime('%d/%m/%Y') if chrono.date_acte else '—',
        'langue':           'FR',
        'delivre_par':      '—',
        'autorite':         _AUTORITE['fr'],
        'autorite_ar':      _AUTORITE['ar'],
        'statut':           statut_labels['fr'],
        'statut_ar':        statut_labels['ar'],
        'message':          _MSG_AUTHENTIQUE['fr'] if chrono.statut == 'VALIDE' else '',
        'message_ar':       _MSG_AUTHENTIQUE['ar'] if chrono.statut == 'VALIDE' else '',
    }


def _dispatcher(ref, doc_type=''):
    """
    Dispatche la recherche selon le type de document et le format de la référence.
    Stratégie :
      1. Type explicite fourni → cherche dans la source correspondante en premier.
      2. Préfixe de la référence → heuristique sur le format (CERT-* → certificat, etc.).
      3. Recherche exhaustive dans tous les modèles (fallback).
    """
    ref = (ref or '').strip()
    if not ref:
        return None

    # ── 1. Certificats greffier ──────────────────────────────────────────────
    if doc_type.startswith('CERT_') or ref.upper().startswith('CERT-'):
        result = _verifier_certificat_greffier(ref)
        if result:
            return result

    # ── 2. Dépôts ────────────────────────────────────────────────────────────
    if doc_type == 'DEP':
        result = _verifier_depot(ref)
        if result:
            return result

    # ── 3. Registre chronologique ────────────────────────────────────────────
    result = _verifier_chrono(ref)
    if result:
        return result

    # ── 4. Recherche exhaustive (fallback sans type) ─────────────────────────
    if not doc_type.startswith('CERT_') and not ref.upper().startswith('CERT-'):
        result = _verifier_certificat_greffier(ref)
        if result:
            return result

    if doc_type != 'DEP':
        result = _verifier_depot(ref)
        if result:
            return result

    return None


# ─────────────────────────────────────────────────────────────────────────────
#  Vue publique
# ─────────────────────────────────────────────────────────────────────────────

class VerificationPubliqueView(APIView):
    """
    GET /api/verifier/?ref=<reference>&type=<type_document>

    Endpoint PUBLIC — accessible sans authentification à tout tiers porteur
    d'un document officiel RCCM (scan du QR code, vérification manuelle…).

    Paramètres :
      ref  (obligatoire) — numéro de référence du document (ex. CERT-202604-0001)
      type (facultatif)  — type de document pour accélérer la recherche
                           (ex. CERT_NON_FAILLITE, DEP, IMMATRICULATION…)

    Réponse :
      200 → document trouvé et valide
      200 (valide=false) → document trouvé mais statut non validé
      404 → aucun document RCCM avec cette référence
      400 → référence manquante

    Données exposées : type, entité (dénomination), N° analytique,
                       date de délivrance, autorité, statut.
    Données NON exposées : PII, identifiants internes, données financières.

    Bilingue FR/AR : chaque champ a son équivalent _ar.
    """
    # ── Accès public : aucune authentification requise ───────────────────────
    authentication_classes = []
    permission_classes     = []

    def get(self, request):
        ref      = request.query_params.get('ref', '').strip()
        doc_type = request.query_params.get('type', '').strip().upper()

        if not ref:
            return Response(
                {
                    'valide':     False,
                    'detail':     'Paramètre « ref » obligatoire.',
                    'detail_ar':  'المعامل « ref » إلزامي.',
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        result = _dispatcher(ref, doc_type)

        if result is None:
            logger.warning(
                'RCCM — Vérification publique : référence inconnue  ref=%s  type=%s',
                ref, doc_type,
            )
            return Response(
                {
                    'valide':     False,
                    'ref':        ref,
                    'detail': (
                        f"Aucun document RCCM trouvé avec la référence « {ref} ». "
                        "Vérifiez que le document est bien délivré par le Greffe "
                        "du Tribunal de Commerce de Nouakchott."
                    ),
                    'detail_ar': (
                        f'لم يُعثر على أي وثيقة RCCM بالمرجع « {ref} ». '
                        'تأكد من صحة الوثيقة الصادرة عن كتابة ضبط المحكمة التجارية بنواكشوط.'
                    ),
                    'autorite':   _AUTORITE['fr'],
                    'autorite_ar': _AUTORITE['ar'],
                },
                status=http_status.HTTP_404_NOT_FOUND,
            )

        # Ajouter l'URL de vérification dans la réponse elle-même
        from django.conf import settings as _settings
        base_url = getattr(_settings, 'RCCM_VERIFICATION_BASE_URL', '').rstrip('/')
        if base_url:
            result['url_verification'] = (
                f"{base_url}/api/verifier/?ref={ref}&type={doc_type or ''}"
            )

        return Response(result, status=http_status.HTTP_200_OK)
