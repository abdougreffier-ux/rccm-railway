# -*- coding: utf-8 -*-
"""
Certificats déclaratifs du greffier — RCCM
  • Non faillite
  • Non litige
  • Négatif de privilèges et de nantissements
  • Absence de procédure collective
  • Non liquidation judiciaire
"""
import io
import logging
import traceback

from django.utils import timezone
from rest_framework.views     import APIView
from rest_framework.response  import Response
from rest_framework           import status as http_status
from django.http              import HttpResponse

logger = logging.getLogger('rccm.certificats')

# ReportLab
from reportlab.lib.pagesizes    import A4
from reportlab.lib.units        import cm
from reportlab.lib.enums        import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib              import colors
from reportlab.platypus         import (
    SimpleDocTemplate, Paragraph, Spacer, KeepTogether,
    HRFlowable, Table, TableStyle,
)
from reportlab.lib.styles       import getSampleStyleSheet, ParagraphStyle

# PDF helpers from rapports app
from apps.rapports.views import (
    _header_table, _signature_block, _make_doc, _get_signataire,
    _build_info_table, _ar_style, COLORS, _ARABIC_FONT, ar, _civ,
    _make_qr_footer_callback, _qr_text,
)

from apps.core.permissions import EstGreffier, EstAgentTribunalOuGreffier
from apps.registres.models import RegistreAnalytique

from .models      import CertificatGreffier
from .serializers import CertificatGreffierSerializer


# ─────────────────────────────────────────────────────────────────────────────
#  Textes bilingues des certificats
# ─────────────────────────────────────────────────────────────────────────────

_CERT_TITLES = {
    'NON_FAILLITE': {
        'fr': 'CERTIFICAT DE NON FAILLITE',
        'ar': 'شهادة عدم الإفلاس',
    },
    'NON_LITIGE': {
        'fr': 'CERTIFICAT DE NON LITIGE',
        'ar': 'شهادة عدم النزاع',
    },
    'NEG_PRIVILEGES': {
        'fr': 'CERTIFICAT NÉGATIF DE PRIVILÈGES ET DE NANTISSEMENTS',
        'ar': 'شهادة سلبية بالامتيازات والرهون',
    },
    'ABS_PROCEDURE_COLLECTIVE': {
        'fr': "CERTIFICAT D'ABSENCE DE PROCÉDURE COLLECTIVE",
        'ar': 'شهادة انعدام إجراءات التسوية الجماعية',
    },
    'NON_LIQUIDATION': {
        'fr': 'CERTIFICAT DE NON LIQUIDATION JUDICIAIRE',
        'ar': 'شهادة عدم التصفية القضائية',
    },
}

_CERT_BODY = {
    'NON_FAILLITE': {
        'fr': (
            "Après vérification, le greffier soussigné certifie que l'entité "
            "susmentionnée ne fait l'objet d'aucune procédure de faillite "
            "régulièrement enregistrée à ce jour."
        ),
        'ar': (
            "بعد التحقق، يُشهد الكاتب العام الموقع أدناه بأن الجهة المذكورة أعلاه "
            "ليست موضوع أي إجراء إفلاس مسجل بصفة منتظمة حتى تاريخه."
        ),
    },
    'NON_LITIGE': {
        'fr': (
            "Après vérification, le greffier soussigné certifie que l'entité "
            "susmentionnée ne fait l'objet d'aucun litige porté devant le Tribunal "
            "à la date de délivrance du présent certificat."
        ),
        'ar': (
            "بعد التحقق، يُشهد الكاتب العام الموقع أدناه بأن الجهة المذكورة أعلاه "
            "ليست موضوع أي نزاع مرفوع أمام المحكمة في تاريخ تسليم هذه الشهادة."
        ),
    },
    'NEG_PRIVILEGES': {
        'fr': (
            "Après consultation du Registre des Sûretés Mobilières, le greffier "
            "soussigné certifie qu'à la date de délivrance du présent certificat, "
            "aucun privilège, nantissement, charge ou autre sûreté n'est inscrit "
            "sur les actifs de l'entité susmentionnée."
        ),
        'ar': (
            "بعد الاطلاع على سجل الضمانات المنقولة، يُشهد الكاتب العام الموقع أدناه "
            "بأنه في تاريخ تسليم هذه الشهادة، لا يوجد أي امتياز أو رهن أو تكليف أو ضمان "
            "آخر مقيد على أصول الجهة المذكورة أعلاه."
        ),
    },
    'ABS_PROCEDURE_COLLECTIVE': {
        'fr': (
            "Après vérification, le greffier soussigné certifie que l'entité "
            "susmentionnée ne fait l'objet d'aucune procédure collective et "
            "qu'aucune difficulté de paiement n'est enregistrée à son encontre "
            "à la date du présent certificat."
        ),
        'ar': (
            "بعد التحقق، يُشهد الكاتب العام الموقع أدناه بأن الجهة المذكورة أعلاه "
            "ليست موضوع أي إجراء جماعي وأنه لم يُسجَّل في مواجهتها أي عسر في الوفاء "
            "حتى تاريخ هذه الشهادة."
        ),
    },
    'NON_LIQUIDATION': {
        'fr': (
            "Après vérification, le greffier soussigné certifie que l'entité "
            "susmentionnée ne fait l'objet d'aucune procédure de liquidation "
            "judiciaire régulièrement ouverte à ce jour."
        ),
        'ar': (
            "بعد التحقق، يُشهد الكاتب العام الموقع أدناه بأن الجهة المذكورة أعلاه "
            "ليست موضوع أي إجراء تصفية قضائية مفتوح بصفة منتظمة حتى تاريخه."
        ),
    },
}

_MENTION_FINALE = {
    'fr': (
        "En foi de quoi, le présent certificat est délivré pour servir et valoir "
        "ce que de droit et pour qu'il puisse être utilisé conformément à la loi."
    ),
    'ar': (
        "وإثباتاً لذلك، سُلِّمت هذه الشهادة لتُستعمل فيما يلزم وكما يقتضيه القانون."
    ),
}

_TYPE_ENTITE_LABELS = {
    'PH': {'fr': 'Personne physique',      'ar': 'شخص طبيعي'},
    'PM': {'fr': 'Personne morale',         'ar': 'شخص اعتباري'},
    'SC': {'fr': 'Succursale étrangère',    'ar': 'فرع أجنبي'},
}

# Suffixe du titre selon la nature juridique de l'entité
# Règle RCCM : le titre du certificat intègre le type de l'entité concernée.
_TYPE_ENTITE_SUFFIX = {
    'PH': {'fr': 'PERSONNE PHYSIQUE',  'ar': 'شخص طبيعي'},
    'PM': {'fr': 'SOCIÉTÉ',            'ar': 'شركة'},
    'SC': {'fr': 'SUCCURSALE',         'ar': 'فرع أجنبي'},
}

# Mention de validité obligatoire — affichée en pied de page sur tous les certificats
_VALIDITE_MENTION = {
    'fr': 'NB : La validité de cette attestation est de trois (3) mois.',
    'ar': 'ملاحظة : صلاحية هذه الشهادة ثلاثة (3) أشهر.',
}


# ─────────────────────────────────────────────────────────────────────────────
#  PDF Builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_certificat_pdf(cert, lang='fr'):
    """Génère le PDF d'un CertificatGreffier. Retourne un buffer BytesIO."""
    is_ar       = (lang == 'ar')
    tc          = cert.type_certificat
    ra          = cert.ra
    type_entite = ra.type_entite if ra else ''

    # ── Titre dynamique : base + suffixe type d'entité ─────────────────────
    # Règle RCCM : le titre intègre le type de l'entité (PP / Société / Succursale).
    titles   = _CERT_TITLES.get(tc, {'fr': 'CERTIFICAT', 'ar': 'شهادة'})
    suffix   = _TYPE_ENTITE_SUFFIX.get(type_entite, {'fr': '', 'ar': ''})
    titre_fr = f"{titles['fr']} — {suffix['fr']}" if suffix['fr'] else titles['fr']
    titre_ar = f"{titles['ar']} — {suffix['ar']}" if suffix['ar'] else titles['ar']

    sig    = _get_signataire()
    styles = getSampleStyleSheet()
    buffer = io.BytesIO()
    doc    = _make_doc(buffer)

    # ── Styles ─────────────────────────────────────────────────────────────
    _nfont    = _ARABIC_FONT if is_ar else 'Helvetica'
    _bfont    = _ARABIC_FONT if is_ar else 'Helvetica-Bold'
    _align    = TA_RIGHT     if is_ar else TA_LEFT
    _align_j  = TA_RIGHT     if is_ar else TA_JUSTIFY

    normal = ParagraphStyle('N10c', parent=styles['Normal'], fontSize=10,
                            fontName=_nfont, spaceAfter=6, alignment=_align)
    body   = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10,
                            fontName=_nfont, leading=16, spaceAfter=10,
                            alignment=_align_j)
    italic = ParagraphStyle('Ital', parent=styles['Normal'], fontSize=9,
                            fontName=_nfont, leading=14, spaceAfter=8,
                            alignment=_align_j,
                            textColor=colors.HexColor('#4b5563'))
    sec    = ParagraphStyle('Sec', parent=styles['Normal'], fontSize=10,
                            fontName=_bfont, spaceAfter=4, spaceBefore=8,
                            alignment=_align, textColor=COLORS['primary'])

    # ── Données RCCM complémentaires ────────────────────────────────────────
    # N° chronologique — acte d'immatriculation validé, sinon le plus récent
    _chronos      = list(ra.chronos.order_by('date_enregistrement')) if ra else []
    _chrono_immat = next(
        (c for c in _chronos
         if c.type_acte == 'IMMATRICULATION' and c.statut == 'VALIDE'),
        None,
    ) or next(
        (c for c in _chronos if c.type_acte == 'IMMATRICULATION'),
        None,
    ) or (_chronos[0] if _chronos else None)

    num_chrono = _chrono_immat.numero_chrono if _chrono_immat else '—'

    # Date d'immatriculation
    date_immat_str = (
        ra.date_immatriculation.strftime('%d/%m/%Y')
        if ra and ra.date_immatriculation else '—'
    )

    # ── Activités déclarées — source : champ déclaré à l'immatriculation ────
    # Règle RCCM : les activités affichées sur le certificat sont EXCLUSIVEMENT
    # celles déclarées lors de l'immatriculation (ou de la dernière modification),
    # telles qu'enregistrées au RCCM — jamais le domaine de classification.
    #
    # Source par type d'entité :
    #   PH  → PersonnePhysique.profession          (champ texte libre direct)
    #   PM  → RegistreChronologique.description    (JSON, clé : objet_social)
    #   SC  → RegistreChronologique.description    (JSON, clés : objet_social / activite)
    activites_txt = '—'

    if type_entite == 'PH' and ra and ra.ph:
        activites_txt = ra.ph.profession or '—'

    elif type_entite in ('PM', 'SC') and _chrono_immat:
        _desc = (_chrono_immat.description or '').strip()
        if _desc:
            try:
                import json as _json
                _data         = _json.loads(_desc)
                _objet_social = (_data.get('objet_social') or '').strip()
                _activite     = (_data.get('activite')     or '').strip()
                # PM  → objet_social ; SC → objet_social en priorité, puis activite
                _raw = _objet_social or _activite
                activites_txt = _raw if _raw else '—'
            except (ValueError, TypeError):
                # description non-JSON (texte libre brut) : affichée telle quelle
                activites_txt = _desc if _desc else '—'

    # ── En-tête ─────────────────────────────────────────────────────────────
    story = _header_table(titre_fr, titre_ar, lang=lang)

    # ── Numéro et date ──────────────────────────────────────────────────────
    today_str = cert.date_delivrance.strftime('%d/%m/%Y')
    num_txt   = cert.numero
    if is_ar:
        ref_line = ar(f"رقم : {num_txt}   |   بتاريخ : {today_str}")
    else:
        ref_line = f"N° : {num_txt}   |   Date de délivrance : {today_str}"
    ref_style = ParagraphStyle('Ref', parent=styles['Normal'], fontSize=9,
                               fontName=_nfont, alignment=TA_CENTER,
                               spaceAfter=6, textColor=colors.HexColor('#6b7280'))
    story.append(Paragraph(ref_line, ref_style))
    story.append(HRFlowable(width='100%', thickness=0.5,
                            color=COLORS['primary'], spaceAfter=10))

    # ── Bloc I : Identification de l'entité ─────────────────────────────────
    sec_id_txt = ar('I. بيانات المنشأة') if is_ar else 'I. Identification de l\'entité'
    story.append(Paragraph(sec_id_txt, sec))

    te_labels = _TYPE_ENTITE_LABELS.get(type_entite, {'fr': '', 'ar': ''})

    # Dénomination / identité
    if type_entite == 'PH' and ra.ph:
        ph           = ra.ph
        civ_val      = getattr(ph, 'civilite', '')
        civ_fr       = _civ(civ_val, 'fr')
        civ_ar       = _civ(civ_val, 'ar')
        denom_fr     = f"{civ_fr} {ph.prenom or ''} {ph.nom or ''}".strip()
        denom_ar     = f"{civ_ar} {ph.nom_ar or ph.nom or ''} {ph.prenom_ar or ph.prenom or ''}".strip()
        siege_fr     = getattr(ph, 'adresse', '') or '—'
        siege_ar     = getattr(ph, 'adresse_ar', '') or siege_fr
        fj_fr        = ''
        fj_ar        = ''
        fj_label_fr  = 'Forme juridique'
        fj_label_ar  = 'الشكل القانوني'
        nat_fr       = ph.nationalite.libelle_fr if ph.nationalite else '—'
        nat_ar       = (ph.nationalite.libelle_ar or nat_fr) if ph.nationalite else '—'
    elif type_entite == 'PM' and ra.pm:
        pm           = ra.pm
        denom_fr     = pm.denomination or '—'
        denom_ar     = pm.denomination_ar or denom_fr
        siege_fr     = pm.siege_social or '—'
        siege_ar     = pm.siege_social_ar or siege_fr
        fj_fr        = (pm.forme_juridique.libelle_fr if pm.forme_juridique else '—') or '—'
        fj_ar        = ((pm.forme_juridique.libelle_ar or fj_fr)
                        if pm.forme_juridique else '—')
        fj_label_fr  = 'Forme juridique'
        fj_label_ar  = 'الشكل القانوني'
        nat_fr       = ''
        nat_ar       = ''
    elif type_entite == 'SC' and ra.sc:
        sc           = ra.sc
        denom_fr     = sc.denomination or '—'
        denom_ar     = sc.denomination_ar or denom_fr
        siege_fr     = sc.siege_social or '—'
        siege_ar     = siege_fr
        # Succursale n'a pas de forme_juridique — on affiche le pays d'origine
        fj_fr        = sc.pays_origine or ''
        fj_ar        = sc.pays_origine or ''
        fj_label_fr  = "Pays d'origine"
        fj_label_ar  = 'بلد المنشأ'
        nat_fr       = ''
        nat_ar       = ''
    else:
        denom_fr = denom_ar = '—'
        siege_fr = siege_ar = '—'
        fj_fr = fj_ar = ''
        fj_label_fr = 'Forme juridique'
        fj_label_ar = 'الشكل القانوني'
        nat_fr = nat_ar = ''

    num_ra = ra.numero_ra or '—'
    num_rc = ra.numero_rc or ''

    if is_ar:
        id_rows = [
            [ar('نوع الجهة'),            ar(te_labels['ar'])],
            [ar('الاسم / التسمية'),      ar(denom_ar)],
        ]
        if fj_ar:
            id_rows.append([ar(fj_label_ar), ar(fj_ar)])
        if nat_ar:
            id_rows.append([ar('الجنسية'), ar(nat_ar)])
        id_rows += [
            [ar('الرقم التحليلي'),                  ar(num_ra)],
        ]
        if num_rc:
            id_rows.append([ar('رقم السجل التجاري'), ar(num_rc)])
        id_rows += [
            [ar('رقم القيد التسلسلي'),              ar(num_chrono)],
            [ar('تاريخ التسجيل'),                   ar(date_immat_str)],
            [ar('الأنشطة المُصرَّح بها'),            ar(activites_txt)],
            [ar('المقر الاجتماعي / العنوان'),        ar(siege_ar)],
        ]
    else:
        id_rows = [
            ["Type d'entité",      te_labels['fr']],
            ['Dénomination / Nom', denom_fr],
        ]
        if fj_fr:
            id_rows.append([fj_label_fr, fj_fr])
        if nat_fr:
            id_rows.append(['Nationalité', nat_fr])
        id_rows += [
            ['N° analytique',         num_ra],
        ]
        if num_rc:
            id_rows.append(['N° RC', num_rc])
        id_rows += [
            ['N° chronologique',       num_chrono],
            ["Date d'immatriculation", date_immat_str],
            ['Activités déclarées',    activites_txt],
            ['Siège social / Adresse', siege_fr],
        ]

    story.append(_build_info_table(id_rows, lang=lang))

    # ── Bloc II : Certification ──────────────────────────────────────────────
    sec_cert_txt = ar('II. شهادة الكاتب العام') if is_ar else 'II. Certification du greffier'
    story.append(Paragraph(sec_cert_txt, sec))

    body_texts = _CERT_BODY.get(tc, {'fr': '', 'ar': ''})
    body_text  = body_texts['ar'] if is_ar else body_texts['fr']
    if is_ar:
        story.append(Paragraph(ar(body_text), body))
    else:
        story.append(Paragraph(body_text, body))

    story.append(Spacer(1, 0.4 * cm))
    story.append(HRFlowable(width='60%', thickness=0.3,
                            color=colors.HexColor('#d1d5db'),
                            hAlign='CENTER', spaceAfter=10))

    # ── Mention finale ───────────────────────────────────────────────────────
    finale_txt = _MENTION_FINALE['ar'] if is_ar else _MENTION_FINALE['fr']
    if is_ar:
        story.append(Paragraph(ar(finale_txt), italic))
    else:
        story.append(Paragraph(finale_txt, italic))

    # ── Signature ────────────────────────────────────────────────────────────
    story.extend(_signature_block(styles, sig, lang=lang, keep_together=True))

    # ── QR code + mention de validité en pied de page ─────────────────────
    # Règle RCCM :
    #   • QR code : bas à droite, contient l'identifiant complet du certificat
    #   • Mention de validité (3 mois) : centrée, pied de page, obligatoire
    #   • Identique FR et AR — aucune divergence d'effet juridique
    _qr_label_fr = 'Vérification électronique'
    _qr_label_ar = ar('التحقق الإلكتروني')
    _qr_label    = _qr_label_ar if is_ar else _qr_label_fr

    _qr_str = _qr_text(
        doc_type = f'CERT_{tc}',
        ref      = cert.numero,
        ra       = num_ra if num_ra != '—' else '',
        rc       = num_rc,
        date_acte= cert.date_delivrance.strftime('%Y-%m-%d'),
    )

    _validite_note = (
        ar(_VALIDITE_MENTION['ar']) if is_ar else _VALIDITE_MENTION['fr']
    )

    _page_cb = _make_qr_footer_callback(
        qr_text_str = _qr_str,
        qr_size_cm  = 2.8,
        label       = _qr_label,
        footer_note = _validite_note,
        lang        = lang,
    )

    # Fallback si le module qrcode n'est pas disponible : dessin manuel du footer
    if _page_cb is None:
        _footer_font = _ARABIC_FONT if is_ar else 'Helvetica-Oblique'
        _page_w      = A4[0]

        def _page_cb(canvas_obj, doc_obj):
            canvas_obj.saveState()
            canvas_obj.setFont(_footer_font, 8)
            canvas_obj.setFillColor(colors.HexColor('#374151'))
            canvas_obj.setStrokeColor(colors.HexColor('#d1d5db'))
            canvas_obj.setLineWidth(0.5)
            canvas_obj.line(2 * cm, 1.4 * cm, _page_w - 2 * cm, 1.4 * cm)
            canvas_obj.drawCentredString(_page_w / 2, 1.1 * cm, _validite_note)
            canvas_obj.restoreState()

    doc.build(story, onFirstPage=_page_cb, onLaterPages=_page_cb)
    buffer.seek(0)
    return buffer


# ─────────────────────────────────────────────────────────────────────────────
#  API Views
# ─────────────────────────────────────────────────────────────────────────────

class CertificatListCreateView(APIView):
    """
    GET  /certificats/           — liste (filtrable par ra_id, type_certificat)
    POST /certificats/           — délivrer un nouveau certificat (greffier + agent tribunal)
    """
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request):
        from apps.core.permissions import est_greffier
        qs = CertificatGreffier.objects.select_related(
            'ra', 'ra__ph', 'ra__pm', 'ra__sc', 'delivre_par',
        )
        # Filtres
        ra_id  = request.query_params.get('ra_id')
        tc     = request.query_params.get('type_certificat')
        if ra_id:
            qs = qs.filter(ra_id=ra_id)
        if tc:
            qs = qs.filter(type_certificat=tc)
        return Response(CertificatGreffierSerializer(qs, many=True).data)

    def post(self, request):
        from apps.core.permissions import est_greffier
        if not est_greffier(request.user):
            return Response(
                {'detail': 'Seul le greffier peut délivrer un certificat.',
                 'detail_ar': 'يحق لكاتب الضبط فقط تسليم الشهادات.'},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        type_certificat = request.data.get('type_certificat')
        ra_id           = request.data.get('ra')
        observations    = request.data.get('observations', '')

        # ── Langue — figée à la délivrance ───────────────────────────────────
        # Le frontend transmet la langue de la session greffier (FR ou AR).
        # Valeur par défaut : FR (sécurité si le frontend ne la transmet pas).
        langue_raw      = (request.data.get('langue') or 'FR').strip().upper()
        valid_langues   = [c[0] for c in CertificatGreffier.LANGUE_CHOICES]
        if langue_raw not in valid_langues:
            langue_raw = 'FR'

        # Validation type
        valid_types = [c[0] for c in CertificatGreffier.TYPE_CHOICES]
        if type_certificat not in valid_types:
            return Response(
                {'detail':    f"Type de certificat invalide. Valeurs autorisées : {valid_types}",
                 'detail_ar': f"نوع الشهادة غير صالح. القيم المسموح بها: {valid_types}"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        try:
            ra = RegistreAnalytique.objects.get(pk=ra_id)
        except RegistreAnalytique.DoesNotExist:
            return Response(
                {'detail':    'Entité introuvable.',
                 'detail_ar': 'الجهة غير موجودة.'},
                status=http_status.HTTP_404_NOT_FOUND,
            )

        # Seule une entité immatriculée peut recevoir un certificat
        if ra.statut not in ('IMMATRICULE', 'EN_COURS'):
            return Response(
                {'detail': (
                    f"Certificat impossible : statut de l'entité est "
                    f"« {ra.get_statut_display()} ». L'entité doit être immatriculée."
                ),
                 'detail_ar': (
                    f"تعذّر إصدار الشهادة: حالة الجهة هي "
                    f"« {ra.get_statut_display()} ». يجب أن تكون الجهة مقيدة."
                )},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        cert = CertificatGreffier.objects.create(
            type_certificat = type_certificat,
            langue          = langue_raw,
            ra              = ra,
            delivre_par     = request.user,
            observations    = observations,
        )
        logger.info(
            'RCCM — Certificat délivré  num=%s  type=%s  langue=%s  entité=%s  greffier=%s',
            cert.numero, cert.type_certificat, cert.langue,
            ra.denomination or ra.numero_ra,
            request.user,
        )
        return Response(CertificatGreffierSerializer(cert).data,
                        status=http_status.HTTP_201_CREATED)


class CertificatDetailView(APIView):
    """GET /certificats/<pk>/ — détail d'un certificat."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request, pk):
        try:
            cert = CertificatGreffier.objects.select_related(
                'ra', 'ra__ph', 'ra__pm', 'ra__sc', 'delivre_par',
            ).get(pk=pk)
        except CertificatGreffier.DoesNotExist:
            return Response({'detail': 'Certificat introuvable.'},
                            status=http_status.HTTP_404_NOT_FOUND)
        return Response(CertificatGreffierSerializer(cert).data)


class CertificatPDFView(APIView):
    """GET /certificats/<pk>/pdf/?lang=fr|ar — télécharge le PDF du certificat."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request, pk):
        try:
            cert = CertificatGreffier.objects.select_related(
                'ra',
                'ra__ph', 'ra__ph__nationalite',
                'ra__pm', 'ra__pm__forme_juridique',
                'ra__sc',                              # Succursale n'a pas forme_juridique
                'delivre_par',
            ).prefetch_related(
                'ra__chronos',   # N° chronologique + activités déclarées (description JSON)
            ).get(pk=pk)
        except CertificatGreffier.DoesNotExist:
            return Response(
                {'detail':    'Certificat introuvable.',
                 'detail_ar': 'الشهادة غير موجودة.'},
                status=http_status.HTTP_404_NOT_FOUND,
            )

        # ── Verrou de langue — règle RCCM ────────────────────────────────────
        # Un certificat est délivré dans une seule langue, figée à la délivrance.
        # Toute demande d'impression dans une autre langue est rejetée.
        cert_lang     = cert.langue.lower()          # 'fr' ou 'ar'
        requested_lang = request.query_params.get('lang', cert_lang).lower()
        if requested_lang not in ('fr', 'ar'):
            requested_lang = cert_lang

        if requested_lang != cert_lang:
            langue_label = cert.get_langue_display()
            return Response(
                {
                    'detail': (
                        f"Ce certificat ({cert.numero}) a été délivré en {langue_label}. "
                        f"Il est juridiquement interdit d'en produire une version "
                        f"dans une autre langue. "
                        f"Pour obtenir un certificat en français, délivrez un nouveau certificat."
                        if cert_lang == 'ar' else
                        f"Ce certificat ({cert.numero}) a été délivré en {langue_label}. "
                        f"Il est juridiquement interdit d'en produire une version "
                        f"dans une autre langue. "
                        f"Pour obtenir un certificat en arabe, délivrez un nouveau certificat."
                    ),
                    'detail_ar': (
                        f'تم إصدار هذه الشهادة ({cert.numero}) باللغة {langue_label}. '
                        f'يُحظر قانونياً إنتاج نسخة بلغة أخرى. '
                        f'لاستخراج شهادة بلغة مختلفة، يجب تسليم شهادة جديدة.'
                    ),
                    'code':       'LANGUE_MISMATCH',
                    'certificat': cert.numero,
                    'langue_certificat': cert.langue,
                },
                status=http_status.HTTP_403_FORBIDDEN,
            )

        lang = cert_lang   # utiliser systématiquement la langue du certificat

        try:
            buffer = _build_certificat_pdf(cert, lang=lang)
        except Exception as exc:
            # ── Journalisation complète pour le support RCCM ─────────────────
            logger.error(
                'RCCM — Échec génération PDF certificat\n'
                '  ID           : %s\n'
                '  Numéro       : %s\n'
                '  Type         : %s (%s)\n'
                '  Entité       : %s (RA %s)\n'
                '  Langue       : %s\n'
                '  Erreur       : %s\n'
                '  Stacktrace   :\n%s',
                cert.pk,
                cert.numero,
                cert.type_certificat,
                cert.get_type_certificat_display(),
                getattr(cert.ra, 'denomination', '—') if cert.ra else '—',
                getattr(cert.ra, 'numero_ra', '—')    if cert.ra else '—',
                lang,
                exc,
                traceback.format_exc(),
            )
            return Response(
                {
                    'detail': (
                        f'Le certificat {cert.numero} a bien été délivré et enregistré, '
                        f'mais la génération du PDF a échoué. '
                        f'Contactez le support RCCM en indiquant le numéro : {cert.numero}.'
                    ),
                    'detail_ar': (
                        f'تم تسليم الشهادة {cert.numero} وتسجيلها بنجاح، '
                        f'لكن إنشاء ملف PDF فشل. '
                        f'يُرجى الاتصال بالدعم التقني مع الإشارة إلى الرقم : {cert.numero}.'
                    ),
                    'code':       'PDF_GENERATION_ERROR',
                    'certificat': cert.numero,
                    'type':       cert.get_type_certificat_display(),
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        slug  = cert.type_certificat.lower().replace('_', '-')
        fname = f"{slug}_{cert.numero}.pdf"
        logger.info(
            'RCCM — PDF certificat généré  num=%s  type=%s  entité=%s  lang=%s',
            cert.numero,
            cert.type_certificat,
            getattr(cert.ra, 'denomination', '—') if cert.ra else '—',
            lang,
        )
        return HttpResponse(
            buffer,
            content_type = 'application/pdf',
            headers      = {'Content-Disposition': f'attachment; filename="{fname}"'},
        )


class CertificatSearchEntiteView(APIView):
    """
    GET /certificats/search-entite/?q=<terme>
    Recherche d'entités immatriculées pour la délivrance de certificats.

    Recherche insensible à la casse sur :
      • numero_ra      — numéro analytique (RA)
      • numero_rc      — numéro RC
      • denomination   — PH : nom + prénom ; PM/SC : dénomination
      • nom / prénom   — PH uniquement (champs FR et AR)

    Statuts éligibles : IMMATRICULE, EN_COURS.
    Accès : greffier + agent tribunal (pas agent GU).
    Résultats : limités à 30 pour la performance.
    """
    permission_classes = [EstAgentTribunalOuGreffier]

    _STATUTS_ELIGIBLES = ('IMMATRICULE', 'EN_COURS')

    def get(self, request):
        from django.db.models import Q
        q = request.query_params.get('q', '').strip()
        if not q:
            return Response([])

        qs = (RegistreAnalytique.objects
              .select_related('ph', 'pm', 'sc')
              .filter(statut__in=self._STATUTS_ELIGIBLES))

        # Recherche multi-champs avec OR — insensible à la casse (icontains)
        qs = qs.filter(
            Q(numero_ra__icontains=q)     |
            Q(numero_rc__icontains=q)     |
            Q(ph__nom__icontains=q)       |
            Q(ph__prenom__icontains=q)    |
            Q(ph__nom_ar__icontains=q)    |
            Q(pm__denomination__icontains=q) |
            Q(pm__denomination_ar__icontains=q) |
            Q(sc__denomination__icontains=q)    |
            Q(sc__denomination_ar__icontains=q)
        ).distinct()[:30]

        results = []
        for ra in qs:
            denom = ra.denomination or '—'
            results.append({
                'id':          ra.id,
                'numero_ra':   ra.numero_ra or '—',
                'numero_rc':   ra.numero_rc or '',
                'type_entite': ra.type_entite,
                'denomination': denom,
                'denomination_ar': ra.denomination_ar or denom,
                'statut':      ra.statut,
            })

        return Response(results)
