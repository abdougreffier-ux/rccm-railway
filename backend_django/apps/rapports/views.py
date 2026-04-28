import io
import os
import time
import logging
import json as _json
from datetime import date
from django.http import HttpResponse
from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, HRFlowable,
    KeepTogether, CondPageBreak,
    Image as RLImage,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from apps.registres.models import RegistreAnalytique, RegistreChronologique
from apps.demandes.models import Demande
from apps.core.permissions import (
    EstGreffier, EstAgentTribunalOuGreffier, EstAgentOuGreffier,
    est_greffier,
)
from django.utils import timezone as _tz

# ── Journal des générations PDF ───────────────────────────────────────────────
# Chaque tentative de génération (succès ou échec) est tracée dans les logs
# Railway sous le tag [PDF_AUDIT]. Format JSON structuré pour faciliter
# l'extraction et l'audit dans le cadre d'un registre officiel.
_pdf_log = logging.getLogger('rccm.pdf_audit')


def _log_pdf(*, user, acte, reference, langue, succes, duree_ms, erreur=''):
    """
    Journalise une tentative de génération de document officiel.

    Paramètres :
        user       — login de l'utilisateur (str)
        acte       — type d'acte (ex. 'attestation-immatriculation', 'extrait-rc')
        reference  — référence du dossier (ex. 'RA-2025-0001')
        langue     — 'fr' ou 'ar'
        succes     — True si le PDF a été généré, False sinon
        duree_ms   — durée de génération en millisecondes
        erreur     — message d'erreur si succes=False
    """
    _pdf_log.info(
        '[PDF_AUDIT] %s',
        _json.dumps({
            'utilisateur': str(user),
            'acte':        acte,
            'reference':   str(reference),
            'langue':      langue,
            'succes':      succes,
            'duree_ms':    round(duree_ms),
            'timestamp':   _tz.now().isoformat(),
            'erreur':      erreur,
        }, ensure_ascii=False),
    )


class PdfAuditMixin:
    """
    Mixin de journalisation pour toutes les vues de génération de documents officiels.

    Toute tentative (succès ou échec) est tracée dans les logs Railway sous le
    tag [PDF_AUDIT] au format JSON structuré. Chaque entrée contient :
      utilisateur, acte, référence dossier, langue, succès/échec, durée, timestamp.

    Usage :
        class MaVuePDF(PdfAuditMixin, APIView):
            _pdf_acte_name = 'nom-du-type-acte'  # libellé court
    """
    _pdf_acte_name = ''  # à surcharger dans chaque sous-classe

    def dispatch(self, request, *args, **kwargs):
        t0 = time.monotonic()
        response = super().dispatch(request, *args, **kwargs)
        duree_ms = (time.monotonic() - t0) * 1000

        # Extraire l'ID de dossier depuis les kwargs URL (ra_id, rc_id, rbe_id, etc.)
        ref = next((str(v) for v in kwargs.values() if v is not None), '?')
        # request ici est encore le WSGIRequest Django (avant que DRF ne l'enveloppe
        # dans initialize_request).  query_params est un attribut DRF qui n'existe pas
        # sur WSGIRequest — utiliser .GET qui est l'équivalent natif Django.
        lang = request.GET.get('lang', 'fr')
        status_code = getattr(response, 'status_code', 0)
        succes = (status_code == 200)

        _log_pdf(
            user=getattr(request.user, 'login', str(request.user)),
            acte=self._pdf_acte_name or self.__class__.__name__,
            reference=ref,
            langue=lang,
            succes=succes,
            duree_ms=duree_ms,
            erreur='' if succes else f'HTTP {status_code}',
        )
        return response

# ── Support QR code ───────────────────────────────────────────────────────────
try:
    import qrcode
    import qrcode.constants
    _QR_AVAILABLE = True
except ImportError:
    _QR_AVAILABLE = False

# ── Police Unicode pour l'arabe ────────────────────────────────────────────────
# ReportLab ne peut afficher des glyphes arabes qu'avec une police TTF Unicode.
#
# Stratégie (priorité décroissante) :
#   1a. Police embarquée — chemin relatif à views.py  (via __file__)
#   1b. Police embarquée — chemin relatif à BASE_DIR Django (plus robuste Railway)
#   2.  Polices système Windows (développement local)
#   3.  Polices système Linux (apt install fonts-*)
#
# Les deux chemins 1a/1b pointent vers le même fichier TTF committé dans le dépôt.
# Si aucune police n'est trouvée, un log CRITICAL est émis ET le texte arabe
# s'affichera en carrés — comportement immédiatement détectable dans les logs.

_FONTS_DIR      = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'fonts')
_ARABIC_FONT     = 'Helvetica'       # fallback (carrés) — ne doit jamais rester actif
_ARABIC_FONT_BOLD = 'Helvetica-Bold' # idem pour le gras

# Chemin alternatif via BASE_DIR Django (plus stable si __file__ est un .pyc ou
# si le module est chargé depuis un répertoire de travail différent sur Railway)
try:
    from django.conf import settings as _dj_settings
    _FONTS_DIR_DJANGO = os.path.join(
        str(getattr(_dj_settings, 'BASE_DIR', '')),
        'apps', 'rapports', 'assets', 'fonts',
    )
except Exception:
    _FONTS_DIR_DJANGO = ''

_FONT_CANDIDATES = [
    # ── 1a. Police embarquée — chemin via __file__ ────────────────────────────
    ('Amiri', os.path.join(_FONTS_DIR,        'Amiri-Regular.ttf')),
    # ── 1b. Police embarquée — chemin via BASE_DIR Django ────────────────────
    ('Amiri', os.path.join(_FONTS_DIR_DJANGO,  'Amiri-Regular.ttf') if _FONTS_DIR_DJANGO else ''),
    # ── 2. Polices système Windows (développement local) ──────────────────────
    ('ArialUnicode', 'C:/Windows/Fonts/arial.ttf'),
    ('ArialUnicode', 'C:/Windows/Fonts/Arial.ttf'),
    ('Tahoma',       'C:/Windows/Fonts/tahoma.ttf'),
    # ── 3. Polices système Linux (serveur sans la police embarquée) ───────────
    ('DejaVuSans',   '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
    ('FreeSans',     '/usr/share/fonts/truetype/freefont/FreeSans.ttf'),
    ('NotoArabic',   '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf'),
    ('NotoArabic',   '/usr/share/fonts/truetype/noto-cjk/NotoNaskhArabic-Regular.ttf'),
]

for _fname, _fpath in _FONT_CANDIDATES:
    if not _fpath or not os.path.exists(_fpath):
        continue
    try:
        pdfmetrics.registerFont(TTFont(_fname, _fpath))
        _ARABIC_FONT = _fname
        # Enregistrer le gras Amiri dans les deux chemins possibles
        for _bd in (_FONTS_DIR, _FONTS_DIR_DJANGO):
            if not _bd:
                continue
            _bold_path = os.path.join(_bd, 'Amiri-Bold.ttf')
            if _fname == 'Amiri' and os.path.exists(_bold_path):
                try:
                    pdfmetrics.registerFont(TTFont('Amiri-Bold', _bold_path))
                    _ARABIC_FONT_BOLD = 'Amiri-Bold'
                except Exception:
                    pass
                break
        logging.getLogger('rccm.pdf_audit').info(
            'Police arabe chargee : %s (%s)', _fname, _fpath
        )
        break
    except Exception as _font_err:
        logging.getLogger('rccm.pdf_audit').warning(
            'Police arabe [%s] inutilisable : %s', _fpath, _font_err
        )
else:
    # Aucune police arabe disponible — texte arabe sera illisible (carres)
    logging.getLogger('rccm.pdf_audit').critical(
        'AUCUNE police arabe chargee — texte arabe = carres. '
        'Chemins testes : __file__=%s | BASE_DIR=%s',
        _FONTS_DIR, _FONTS_DIR_DJANGO,
    )


# ── Support mise en forme du texte arabe ──────────────────────────────────────
try:
    import arabic_reshaper
    from bidi.algorithm import get_display as bidi_display

    def ar(text):
        """
        Reshape + réordonne le texte arabe pour ReportLab (RTL correct).
        Défensif : en cas d'erreur runtime (Python 3.12 / bidi / reshaper),
        retourne le texte brut plutôt que propager une exception vers la vue.
        """
        if not text:
            return ''
        try:
            return bidi_display(arabic_reshaper.reshape(str(text)))
        except Exception as _ar_err:
            logging.getLogger('rccm').warning(
                'ar() — échec reshape/bidi pour "%s…" : %s', str(text)[:30], _ar_err
            )
            return str(text)
except ImportError:
    def ar(text):
        return str(text) if text else ''


# ── Civilité — libellés bilingues pour les documents officiels ────────────────
_CIVILITE_FR = {'MR': 'M.', 'MME': 'Mme', 'MLLE': 'Mlle'}
_CIVILITE_AR = {'MR': 'السيد', 'MME': 'السيدة', 'MLLE': 'الآنسة'}


def _civ(civilite, lang='fr'):
    """
    Retourne le libellé de civilité (ex. 'M.', 'Mme', 'السيد') ou '' si vide.
    Utilisé pour préfixer les noms de personnes physiques dans les documents officiels.
    """
    if not civilite:
        return ''
    if lang == 'ar':
        return _CIVILITE_AR.get(civilite, '')
    return _CIVILITE_FR.get(civilite, '')


def _fmt_nom(civilite, nom, prenom='', lang='fr'):
    """
    Formate « Civilité Prénom Nom » pour les documents officiels.
    - FR : M. Prénom NOM   →  « M. Ahmed OULD BRAHIM »
    - AR : السيد أحمد      →  préfixe civilité + nom ar si disponible
    Les parties vides sont ignorées.
    """
    civ = _civ(civilite, lang)
    parts = [p for p in [civ, prenom, nom] if p]
    return ' '.join(parts)


# ── Palette ───────────────────────────────────────────────────────────────────
# ── Charte graphique officielle RCCM ─────────────────────────────────────────
# Couleur principale  : Vert institutionnel RCCM  #0B6E3A
# Accent secondaire  : Or administratif discret  #C9A227
# Texte principal    : Noir                       #000000
# Fond document      : Blanc                      #FFFFFF
# Toute autre couleur structurelle est interdite (règle graphique v1.0).
COLORS = {
    'primary':   colors.HexColor('#0B6E3A'),   # Vert RCCM — titres, cadres, en-têtes
    'secondary': colors.HexColor('#C9A227'),   # Or administratif — accents discrets
    'header_bg': colors.HexColor('#0B6E3A'),   # Fond en-tête de tableaux
    'row_even':  colors.HexColor('#F2F8F5'),   # Fond alterné très léger (quasi-blanc vert)
    'border':    colors.HexColor('#0B6E3A'),   # Bordures structurelles (cadres sections)
    'light_bg':  colors.HexColor('#EAF4EE'),   # Fond colonne label (vert très clair)
}

# ── Images institutionnelles (en-tête officiel) ────────────────────────────────
_ASSETS_DIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
_IMG_BANNIERE  = os.path.join(_ASSETS_DIR, 'entete_banniere.jpg')   # Bannière RIM bilingue
_IMG_ARMOIRIES = os.path.join(_ASSETS_DIR, 'entete_armoiries.jpg')  # Armoiries de la RIM


# ── Helpers PDF ───────────────────────────────────────────────────────────────

def _get_signataire():
    from apps.parametrage.models import Signataire
    return Signataire.objects.filter(actif=True).first()


def _ar_style(parent_style, **kwargs):
    """Crée un ParagraphStyle utilisant la police arabe enregistrée."""
    return ParagraphStyle(
        f'Ar_{id(parent_style)}',
        parent=parent_style,
        fontName=_ARABIC_FONT,
        **kwargs,
    )


def _header_table(title_fr, title_ar='', subtitle='', lang='fr'):
    """
    En-tête officiel bilingue en 4 colonnes :
      [FR (gauche)] | [Bannière République (centre)] | [AR (droite)] | [Armoiries]

    Les images institutionnelles sont chargées depuis le dossier assets/ voisin.
    En l'absence des fichiers, un fallback texte est affiché.
    Si lang='ar', seul le titre arabe est affiché (titre FR omis dans le corps).
    """
    styles = getSampleStyleSheet()
    W = 16.5 * cm   # largeur utile (cohérent avec _signature_block)

    # ── Styles texte de l'en-tête ────────────────────────────────────────────
    # Hiérarchie : Ministère (medium) > Tribunal (plus visible) > Greffe (discret)
    s_min_fr = ParagraphStyle('HdrMinFR', parent=styles['Normal'],
        fontSize=8.5, fontName='Helvetica-Bold', alignment=TA_LEFT,
        textColor=COLORS['primary'], spaceAfter=2, leading=12)
    s_trib_fr = ParagraphStyle('HdrTribFR', parent=styles['Normal'],
        fontSize=10, fontName='Helvetica-Bold', alignment=TA_LEFT,
        textColor=COLORS['primary'], spaceAfter=2, leading=14)
    s_gref_fr = ParagraphStyle('HdrGrefFR', parent=styles['Normal'],
        fontSize=7.5, fontName='Helvetica', alignment=TA_LEFT,
        textColor=colors.HexColor('#555555'), spaceAfter=0, leading=10)

    s_min_ar  = _ar_style(styles['Normal'], fontSize=8.5, alignment=TA_RIGHT,
                          spaceAfter=2, leading=12)
    s_trib_ar = _ar_style(styles['Normal'], fontSize=10,  alignment=TA_RIGHT,
                          spaceAfter=2, leading=14)
    s_gref_ar = _ar_style(styles['Normal'], fontSize=7.5, alignment=TA_RIGHT,
                          spaceAfter=0, leading=10)

    # ── Colonne 1 : Français (gauche) ────────────────────────────────────────
    col_fr = [
        Paragraph('Ministère de la Justice', s_min_fr),
        Paragraph('Tribunal de Commerce de Nouakchott', s_trib_fr),
        Paragraph('Greffe chargé du registre du commerce', s_gref_fr),
    ]

    # ── Colonne 2 : Bannière République islamique de Mauritanie (centre) ─────
    if os.path.exists(_IMG_BANNIERE):
        col_ctr = [RLImage(_IMG_BANNIERE, width=4.0 * cm, height=1.5 * cm)]
    else:
        # Fallback texte si l'image n'est pas disponible
        s_rep_fr = ParagraphStyle('HdrRepFR', parent=styles['Normal'],
            fontSize=7, fontName='Helvetica-Bold', alignment=TA_CENTER,
            textColor=COLORS['primary'], spaceAfter=1, leading=9)
        s_rep_ar = _ar_style(styles['Normal'], fontSize=7, alignment=TA_CENTER,
            textColor=COLORS['primary'], spaceAfter=1, leading=9)
        s_mot = ParagraphStyle('HdrMot', parent=styles['Normal'],
            fontSize=6, fontName='Helvetica-Oblique', alignment=TA_CENTER,
            textColor=colors.HexColor('#666666'), spaceAfter=0, leading=8)
        col_ctr = [
            Paragraph('RÉPUBLIQUE ISLAMIQUE DE MAURITANIE', s_rep_fr),
            Paragraph(ar('الجمهورية الإسلامية الموريتانية'), s_rep_ar),
            Paragraph('Honneur \u2013 Fraternité \u2013 Justice', s_mot),
        ]

    # ── Colonne 3 : Arabe (droite) ────────────────────────────────────────────
    col_ar = [
        Paragraph(ar('وزارة العدل'), s_min_ar),
        Paragraph(ar('المحكمة التجارية بنواكشوط'), s_trib_ar),
        Paragraph(ar('كتابة الضبط المكلفة بالسجل التجاري'), s_gref_ar),
    ]

    # ── Colonne 4 : Armoiries (extrême droite) ────────────────────────────────
    if os.path.exists(_IMG_ARMOIRIES):
        col_arm = [RLImage(_IMG_ARMOIRIES, width=1.5 * cm, height=1.5 * cm)]
    else:
        col_arm = [Spacer(1, 0.2 * cm)]

    # ── Table principale : 4 colonnes, 5.5 + 4.0 + 5.5 + 1.5 = 16.5 cm ─────
    hdr_tbl = Table(
        [[col_fr, col_ctr, col_ar, col_arm]],
        colWidths=[5.5 * cm, 4.0 * cm, 5.5 * cm, 1.5 * cm],
    )
    hdr_tbl.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN',         (0, 0), (0,  0),  'LEFT'),
        ('ALIGN',         (1, 0), (1,  0),  'CENTER'),
        ('ALIGN',         (2, 0), (2,  0),  'RIGHT'),
        ('ALIGN',         (3, 0), (3,  0),  'RIGHT'),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING',   (0, 0), (0,  0),  0),
        ('RIGHTPADDING',  (3, 0), (3,  0),  0),
        ('LEFTPADDING',   (1, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (2,  0),  4),
    ]))

    # ── Titre du document (en dessous de l'en-tête) ──────────────────────────
    # spaceBefore / spaceAfter en points (1 cm ≈ 28 pt)
    title_style = ParagraphStyle('DocTitle', parent=styles['Normal'],
        fontSize=13, fontName='Helvetica-Bold', textColor=COLORS['primary'],
        alignment=TA_CENTER, spaceAfter=6, spaceBefore=0)
    title_ar_style = _ar_style(styles['Normal'],
        fontSize=12, textColor=COLORS['primary'], alignment=TA_CENTER, spaceAfter=4)

    elements = [
        hdr_tbl,
        # Filet épais — séparateur institutionnel
        HRFlowable(width='100%', thickness=2, color=COLORS['primary'], spaceAfter=0),
        # Espace vertical entre l'en-tête et le titre du document (≈ 20 pt / 28 px)
        Spacer(1, 0.7 * cm),
    ]
    # ── Titre du document : langue unique selon lang ─────────────────────────
    # Règle : chaque version affiche uniquement le titre dans sa propre langue.
    # Mode AR → titre arabe centré uniquement.
    # Mode FR → titre français uniquement (pas de doublage arabe en dessous).
    if lang == 'ar' and title_ar:
        _title_ar_main = ParagraphStyle(
            'DocTitleAr',
            fontName=_ARABIC_FONT, fontSize=13,
            textColor=COLORS['primary'],
            alignment=TA_CENTER, spaceAfter=6, spaceBefore=0,
        )
        elements.append(Paragraph(ar(title_ar), _title_ar_main))
    else:
        elements.append(Paragraph(title_fr, title_style))
        # Titre arabe non répété en mode français (cohérence monolingue du document)
    elements += [
        # Léger espace avant le filet de séparation bas
        Spacer(1, 0.2 * cm),
        HRFlowable(width='100%', thickness=0.5, color=COLORS['border']),
        Spacer(1, 0.35 * cm),
    ]
    return elements


def _signature_block(styles, signataire=None, align='left', lang='fr', keep_together=True):
    """
    Bloc signature :
    - FR → droite de la page, texte aligné à droite
    - AR → gauche de la page, texte aligné à gauche
    Fallback : si la version AR est vide, utilise la version FR.

    keep_together=True  : enveloppe dans KeepTogether (comportement historique).
    keep_together=False : retourne les éléments bruts — l'appelant est responsable
                          de les inclure dans un KeepTogether plus large (groupant
                          la date de délivrance + la signature).
    """
    is_ar = (lang == 'ar')
    W = 16.5 * cm   # largeur utile (A4 − 2 × 2 cm marges)

    if is_ar:
        qualite_txt = ((signataire.qualite_ar or signataire.qualite)
                       if signataire else 'الكاتب العام')
        nom_txt = ((signataire.nom_ar or signataire.nom) if signataire else '')
        s_q = _ar_style(styles['Normal'], fontSize=10, alignment=TA_LEFT, spaceAfter=0)
        s_n = _ar_style(styles['Normal'], fontSize=10, alignment=TA_LEFT, spaceAfter=0)
        q_p = Paragraph(f"<b>{ar(qualite_txt)}</b>", s_q)
        n_p = Paragraph(f"{ar(nom_txt)}", s_n) if nom_txt else Paragraph('', s_q)
        inner = Table([[q_p], [Spacer(1, 0.15 * cm)], [n_p]], colWidths=[W * 0.45])
        inner.setStyle(TableStyle([
            ('TOPPADDING',    (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        outer = Table([[inner, None]], colWidths=[W * 0.45, W * 0.55])
    else:
        qualite_txt = signataire.qualite if signataire else 'Le Greffier en Chef'
        nom_txt     = signataire.nom     if signataire else ''
        s_q = ParagraphStyle('SigQ', parent=styles['Normal'],
                             fontSize=10, alignment=TA_RIGHT, spaceAfter=0)
        s_n = ParagraphStyle('SigN', parent=styles['Normal'],
                             fontSize=10, alignment=TA_RIGHT, spaceAfter=0)
        q_p = Paragraph(f"<b>{qualite_txt}</b>", s_q)
        n_p = Paragraph(f"{nom_txt}", s_n) if nom_txt else Paragraph('', s_q)
        inner = Table([[q_p], [Spacer(1, 0.15 * cm)], [n_p]], colWidths=[W * 0.45])
        inner.setStyle(TableStyle([
            ('TOPPADDING',    (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        outer = Table([[None, inner]], colWidths=[W * 0.55, W * 0.45])

    outer.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    if keep_together:
        return [Spacer(1, 0.3 * cm), KeepTogether([outer])]
    return [Spacer(1, 0.3 * cm), outer]


def _table_style():
    return TableStyle([
        ('BACKGROUND',     (0, 0), (-1, 0), COLORS['header_bg']),
        ('TEXTCOLOR',      (0, 0), (-1, 0), colors.white),
        ('FONTNAME',       (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',       (0, 0), (-1, 0), 9),
        ('ALIGN',          (0, 0), (-1, 0), 'CENTER'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLORS['row_even']]),
        ('FONTSIZE',       (0, 1), (-1, -1), 8),
        ('GRID',           (0, 0), (-1, -1), 0.3, COLORS['border']),
        ('LEFTPADDING',    (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',   (0, 0), (-1, -1), 4),
        ('TOPPADDING',     (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING',  (0, 0), (-1, -1), 3),
        ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
    ])


def _info_table_style(lang='fr'):
    """Style for label/value info tables (no header row).

    Note : FONTNAME/FONTSIZE sont ignorés pour les cellules Paragraph
    (la police est portée par le ParagraphStyle).  On les garde pour
    les éventuelles cellules texte brut passées directement.
    En mode arabe (lang='ar'), les colonnes sont physiquement inversées dans
    _build_info_table (label → col 1, valeur → col 0) pour un rendu RTL correct.
    Le fond light_bg s'applique donc à la colonne 1 en mode arabe.
    """
    # En arabe, label est en col 1 (après swap) ; en français, en col 0.
    lbl_col = 1 if lang == 'ar' else 0
    cmds = [
        ('FONTNAME',      (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 9),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        ('LINEBELOW',     (0, 0), (-1, -1), 0.3, COLORS['border']),
        ('BACKGROUND',    (lbl_col, 0), (lbl_col, -1), COLORS['light_bg']),
        ('WORDWRAP',      (0, 0), (-1, -1), True),
        ('ALIGN',         (0, 0), (-1, -1), 'RIGHT' if lang == 'ar' else 'LEFT'),
    ]
    return TableStyle(cmds)


def _make_doc(buffer, landscape=False):
    pagesize = A4
    if landscape:
        pagesize = (A4[1], A4[0])
    return SimpleDocTemplate(buffer, pagesize=pagesize,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.8 * cm, bottomMargin=3.2 * cm)


# ── Helper horodatage ─────────────────────────────────────────────────────────

def _fmt_acte_dt(dt, lang='fr'):
    """
    Formate un DateTimeField (ou DateField) en chaîne lisible pour les documents RCCM.

    Exemples :
      lang='fr'  →  '13/04/2026 à 09h30'
      lang='ar'  →  '13/04/2026 الساعة 09:30'

    Si dt est None ou falsy, retourne '—'.
    Accepte : datetime, date, ou chaîne ISO 8601.
    """
    if not dt:
        return '—'
    try:
        from datetime import datetime as _dt, date as _d
        if isinstance(dt, str):
            # Normalise les chaînes ISO (avec ou sans 'T')
            dt = _dt.fromisoformat(dt.replace('Z', '+00:00'))
        if isinstance(dt, _dt):
            d_str = dt.strftime('%d/%m/%Y')
            h_str = dt.strftime('%H:%M')
            return f"{d_str} {'الساعة' if lang == 'ar' else 'à'} {h_str}"
        if isinstance(dt, _d):
            return dt.strftime('%d/%m/%Y')
    except Exception:
        pass
    return str(dt)


def _get_immat_dt(ra, lang='fr'):
    """
    Retourne la date ET l'heure de l'immatriculation pour les documents RCCM.

    Stratégie (priorité décroissante) :
      1. RC Chrono de type IMMATRICULATION lié au RA (date_acte = DateTimeField).
      2. ra.date_immatriculation (DateField — fallback, date seule sans heure).

    Compatible avec :
      • prefetch_related('chronos')         sur RegistreAnalytique
      • prefetch_related('ra__chronos')     sur Radiation / Modification / Cession

    Retourne '—' si aucune date disponible (jamais None, jamais exception levée).
    """
    if ra is None:
        return '—'
    try:
        chrono = next(
            (c for c in ra.chronos.all() if c.type_acte == 'IMMATRICULATION'),
            None,
        )
        if chrono and chrono.date_acte:
            return _fmt_acte_dt(chrono.date_acte, lang=lang)
    except Exception:
        pass
    if ra.date_immatriculation:
        return _fmt_acte_dt(ra.date_immatriculation, lang=lang)
    return '—'


def _get_immat_dt_iso(ra):
    """
    Retourne le timestamp ISO de l'immatriculation pour les QR codes RCCM.
    Cherche d'abord dans le RC Chrono IMMATRICULATION, puis date_immatriculation.
    Retourne '' si aucune donnée.
    """
    if ra is None:
        return ''
    try:
        chrono = next(
            (c for c in ra.chronos.all() if c.type_acte == 'IMMATRICULATION'),
            None,
        )
        if chrono and chrono.date_acte:
            return chrono.date_acte.isoformat()
    except Exception:
        pass
    if ra.date_immatriculation:
        return str(ra.date_immatriculation)
    return ''


# ── Helpers QR code ───────────────────────────────────────────────────────────

def _qr_text(doc_type, ref='', ra='', rc='', date_acte=''):
    """
    Construit la chaîne encodée dans le QR code.

    Règle de découplage RCCM :
      Le QR code est TOUJOURS généré — son contenu seul varie selon l'environnement.
      La présence du QR ne dépend jamais de la disponibilité d'un lien de vérification.

    Contenu selon l'environnement :
      • PRODUCTION (domaine officiel, non-localhost) :
            URL de vérification externe → {BASE_URL}/api/verifier/?ref={ref}&type={doc_type}
            Accessible à tout tiers sans authentification.
      • TEST / DÉVELOPPEMENT (localhost, 127.0.0.1, ou URL non configurée) :
            Format texte structuré RCCM-MR :
            RCCM-MR|TYPE:{doc_type}|REF:{ref}|RA:{ra}|RC:{rc}|DATE:{date_acte}|GEN:{today}
            Le QR est généré et affiché ; l'URL de vérification sera activée en production.

    Garantie : cette fonction retourne toujours une chaîne non vide si ref est fourni.
    """
    from django.conf import settings as _settings
    base_url = getattr(_settings, 'RCCM_VERIFICATION_BASE_URL', '').rstrip('/')

    # ── Production uniquement : URL officielle sur domaine réel ─────────────
    # localhost / 127.0.0.1 → format texte (test), même si la variable est définie.
    _is_production_url = (
        bool(base_url) and
        bool(ref) and
        'localhost' not in base_url.lower() and
        '127.0.0.1' not in base_url
    )
    if _is_production_url:
        return f"{base_url}/api/verifier/?ref={ref}&type={doc_type}"

    # ── Test / développement : format texte structuré ────────────────────────
    # Le QR est TOUJOURS généré avec ce contenu en environnement de test.
    # Avantage : scannable, lisible, ne dépend d'aucun endpoint réseau.
    today = date.today().strftime('%Y-%m-%d')
    parts = ['RCCM-MR', f'TYPE:{doc_type}']
    if ref:
        parts.append(f'REF:{ref}')
    if ra:
        parts.append(f'RA:{ra}')
    if rc:
        parts.append(f'RC:{rc}')
    if date_acte:
        parts.append(f'DATE:{date_acte}')
    parts.append(f'GEN:{today}')
    return '|'.join(parts)


def _make_qr_buf(text, box_size=5, border=2):
    """
    Génère le QR code en PNG (BytesIO).
    Retourne None si la bibliothèque qrcode n'est pas disponible ou si la génération échoue.

    Diagnostic : en cas d'échec, un WARNING est loggé dans rccm.log pour faciliter
    le débogage (ex. Pillow manquant, erreur de rendu).
    """
    import logging as _logging
    _log = _logging.getLogger('rccm')

    if not _QR_AVAILABLE:
        _log.warning(
            'RCCM — QR code désactivé : bibliothèque « qrcode[pil] » non installée. '
            'Installer avec : pip install "qrcode[pil]==7.4.2"'
        )
        return None
    if not text:
        return None
    try:
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=border,
        )
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return buf
    except Exception as _exc:
        _log.warning(
            'RCCM — Échec génération QR code  contenu="%s..."  erreur=%s',
            text[:60], _exc,
        )
        return None


def _make_qr_footer_callback(qr_text_str, qr_size_cm=2.8, label='Vérification électronique',
                             footer_note='', lang='fr'):
    """
    Retourne un callback (canvas, doc) qui dessine :
    - le QR code en bas à droite de chaque page (si la bibliothèque qrcode est disponible)
    - le pied de page (footer_note) centré en bas (toujours rendu si fourni)

    Règle de découplage RCCM :
      • TEST / DEV : QR avec contenu texte structuré (RCCM-MR|TYPE:...|...)
      • PRODUCTION : QR avec URL de vérification (https://...)
      Cette fonction retourne TOUJOURS un callback si qr_text_str est fourni.

    Quand qrcode[pil] n'est PAS installé :
      • Un cadre de substitution visible est dessiné dans le PDF (position QR).
      • Le cadre indique explicitement : « QR CODE NON DISPONIBLE ».
      • Cette indication est visible par le greffier DANS le document.
      • Un WARNING CRITICAL est loggé côté serveur.

    En mode arabe (lang='ar'), la police du pied de page est _ARABIC_FONT
    et le texte est reconfiguré via ar() pour un affichage RTL correct.
    """
    import logging as _logging
    _log = _logging.getLogger('rccm')

    png_bytes   = None
    qr_missing  = False   # True = bibliothèque absente ou génération échouée

    if qr_text_str:
        if not _QR_AVAILABLE:
            qr_missing = True
            _log.critical(
                '⛔ RCCM — QR code MANQUANT dans les documents PDF. '
                'La bibliothèque « qrcode[pil] » n\'est pas installée. '
                'CORRECTION : pip install "qrcode[pil]==7.4.2"  '
                'puis redémarrer le serveur.'
            )
        else:
            png_data = _make_qr_buf(qr_text_str)
            if png_data is not None:
                png_bytes = png_data.read()
            else:
                qr_missing = True
                _log.critical(
                    '⛔ RCCM — Échec génération QR code (Pillow défaillant ou erreur interne). '
                    'Un cadre de substitution sera affiché dans le PDF. '
                    'Vérifier : pip install "qrcode[pil]==7.4.2"'
                )

    # ── Garantie : toujours retourner un callback si du contenu est disponible ──
    if not qr_text_str and not footer_note:
        return None

    # Préparer le texte du pied de page une seule fois (hors callback)
    _footer_text = ar(footer_note) if lang == 'ar' and footer_note else footer_note
    _footer_font = _ARABIC_FONT    if lang == 'ar' else 'Helvetica-Oblique'

    def _callback(canvas_obj, doc_obj):
        pw    = doc_obj.pagesize[0]
        lm    = doc_obj.leftMargin
        qr_sz = qr_size_cm * cm
        # ── Règle RCCM : QR code à l'opposé du signataire ──────────────────
        #   FR (LTR) : signataire à droite → QR à gauche  (marge gauche)
        #   AR (RTL) : signataire à gauche → QR à droite  (marge droite)
        x_qr  = (pw - qr_sz - 1.5 * cm) if lang == 'ar' else lm
        y_qr  = 0.7 * cm
        canvas_obj.saveState()

        # ── QR code (image réelle) ───────────────────────────────────────
        if png_bytes is not None:
            canvas_obj.drawImage(
                ImageReader(io.BytesIO(png_bytes)),
                x_qr, y_qr,
                width=qr_sz, height=qr_sz,
                preserveAspectRatio=True, mask='auto',
            )
            canvas_obj.setFont('Helvetica', 5.5)
            canvas_obj.setFillColor(colors.HexColor('#888888'))
            canvas_obj.drawCentredString(x_qr + qr_sz / 2, y_qr - 0.3 * cm, label)

        # ── Cadre de substitution visible si QR manquant ─────────────────
        # Indication explicite côté greffier : le QR est absent pour une raison technique.
        elif qr_missing:
            # Rectangle rouge orangé avec bordure
            canvas_obj.setStrokeColor(colors.HexColor('#c0392b'))
            canvas_obj.setFillColor(colors.HexColor('#fdf2f0'))
            canvas_obj.setLineWidth(1.0)
            canvas_obj.rect(x_qr, y_qr, qr_sz, qr_sz, fill=1, stroke=1)
            # Croix diagonale
            canvas_obj.setStrokeColor(colors.HexColor('#e74c3c'))
            canvas_obj.setLineWidth(0.5)
            canvas_obj.line(x_qr + 3, y_qr + 3, x_qr + qr_sz - 3, y_qr + qr_sz - 3)
            canvas_obj.line(x_qr + qr_sz - 3, y_qr + 3, x_qr + 3, y_qr + qr_sz - 3)
            # Texte d'avertissement
            canvas_obj.setFont('Helvetica-Bold', 5.5)
            canvas_obj.setFillColor(colors.HexColor('#c0392b'))
            mid_x = x_qr + qr_sz / 2
            mid_y = y_qr + qr_sz / 2
            canvas_obj.drawCentredString(mid_x, mid_y + 0.25 * cm, 'QR CODE')
            canvas_obj.drawCentredString(mid_x, mid_y + 0.02 * cm, 'NON DISPONIBLE')
            canvas_obj.setFont('Helvetica', 4.5)
            canvas_obj.setFillColor(colors.HexColor('#7f1f1f'))
            canvas_obj.drawCentredString(mid_x, mid_y - 0.22 * cm, 'pip install qrcode[pil]')

        # ── Pied de page (note de validité) ──────────────────────────────
        if _footer_text:
            y_note = 0.85 * cm
            canvas_obj.setFont(_footer_font, 7.5)
            canvas_obj.setFillColor(colors.HexColor('#333333'))
            canvas_obj.drawCentredString(pw / 2, y_note, _footer_text)
            # Ligne de séparation au-dessus — couleur RCCM
            canvas_obj.setStrokeColor(COLORS['border'])
            canvas_obj.setLineWidth(0.4)
            canvas_obj.line(lm, y_note + 0.55 * cm, pw - lm, y_note + 0.55 * cm)

        canvas_obj.restoreState()

    return _callback


# ── Dictionnaire i18n PDF ─────────────────────────────────────────────────────

_PDF_LABELS = {
    # ── Communs ──────────────────────────────────────────────────────────────
    'fait_a':             {'fr': 'Fait à Nouakchott, le',
                           'ar': 'حُرِّر في نواكشوط بتاريخ'},
    'delivre_le':         {'fr': 'Délivré le',
                           'ar': 'سُلِّم بتاريخ'},
    'observations':       {'fr': 'Observations',
                           'ar': 'ملاحظات'},
    'cert_phrase':        {'fr': 'Le présent certificat est délivré pour servir et valoir ce que de droit.',
                           'ar': 'وعليه سُلِّمت هذه الإفادة للإدلاء بها عند الحاجة.'},
    'acte_phrase':        {'fr': 'Le présent acte est délivré pour servir et valoir ce que de droit.',
                           'ar': 'سُلِّمت هذه الوثيقة لتفيد وتُعمل بها في كل ما يلزم قانوناً.'},
    # ── Références ───────────────────────────────────────────────────────────
    'num_chrono':         {'fr': 'N° chronologique',
                           'ar': 'الرقم الكرونولوجي'},
    'num_analytique':     {'fr': 'N° Analytique',
                           'ar': 'الرقم التحليلي'},
    'date_immat':         {'fr': "Date et heure d'immatriculation",
                           'ar': 'تاريخ وتوقيت التقييد'},
    'greffe':             {'fr': 'Greffe',
                           'ar': 'كتابة الضبط'},
    'num_enreg':          {'fr': "N° d'enregistrement",
                           'ar': 'رقم التسجيل'},
    'date_enreg':         {'fr': "Date d'enregistrement",
                           'ar': 'تاريخ التسجيل'},
    # ── Identification ────────────────────────────────────────────────────────
    'type_entite':        {'fr': "Type d'entité",
                           'ar': 'نوع الكيان'},
    'denomination':       {'fr': 'Dénomination / Raison sociale',
                           'ar': 'التسمية / الاسم التجاري'},
    'denomination_sc':    {'fr': 'Dénomination / Nom commercial',
                           'ar': 'التسمية / الاسم التجاري'},
    'nom_commercial':     {'fr': 'Nom commercial',
                           'ar': 'الاسم التجاري'},
    'forme_juridique':    {'fr': 'Forme juridique',
                           'ar': 'الشكل القانوني'},
    'capital_social':     {'fr': 'Capital social',
                           'ar': 'رأس المال الاجتماعي'},
    'siege_social':       {'fr': 'Adresse du siège social',
                           'ar': 'عنوان المقر الاجتماعي'},
    'siege_social_sc':    {'fr': 'Siège social / Adresse',
                           'ar': 'المقر الاجتماعي / العنوان'},
    'adresse_succ':       {'fr': 'Adresse de la succursale',
                           'ar': 'عنوان الفرع'},
    'objet_activite':     {'fr': 'Objet social / Activité principale',
                           'ar': 'الغرض الاجتماعي / النشاط الرئيسي'},
    'objet_activite2':    {'fr': 'Objet social / Activité',
                           'ar': 'الغرض الاجتماعي / النشاط'},
    'objet_activite_sc':  {'fr': 'Activités / Objet social',
                           'ar': 'الأنشطة / الغرض الاجتماعي'},
    'activite_sc':        {'fr': 'Activités / Objet',
                           'ar': 'الأنشطة / الغرض'},
    'activite_ph':        {'fr': 'Activité exercée',
                           'ar': 'النشاط الممارس'},
    'activite_gen':       {'fr': 'Activité',
                           'ar': 'النشاط'},
    'domaine_activite':   {'fr': "Domaine d'activité",
                           'ar': 'مجال النشاط'},
    'origine_fonds':      {'fr': 'Origine des fonds',
                           'ar': 'مصدر الأموال'},
    'identite_decl':      {'fr': 'Identité du déclarant',
                           'ar': 'هوية المُصرِّح'},
    # ── Personne Physique ─────────────────────────────────────────────────────
    'nom_prenoms':        {'fr': 'Nom et prénoms',
                           'ar': 'الاسم واللقب'},
    'date_naissance':     {'fr': 'Date de naissance',
                           'ar': 'تاريخ الميلاد'},
    'lieu_naissance':     {'fr': 'Lieu de naissance',
                           'ar': 'مكان الميلاد'},
    'nationalite':        {'fr': 'Nationalité',
                           'ar': 'الجنسية'},
    'nni':                {'fr': 'NNI',
                           'ar': 'رقم الهوية الوطنية'},
    'adresse_domicile':   {'fr': 'Domicile / Adresse',
                           'ar': 'محل الإقامة / العنوان'},
    'adresse':            {'fr': 'Adresse',
                           'ar': 'العنوان'},
    'telephone':          {'fr': 'Téléphone',
                           'ar': 'الهاتف'},
    'piece_identite':     {'fr': "Pièce d'identité",
                           'ar': 'وثيقة الهوية'},
    'nee':                {'fr': 'Né(e)',
                           'ar': 'المولود(ة)'},
    # ── Personne Morale ───────────────────────────────────────────────────────
    'duree':              {'fr': 'Durée',
                           'ar': 'مدة الشركة'},
    'objet_social':       {'fr': 'Objet social',
                           'ar': 'الغرض الاجتماعي'},
    'fax':                {'fr': 'Fax',
                           'ar': 'الفاكس'},
    'site_web':           {'fr': 'Site web',
                           'ar': 'الموقع الإلكتروني'},
    'bp':                 {'fr': 'B.P.',
                           'ar': 'صندوق البريد'},
    # ── En-têtes de sections — Extrait RC ─────────────────────────────────────
    'sec_references':     {'fr': 'I. RÉFÉRENCES',
                           'ar': 'I. بيانات مرجعية'},
    'sec_identification': {'fr': 'II. IDENTIFICATION',
                           'ar': 'II. التعريف'},
    'sec_info_ph':        {'fr': 'III. INFORMATIONS DU COMMERÇANT',
                           'ar': 'III. بيانات التاجر'},
    'sec_info_pm':        {'fr': 'II. INFORMATIONS DE LA PERSONNE MORALE',
                           'ar': 'II. بيانات الشخص المعنوي'},
    'sec_info_sc':        {'fr': 'III. INFORMATIONS DE LA SUCCURSALE',
                           'ar': 'III. بيانات الفرع'},
    'sec_societe_mere':   {'fr': 'IV. SOCIÉTÉ MÈRE',
                           'ar': 'IV. الشركة الأم'},
    'sec_gerants_pm':     {'fr': 'IV. GÉRANTS / DIRIGEANTS',
                           'ar': 'IV. المديرون / الرؤساء'},
    'sec_gerants_sc':     {'fr': 'V. DIRECTEUR(S)',
                           'ar': 'V. المدير (المديرون)'},
    'sec_associes':       {'fr': 'V. ASSOCIÉS / ACTIONNAIRES',
                           'ar': 'V. الشركاء / المساهمون'},
    'sec_conseil_admin':  {'fr': 'VI. CONSEIL D\'ADMINISTRATION',
                           'ar': 'VI. مجلس الإدارة'},
    'sec_commissaires':   {'fr': 'VII. COMMISSAIRES AUX COMPTES',
                           'ar': 'VII. مراقبو الحسابات'},
    'fonction_ca':        {'fr': 'Fonction au CA',
                           'ar': 'المهمة في مجلس الإدارة'},
    'role_comm':          {'fr': 'Rôle',
                           'ar': 'الدور'},
    'type_comm':          {'fr': 'Type',
                           'ar': 'النوع'},
    'mandat_fin':         {'fr': 'Fin de mandat',
                           'ar': 'نهاية المأمورية'},
    # ── Société mère ─────────────────────────────────────────────────────────
    'denom_sociale':      {'fr': 'Dénomination sociale',
                           'ar': 'الاسم التجاري'},
    'num_rc':             {'fr': 'N° RC',
                           'ar': 'رقم السجل التجاري'},
    'date_depot':         {'fr': 'Date dépôt statuts',
                           'ar': 'تاريخ إيداع القانون الأساسي'},
    'pays_origine':       {'fr': "Pays d'origine",
                           'ar': 'بلد المنشأ'},
    # ── Gérant / Associé ─────────────────────────────────────────────────────
    'nom_prenom_g':       {'fr': 'Nom et prénom',
                           'ar': 'الاسم واللقب'},
    'fonction':           {'fr': 'Fonction',
                           'ar': 'المنصب'},
    'nom_denom':          {'fr': 'Nom / Dénomination',
                           'ar': 'الاسم / التسمية'},
    'num_rc_id':          {'fr': 'N° RC / Identifiant',
                           'ar': 'رقم السجل / المعرف'},
    'date_immat_assoc':   {'fr': 'Date immatriculation',
                           'ar': 'تاريخ التسجيل'},
    'part_capital':       {'fr': 'Part du capital',
                           'ar': 'حصة في رأس المال'},
    'nombre_parts':       {'fr': 'Nombre de parts',
                           'ar': 'عدد الحصص'},
    'passeport':          {'fr': 'Passeport',
                           'ar': 'جواز السفر'},
    # ── Sections Certificat Chrono SC ────────────────────────────────────────
    'sec_succursale':     {'fr': 'SUCCURSALE',
                           'ar': 'الفرع'},
    'sec_sm_sc':          {'fr': 'SOCIÉTÉ MÈRE',
                           'ar': 'الشركة الأم'},
    'sm_non_renseigne':   {'fr': '<i>Informations de la société mère non renseignées.</i>',
                           'ar': '<i>لم يتم إدخال بيانات الشركة الأم.</i>'},
    # ── Attestation / Extrait RBE ─────────────────────────────────────────────
    'num_decl_rbe':       {'fr': 'N° Déclaration RBE',
                           'ar': 'رقم إقرار المستفيدين الحقيقيين'},
    'denomination_rbe':   {'fr': 'Dénomination / Raison sociale',
                           'ar': 'التسمية / الاسم التجاري'},
    'denom_rbe2':         {'fr': 'Dénomination',
                           'ar': 'التسمية'},
    'type_decl':          {'fr': 'Type de déclaration',
                           'ar': 'نوع الإقرار'},
    'date_decl':          {'fr': 'Date de déclaration',
                           'ar': 'تاريخ الإقرار'},
    'statut_rbe':         {'fr': 'Statut',
                           'ar': 'الوضع'},
    'greffe_rbe':         {'fr': 'Greffe',
                           'ar': 'كتابة الضبط'},
    'num_rc_lie':         {'fr': 'N° RC (lié)',
                           'ar': 'رقم السجل التجاري (المرتبط)'},
    'nb_beneficiaires':   {'fr': 'Nombre de bénéficiaires effectifs',
                           'ar': 'عدد المستفيدين الحقيقيين'},
    'sec_decl':           {'fr': 'DÉCLARATION',
                           'ar': 'الإقرار'},
    'sec_declarant':      {'fr': 'DÉCLARANT',
                           'ar': 'المُقِرّ'},
    'sec_beneficiaires':  {'fr': 'BÉNÉFICIAIRES EFFECTIFS',
                           'ar': 'المستفيدون الحقيقيون'},
    'sec_observations':   {'fr': 'OBSERVATIONS',
                           'ar': 'الملاحظات'},
    'qualite':            {'fr': 'Qualité',
                           'ar': 'الصفة'},
    'email':              {'fr': 'E-mail',
                           'ar': 'البريد الإلكتروني'},
    'ben_eff_n':          {'fr': 'Bénéficiaire effectif n°',
                           'ar': 'المستفيد الحقيقي رقم'},
    'nom_complet':        {'fr': 'Nom complet',
                           'ar': 'الاسم الكامل'},
    'nom_arabe':          {'fr': 'Nom (arabe)',
                           'ar': 'الاسم بالعربية'},
    'doc_identification': {'fr': "Document d'identification",
                           'ar': 'وثيقة التعريف'},
    'nature_controle':    {'fr': 'Nature du contrôle',
                           'ar': 'طبيعة السيطرة'},
    'pct_detention':      {'fr': '% de détention',
                           'ar': '% حصة الملكية'},
    'date_prise_effet':   {'fr': "Date de prise d'effet",
                           'ar': 'تاريخ سريان المفعول'},
    # ── Radiation ────────────────────────────────────────────────────────────
    'num_radiation':      {'fr': 'N° Radiation',
                           'ar': 'رقم الشطب'},
    'date_radiation':     {'fr': 'Date et heure de radiation',
                           'ar': 'تاريخ ووقت الشطب'},
    'num_ra':             {'fr': 'N° Analytique (RA)',
                           'ar': 'الرقم التحليلي (س.ت.ت)'},
    'num_rc2':            {'fr': 'N° Registre du Commerce (RC)',
                           'ar': 'رقم السجل التجاري'},
    'motif':              {'fr': 'Motif de radiation',
                           'ar': 'سبب الشطب'},
    'description':        {'fr': 'Description',
                           'ar': 'الوصف'},
    'valide_par':         {'fr': 'Validé par',
                           'ar': 'صودق عليه من قِبَل'},
    'date_validation':    {'fr': 'Date de validation',
                           'ar': 'تاريخ المصادقة'},
    'radie_mention':      {'fr': '⊘ RADIÉ DU REGISTRE DU COMMERCE',
                           'ar': '⊘ مشطوب من السجل التجاري'},
    'ph_label':           {'fr': 'Personne Physique',
                           'ar': 'شخص طبيعي'},
    'pm_label':           {'fr': 'Personne Morale',
                           'ar': 'شخص اعتباري'},
    'sc_label':           {'fr': 'Succursale',
                           'ar': 'فرع'},
    # ── Inscription modificative ──────────────────────────────────────────────
    'num_modif':          {'fr': 'N° Modification',
                           'ar': 'رقم التعديل'},
    'date_modif':         {'fr': 'Date et heure de modification',
                           'ar': 'تاريخ ووقت التعديل'},
    'date_demande':       {'fr': 'Date de la demande',
                           'ar': 'تاريخ الطلب'},
    'cree_par':           {'fr': 'Demandé par',
                           'ar': 'مقدَّم من'},
    'demandeur':          {'fr': 'Demandeur',
                           'ar': 'مُقدِّم الطلب'},
    'sec_ent_modif':      {'fr': 'I. IDENTIFICATION DE L\'ENTREPRISE',
                           'ar': 'I. التعريف بالمنشأة'},
    'sec_ref_operation':  {'fr': 'II. RÉFÉRENCES DE L\'OPÉRATION',
                           'ar': 'II. مرجع العملية'},
    'sec_detail_modif':   {'fr': 'III. MODIFICATIONS ENREGISTRÉES',
                           'ar': 'III. التعديلات المُسجَّلة'},
    'objet_modif_intro':  {'fr': 'La présente inscription modificative porte sur les éléments suivants :',
                           'ar': 'يتعلق هذا القيد التعديلي بالعناصر التالية :'},
    'cert_modif_phrase':  {'fr': ('Le présent certificat atteste que la présente inscription modificative '
                                  'a été régulièrement portée au registre du commerce.'),
                           'ar': ('تُشهد هذه الشهادة بأن القيد التعديلي المذكور قد سُجِّل قانونياً '
                                  'في السجل التجاري.')},
    'nom_commercial_ph':  {'fr': 'Nom commercial (enseigne)',
                           'ar': 'الاسم التجاري (الشعار)'},
    'gerant_ph':          {'fr': 'Gérant',
                           'ar': 'المسير'},
    # ── Pieds de page ─────────────────────────────────────────────────────────
    'mention_provisoire': {'fr': ('Le présent certificat constate un enregistrement au registre '
                                  'chronologique et ne vaut pas immatriculation au RCCM.'),
                           'ar': ''},   # Construit dynamiquement dans CertificatChronologiqueView
    'validity_3months':   {'fr': 'NB : La validité de cet extrait est de trois (3) mois à compter du {date}.',
                           'ar': 'ملاحظة: صلاحية هذا المستخرج ثلاثة (3) أشهر من تاريخ {date}.'},
    'qr_label':           {'fr': 'Vérification électronique',
                           'ar': 'التحقق الإلكتروني'},
    # ── Mentions certifiantes ─────────────────────────────────────────────────
    'be_declare_text':    {'fr': ("Le bénéficiaire effectif a été déclaré le {date}. "
                                  "Toute modification ultérieure doit être déclarée dans un délai "
                                  "d'un (1) mois, conformément à l'article 63 du décret n°2021-033."),
                           'ar': ('تم الإعلان عن المستفيد الحقيقي بتاريخ {date}. '
                                  'يجب الإقرار بأي تعديل لاحق في غضون شهر (1) وفقاً '
                                  'للمادة 63 من المرسوم رقم 2021-033.')},
    'be_non_declare_text':{'fr': ("Le dirigeant doit déclarer le bénéficiaire effectif dans un délai "
                                  "de quinze (15) jours à compter de la date d'immatriculation, "
                                  "conformément à l'article 63 du décret n°2021-033."),
                           'ar': ('يجب على المسير الإقرار بالمستفيد الحقيقي في غضون خمسة عشر (15) '
                                  'يوماً من تاريخ التسجيل وفقاً للمادة 63 من المرسوم رقم 2021-033.')},
}


def _L(key, lang):
    """Retourne le label PDF dans la langue demandée (fr/ar). Fallback : français."""
    entry = _PDF_LABELS.get(key, {})
    return entry.get(lang) or entry.get('fr') or key


# ── Helpers contenu dynamique ─────────────────────────────────────────────────

def _row_if(label, val):
    """Retourne [label, str(val)] uniquement si val est non vide/nul."""
    if val is None:
        return None
    sv = str(val).strip()
    if not sv or sv in ('—', 'None', 'none'):
        return None
    return [label, sv]


def _add_rows(lst, *items):
    """Ajoute dans lst les items non-None uniquement."""
    for item in items:
        if item is not None:
            lst.append(item)


def _build_info_table(rows, col_w=None, lang='fr'):
    """Construit un Table info-style à partir de rows (None si la liste est vide).

    Les cellules contenant une chaîne brute sont automatiquement enveloppées dans
    un Paragraph afin que le texte long revienne à la ligne verticalement au lieu
    de déborder horizontalement.  Les cellules déjà de type Paragraph (ex. arabe)
    sont conservées telles quelles.
    Si lang='ar', les cellules texte brut sont converties en Paragraphe arabe RTL.
    """
    if not rows:
        return None
    cw = col_w or [6 * cm, 10.5 * cm]

    if lang == 'ar':
        # Styles explicites sans héritage de parent pour garantir TA_RIGHT.
        # La colonne label (narrow) sera physiquement placée à droite après swap,
        # la colonne valeur (wide) sera à gauche → rendu RTL naturel.
        _val_style = ParagraphStyle(
            '_cell_val_ar',
            fontName=_ARABIC_FONT, fontSize=9,
            leading=12, alignment=TA_RIGHT,
            spaceAfter=0, spaceBefore=0,
        )
        _lbl_style = ParagraphStyle(
            '_cell_lbl_ar',
            fontName=_ARABIC_FONT, fontSize=9,
            leading=12, alignment=TA_RIGHT,
            spaceAfter=0, spaceBefore=0,
        )
        # Inversion physique des largeurs : valeur (large) à gauche, label (étroit) à droite
        cw = list(reversed(cw))
    else:
        # Style de base pour les cellules valeur (colonne 1)
        _val_style = ParagraphStyle(
            '_cell_val',
            fontName='Helvetica', fontSize=9,
            leading=12, spaceAfter=0, spaceBefore=0,
        )
        # Style bold pour les cellules label (colonne 0)
        _lbl_style = ParagraphStyle(
            '_cell_lbl',
            fontName='Helvetica-Bold', fontSize=9,
            leading=12, spaceAfter=0, spaceBefore=0,
        )

    wrapped = []
    for row in rows:
        new_row = []
        for idx, cell in enumerate(row):
            if isinstance(cell, str):
                style = _lbl_style if idx == 0 else _val_style
                text  = ar(cell) if lang == 'ar' else cell
                new_row.append(Paragraph(text, style))
            else:
                new_row.append(cell)   # Paragraph arabe ou autre objet — inchangé
        # En arabe : inversion physique label/valeur pour placer le label à droite (RTL)
        if lang == 'ar' and len(new_row) == 2:
            new_row = [new_row[1], new_row[0]]
        wrapped.append(new_row)

    t = Table(wrapped, colWidths=cw)
    t.setStyle(_info_table_style(lang=lang))
    return t


def _get_sc_donnees(ra):
    """Récupère les données complémentaires SC (maison_mere, objet_social, directeurs).
    Source 1 : ImmatriculationHistorique.donnees  (reverse OneToOne)
    Source 2 : RegistreChronologique.description  (JSON)
    """
    try:
        ih = getattr(ra, 'immatriculation_historique', None)
        if ih and ih.donnees:
            return ih.donnees
    except Exception:
        pass
    try:
        rc = RegistreChronologique.objects.filter(ra=ra).order_by('-date_enregistrement').first()
        if rc and rc.description:
            return _json.loads(rc.description)
    except Exception:
        pass
    return {}


def _get_pm_objet_social(ra):
    """Récupère l'objet social d'une PM.
    Source 1 : ImmatriculationHistorique.donnees  (immatriculation historique)
    Source 2 : RegistreChronologique.description  (immatriculation directe)
    """
    try:
        ih = getattr(ra, 'immatriculation_historique', None)
        if ih and ih.donnees:
            val = ih.donnees.get('objet_social', '') or ih.donnees.get('activite', '')
            if val:
                return val
    except Exception:
        pass
    try:
        rc = (RegistreChronologique.objects
              .filter(ra=ra)
              .order_by('-date_enregistrement')
              .first())
        if not rc:
            rc = RegistreChronologique.objects.filter(ra=ra).order_by('-created_at').first()
        if rc and rc.description:
            desc = (_json.loads(rc.description)
                    if isinstance(rc.description, str)
                    else rc.description)
            return desc.get('objet_social', '') or desc.get('activite', '') or ''
    except Exception:
        pass
    return ''


# ── Motifs de radiation bilingues ─────────────────────────────────────────────
# Les codes métier ne changent jamais ; seul le libellé affiché dépend de lang.
_MOTIF_RADIATION = {
    'CESSATION':   {'fr': "Cessation d'activités", 'ar': 'توقف النشاط'},
    'DISSOLUTION': {'fr': 'Dissolution',            'ar': 'الحل'},
    'LIQUIDATION': {'fr': 'Liquidation',            'ar': 'التصفية'},
    'FAILLITE':    {'fr': 'Faillite',               'ar': 'الإفلاس'},
    'FUSION':      {'fr': 'Fusion',                 'ar': 'الاندماج'},
    'AUTRE':       {'fr': 'Autre',                  'ar': 'آخر'},
}


def _motif_label(motif_code, lang='fr'):
    """Retourne le libellé traduit d'un motif de radiation selon la langue.
    Fallback : libellé FR, puis le code brut."""
    entry = _MOTIF_RADIATION.get(motif_code or '', {})
    return entry.get(lang) or entry.get('fr') or motif_code or '—'


def _strip_rc_numero(numero_rc):
    """
    Affiche uniquement le numéro chronologique, sans l'année.
    Gère les formats courants : 'AAAA/NNN', 'AAAA-NNN', 'NNN/AAAA', 'NNN-AAAA'.
    Retourne la valeur telle quelle si aucun séparateur année n'est détecté.
    """
    if not numero_rc:
        return ''
    val = str(numero_rc).strip()
    for sep in ('/', '-'):
        parts = val.split(sep)
        if len(parts) == 2:
            left, right = parts[0].strip(), parts[1].strip()
            # L'année est la partie à 4 chiffres
            if left.isdigit() and len(left) == 4:
                return right  # format AAAA/NNN → retourne NNN
            if right.isdigit() and len(right) == 4:
                return left   # format NNN/AAAA → retourne NNN
    return val


def _fmt_capital(val, devise='MRU'):
    """Formate un capital social avec sa devise (ex. 5 000 000 MRU).
    La devise est obligatoire (CDC : le capital ne s'affiche jamais sans devise).
    """
    if not val:
        return '—'
    devise = (devise or 'MRU').strip()
    try:
        return f"{float(val):,.0f} {devise}".replace(',', ' ')
    except Exception:
        return f"{val} {devise}"


def _numero_chrono_display(numero_chrono):
    """
    Normalise l'affichage du numéro d'enregistrement chronologique.
    Garantit un résultat purement numérique sur 4 chiffres minimum (CDC).

    Formats gérés :
      • Nouveau format  : '0001' (déjà pur 4 c.) → '0001'
      • Ancien 8 chiffres: '00000009'             → '0009'
      • Ancien format   : 'RC2026000009'           → '0009'
      • Variantes       : 'RC2025001234'           → '1234'
    """
    import re as _re
    if not numero_chrono:
        return '—'
    val = str(numero_chrono).strip()
    # Déjà purement numérique → normaliser sur 4 chiffres
    if _re.match(r'^\d+$', val):
        try:
            return str(int(val)).zfill(4)
        except ValueError:
            return val
    # Ancien format préfixé : lettres + 4 chiffres année + séquence (ex: RC2026000009)
    m = _re.match(r'^[A-Za-z]+(\d{4})(\d+)$', val)
    if m:
        try:
            return str(int(m.group(2))).zfill(4)
        except ValueError:
            return m.group(2)
    # Fallback : supprimer tout caractère non numérique
    digits = _re.sub(r'[^0-9]', '', val)
    if digits:
        try:
            return str(int(digits)).zfill(4)
        except ValueError:
            return digits
    return val


def _get_numero_chrono(ra):
    """Retourne le N° chronologique d'un RA, avec cascade quadruple robuste.

    Stratégie (priorité décroissante) :
      1. ra.numero_rc stripped  — référence AAAA/NNN déjà stockée sur le RA.
      2. Premier RC VALIDE      — statut='VALIDE', trié par date validation DESC.
      3. Premier RC quelconque  — tout statut (BROUILLON, EN_INSTANCE, etc.)
         couvre le cas fréquent en test/Cloud où le RC n'est pas encore validé.
      4. ra.numero_rc brut      — si pas de séparateur AAAA/NNN (ancien format).

    Compatible avec prefetch_related('chronos') et prefetch_related('ra__chronos').
    Ne lève jamais d'exception ; retourne '—' si aucune donnée disponible.
    """
    if ra is None:
        return '—'
    # 1. ra.numero_rc stripped
    n = _strip_rc_numero(getattr(ra, 'numero_rc', '') or '')
    if n:
        return n
    # 2. Premier chrono VALIDE (prefetch déjà en place dans toutes les vues)
    try:
        rc_obj = ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
        if rc_obj and rc_obj.numero_chrono:
            return _numero_chrono_display(str(rc_obj.numero_chrono).strip())
    except Exception:
        pass
    # 3. Tout chrono lié au RA, quel que soit son statut
    # (couvre BROUILLON / EN_INSTANCE quand le greffier n'a pas encore validé)
    try:
        rc_any = ra.chronos.order_by('id').first()
        if rc_any and rc_any.numero_chrono:
            return _numero_chrono_display(str(rc_any.numero_chrono).strip())
    except Exception:
        pass
    # 4. ra.numero_rc brut
    raw = (getattr(ra, 'numero_rc', '') or '').strip()
    return raw or '—'


def _gerant_block(g, styles, sec_style, normal_style, lang='fr'):
    """Construit le bloc info d'un gérant / directeur (rows dynamiques)."""
    if g.pm:
        nom_fr = g.pm.denomination if g.pm else ''
    elif g.ph:
        civ     = _civ(getattr(g.ph, 'civilite', ''), lang) or \
                  _civ((g.donnees_ident or {}).get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        _prenom = (g.ph.prenom_ar or g.ph.prenom or '') if lang == 'ar' else (g.ph.prenom or '')
        _nom    = (g.ph.nom_ar    or g.ph.nom    or '') if lang == 'ar' else (g.ph.nom    or '')
        nom_fr  = f"{civ} {_prenom} {_nom}".strip()
    else:
        di     = g.donnees_ident or {}
        civ    = _civ(di.get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        prenom = di.get('prenom', '')
        _nom   = g.nom_gerant or ''
        nom_fr = f"{civ} {prenom} {_nom}".strip()
    if not nom_fr:
        return []
    rows = [[_L('nom_prenom_g', lang), nom_fr]]
    # NNI et passeport supprimés (données sensibles — principe de nécessité)
    nat_lib = ''
    if g.nationalite:
        nat_lib = (g.nationalite.libelle_ar if lang == 'ar' else g.nationalite.libelle_fr) or ''
    elif g.ph and g.ph.nationalite:
        nat_lib = (g.ph.nationalite.libelle_ar if lang == 'ar' else g.ph.nationalite.libelle_fr) or ''
    if nat_lib:
        rows.append([_L('nationalite', lang), nat_lib])
    if g.fonction:
        fct_lib = (g.fonction.libelle_ar if lang == 'ar' else g.fonction.libelle_fr) or ''
        rows.append([_L('fonction', lang), fct_lib])
    return rows


def _associe_block(a, lang='fr'):
    """Construit le bloc info d'un associé (rows dynamiques)."""
    if a.pm:
        nom = a.pm.denomination or ''
    elif a.ph:
        civ     = _civ(getattr(a.ph, 'civilite', ''), lang) or \
                  _civ((a.donnees_ident or {}).get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        _prenom = (a.ph.prenom_ar or a.ph.prenom or '') if lang == 'ar' else (a.ph.prenom or '')
        _nom    = (a.ph.nom_ar    or a.ph.nom    or '') if lang == 'ar' else (a.ph.nom    or '')
        nom     = f"{civ} {_prenom} {_nom}".strip()
    else:
        di     = a.donnees_ident or {}
        civ    = _civ(di.get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        prenom = di.get('prenom', '')
        _nom   = a.nom_associe or ''
        nom    = f"{civ} {prenom} {_nom}".strip()
    if not nom:
        return []
    rows = [[_L('nom_denom', lang), nom]]
    di   = a.donnees_ident or {}

    if a.type_associe == 'PH':
        # NNI, passeport, date et lieu de naissance supprimés (données sensibles)
        pass
    else:  # PM
        num_rc     = di.get('numero_rc')
        date_immat = di.get('date_immatriculation')
        if num_rc:     rows.append([_L('num_rc_id', lang),          num_rc])
        if date_immat: rows.append([_L('date_immat_assoc', lang),   date_immat])

    nat_lib = ''
    if a.nationalite:
        nat_lib = (a.nationalite.libelle_ar if lang == 'ar' else a.nationalite.libelle_fr) or ''
    elif a.ph and a.ph.nationalite:
        nat_lib = (a.ph.nationalite.libelle_ar if lang == 'ar' else a.ph.nationalite.libelle_fr) or ''
    if nat_lib:
        rows.append([_L('nationalite', lang), nat_lib])
    if a.pourcentage:
        rows.append([_L('part_capital', lang), f"{a.pourcentage:.2f} %"])
    elif a.nombre_parts:
        rows.append([_L('nombre_parts', lang), str(a.nombre_parts)])
    return rows


def _administrateur_block(adm, lang='fr'):
    """Construit le bloc info d'un administrateur SA (extrait analytique)."""
    civ = _civ(adm.civilite or '', lang)
    # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
    if lang == 'ar' and (adm.nom_ar or adm.prenom_ar):
        nom_parts = [civ, adm.prenom_ar or adm.prenom or '', adm.nom_ar or adm.nom or '']
    else:
        nom_parts = [civ, adm.prenom or '', adm.nom or '']
    nom_complet = ' '.join(p for p in nom_parts if p)
    if not nom_complet:
        return []
    rows = [[_L('nom_prenom_g', lang), nom_complet]]
    if adm.fonction:
        rows.append([_L('fonction_ca', lang), adm.fonction])
    nat_lib = ''
    if adm.nationalite:
        nat_lib = (adm.nationalite.libelle_ar if lang == 'ar' else adm.nationalite.libelle_fr) or ''
    if nat_lib:
        rows.append([_L('nationalite', lang), nat_lib])
    if adm.date_debut:
        rows.append([_L('fonction', lang), str(adm.date_debut)])
    if adm.date_fin:
        rows.append([_L('mandat_fin', lang), str(adm.date_fin)])
    return rows


def _commissaire_block(comm, lang='fr'):
    """Construit le bloc info d'un commissaire aux comptes SA (extrait analytique)."""
    # civilite uniquement pour PH ; PM → cabinet → pas de civilité
    if comm.type_commissaire == 'PH':
        civ = _civ(comm.civilite or '', lang)
        if lang == 'ar' and comm.nom_ar:
            nom_complet = f"{civ} {comm.nom_ar}".strip()
        else:
            nom_complet = ' '.join(p for p in [civ, comm.prenom or '', comm.nom or ''] if p)
    else:
        # PM — dénomination sociale, pas de civilité
        nom_complet = comm.nom or ''
    if not nom_complet:
        return []
    rows = [[_L('nom_denom', lang), nom_complet]]
    # Rôle : Titulaire / Suppléant
    _role_labels = {
        'TITULAIRE': {'fr': 'Titulaire', 'ar': 'أصيل'},
        'SUPPLEANT': {'fr': 'Suppléant', 'ar': 'نائب'},
    }
    role_lib = _role_labels.get(comm.role or 'TITULAIRE', {}).get(lang, comm.role or '')
    rows.append([_L('role_comm', lang), role_lib])
    # Type : PH / PM
    _type_labels = {
        'PH': {'fr': 'Personne physique', 'ar': 'شخص طبيعي'},
        'PM': {'fr': 'Personne morale',   'ar': 'شخص معنوي'},
    }
    type_lib = _type_labels.get(comm.type_commissaire or 'PH', {}).get(lang, comm.type_commissaire or 'PH')
    rows.append([_L('type_comm', lang), type_lib])
    nat_lib = ''
    if comm.nationalite:
        nat_lib = (comm.nationalite.libelle_ar if lang == 'ar' else comm.nationalite.libelle_fr) or ''
    if nat_lib:
        rows.append([_L('nationalite', lang), nat_lib])
    if comm.date_fin:
        rows.append([_L('mandat_fin', lang), str(comm.date_fin)])
    return rows


# ── Fonctions compactes : une ligne par personne ──────────────────────────────
# Format gérant  : Prénom Nom – Nationalité – Fonction
# Format associé : Prénom Nom – Nationalité – Quote-part
# Appliqué dans les extraits/certificats PDF, en FR et AR, sans divergence.
_SEP = ' \u2013 '  # U+2013 EN DASH — séparateur lisible en FR et AR


def _gerant_line(g, lang='fr'):
    """Retourne une ligne compacte gérant/directeur : Prénom Nom – Nationalité – Fonction."""
    # ── Nom complet ─────────────────────────────────────────────────────────
    if g.pm:
        nom_full = g.pm.denomination if g.pm else ''
    elif g.ph:
        civ     = _civ(getattr(g.ph, 'civilite', ''), lang) or \
                  _civ((g.donnees_ident or {}).get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        _prenom = (g.ph.prenom_ar or g.ph.prenom or '') if lang == 'ar' else (g.ph.prenom or '')
        _nom    = (g.ph.nom_ar    or g.ph.nom    or '') if lang == 'ar' else (g.ph.nom    or '')
        nom_full = f"{civ} {_prenom} {_nom}".strip()
    else:
        di     = g.donnees_ident or {}
        civ    = _civ(di.get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        prenom = di.get('prenom', '')
        _nom   = g.nom_gerant or ''
        nom_full = f"{civ} {prenom} {_nom}".strip()
    if not nom_full:
        return ''
    parts = [nom_full]
    # ── Nationalité ─────────────────────────────────────────────────────────
    nat_lib = ''
    if g.nationalite:
        nat_lib = (g.nationalite.libelle_ar if lang == 'ar' else g.nationalite.libelle_fr) or ''
    elif g.ph and g.ph.nationalite:
        nat_lib = (g.ph.nationalite.libelle_ar if lang == 'ar' else g.ph.nationalite.libelle_fr) or ''
    if nat_lib:
        parts.append(nat_lib)
    # ── Fonction ────────────────────────────────────────────────────────────
    if g.fonction:
        fct_lib = (g.fonction.libelle_ar if lang == 'ar' else g.fonction.libelle_fr) or ''
        if fct_lib:
            parts.append(fct_lib)
    return _SEP.join(parts)


def _associe_line(a, lang='fr'):
    """Retourne une ligne compacte associé/actionnaire : Prénom Nom – Nationalité – Quote-part."""
    # ── Nom complet ─────────────────────────────────────────────────────────
    if a.pm:
        nom = a.pm.denomination or ''
    elif a.ph:
        civ     = _civ(getattr(a.ph, 'civilite', ''), lang) or \
                  _civ((a.donnees_ident or {}).get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        _prenom = (a.ph.prenom_ar or a.ph.prenom or '') if lang == 'ar' else (a.ph.prenom or '')
        _nom    = (a.ph.nom_ar    or a.ph.nom    or '') if lang == 'ar' else (a.ph.nom    or '')
        nom     = f"{civ} {_prenom} {_nom}".strip()
    else:
        di     = a.donnees_ident or {}
        civ    = _civ(di.get('civilite', ''), lang)
        # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
        prenom = di.get('prenom', '')
        _nom   = a.nom_associe or ''
        nom    = f"{civ} {prenom} {_nom}".strip()
    if not nom:
        return ''
    parts = [nom]
    # ── Nationalité ─────────────────────────────────────────────────────────
    nat_lib = ''
    if a.nationalite:
        nat_lib = (a.nationalite.libelle_ar if lang == 'ar' else a.nationalite.libelle_fr) or ''
    elif a.ph and a.ph.nationalite:
        nat_lib = (a.ph.nationalite.libelle_ar if lang == 'ar' else a.ph.nationalite.libelle_fr) or ''
    if nat_lib:
        parts.append(nat_lib)
    # ── Quote-part ──────────────────────────────────────────────────────────
    if a.pourcentage:
        parts.append(f"{a.pourcentage:.2f}\u00a0%")   # U+00A0 espace insécable avant %
    elif a.nombre_parts:
        parts.append(str(a.nombre_parts))
    return _SEP.join(parts)


def _administrateur_line(adm, lang='fr'):
    """Retourne une ligne compacte administrateur SA : Prénom Nom – Nationalité – Fonction."""
    civ = _civ(adm.civilite or '', lang)
    # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
    if lang == 'ar' and (adm.nom_ar or adm.prenom_ar):
        nom_parts = [civ, adm.prenom_ar or adm.prenom or '', adm.nom_ar or adm.nom or '']
    else:
        nom_parts = [civ, adm.prenom or '', adm.nom or '']
    nom_complet = ' '.join(p for p in nom_parts if p)
    if not nom_complet:
        return ''
    parts = [nom_complet]
    nat_lib = ''
    if adm.nationalite:
        nat_lib = (adm.nationalite.libelle_ar if lang == 'ar' else adm.nationalite.libelle_fr) or ''
    if nat_lib:
        parts.append(nat_lib)
    if adm.fonction:
        parts.append(adm.fonction)
    return _SEP.join(parts)


def _commissaire_line(comm, lang='fr'):
    """Retourne une ligne compacte commissaire SA : Nom – Rôle – Nationalité."""
    if comm.type_commissaire == 'PH':
        civ = _civ(comm.civilite or '', lang)
        if lang == 'ar' and comm.nom_ar:
            nom_complet = f"{civ} {comm.nom_ar}".strip()
        else:
            nom_complet = ' '.join(p for p in [civ, comm.prenom or '', comm.nom or ''] if p)
    else:
        nom_complet = comm.nom or ''
    if not nom_complet:
        return ''
    parts = [nom_complet]
    _role_labels = {
        'TITULAIRE': {'fr': 'Titulaire', 'ar': 'أصيل'},
        'SUPPLEANT': {'fr': 'Suppléant', 'ar': 'نائب'},
    }
    role_lib = _role_labels.get(comm.role or 'TITULAIRE', {}).get(lang, comm.role or '')
    if role_lib:
        parts.append(role_lib)
    nat_lib = ''
    if comm.nationalite:
        nat_lib = (comm.nationalite.libelle_ar if lang == 'ar' else comm.nationalite.libelle_fr) or ''
    if nat_lib:
        parts.append(nat_lib)
    return _SEP.join(parts)


def _build_persons_table(lines, lang='fr'):
    """Construit un tableau encadré pour la liste compacte de personnes.

    Chaque élément de `lines` est une chaîne déjà formatée :
      - Gérant  : 'Prénom Nom – Nationalité – Fonction'
      - Associé : 'Prénom Nom – Nationalité – 50,00 %'

    Charte visuelle RCCM (règle graphique v1.0) :
      - Fond COLORS['light_bg'] (#EAF4EE) — vert très clair, colonne label
      - Cadre BOX COLORS['primary'] (#0B6E3A) 0.8 pt — vert institutionnel RCCM
      - Séparateur inter-personnes COLORS['border'] (#0B6E3A) 0.3 pt
      - Padding identique aux autres tables (4 px vertical, 8 px horizontal)
    """
    if not lines:
        return None

    _font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
    _align = TA_RIGHT     if lang == 'ar' else TA_LEFT
    _cell_style = ParagraphStyle(
        '_person_cell',
        fontName=_font, fontSize=9,
        leading=13, alignment=_align,
        spaceAfter=0, spaceBefore=0,
    )
    # Largeur totale = somme des colonnes de _build_info_table (6 + 10.5 = 16.5 cm)
    _col_w = [16.5 * cm]

    rows = [[Paragraph(ar(line) if lang == 'ar' else line, _cell_style)]
            for line in lines]

    t = Table(rows, colWidths=_col_w)
    n = len(rows)
    style_cmds = [
        ('FONTSIZE',      (0, 0), (-1, -1), 9),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        # Fond light_bg — identique à la colonne label des tables info
        ('BACKGROUND',    (0, 0), (-1, -1), COLORS['light_bg']),
        # Cadre extérieur : couleur primaire (même que les titres de section)
        ('BOX',           (0, 0), (-1, -1), 0.8, COLORS['primary']),
        # Séparateur fin entre personnes (sauf après la dernière ligne)
        ('LINEBELOW',     (0, 0), (0, n - 2), 0.3, COLORS['border']),
        ('ALIGN',         (0, 0), (-1, -1), 'RIGHT' if lang == 'ar' else 'LEFT'),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t


# ── Vues tableau de bord & statistiques ───────────────────────────────────────

class TableauDeBordView(APIView):
    """Tableau de bord — accès réservé au greffier (CDC §3.2)."""
    permission_classes = [EstGreffier]

    def get(self, request):
        ra_stats  = RegistreAnalytique.objects.values('statut').annotate(total=Count('id'))
        ra_type   = RegistreAnalytique.objects.values('type_entite').annotate(total=Count('id'))
        dmd_stats = Demande.objects.values('statut').annotate(total=Count('id'))
        dmd_canal = Demande.objects.values('canal').annotate(total=Count('id'))
        total_ra  = RegistreAnalytique.objects.count()
        total_dmd = Demande.objects.count()
        total_imm = RegistreAnalytique.objects.filter(statut='IMMATRICULE').count()
        total_rad = RegistreAnalytique.objects.filter(statut='RADIE').count()

        return Response({
            'totaux': {
                'registres':        total_ra,
                'demandes':         total_dmd,
                'immatriculations': total_imm,
                'radiations':       total_rad,
            },
            'ra_par_statut':   list(ra_stats),
            'ra_par_type':     list(ra_type),
            'demandes_statut': list(dmd_stats),
            'demandes_canal':  list(dmd_canal),
        })


class StatistiquesView(APIView):
    """Statistiques — accès réservé au greffier (CDC §3.1/§3.2)."""
    permission_classes = [EstGreffier]

    def get(self, request):
        annee  = request.query_params.get('annee', date.today().year)
        imm_ph = RegistreAnalytique.objects.filter(type_entite='PH', date_immatriculation__year=annee).count()
        imm_pm = RegistreAnalytique.objects.filter(type_entite='PM', date_immatriculation__year=annee).count()
        imm_sc = RegistreAnalytique.objects.filter(type_entite='SC', date_immatriculation__year=annee).count()
        rad    = RegistreAnalytique.objects.filter(date_radiation__year=annee).count()

        return Response({
            'annee': annee,
            'immatriculations': {'PH': imm_ph, 'PM': imm_pm, 'SC': imm_sc, 'total': imm_ph + imm_pm + imm_sc},
            'radiations': rad,
        })


# ── Certificat d'enregistrement au registre chronologique ─────────────────────

class CertificatChronologiqueView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'certificat-chronologique'
    """
    ETAT_Certificat_Chronologique
    Génère un certificat officiel pour un enregistrement au registre chronologique.
    Contenu dynamique selon le type d'entité (PH / PM / SC).

    Règle d'accès (workflow RCCM) :
      - Greffier          : impression autorisée quel que soit le statut.
      - Agent du tribunal : impression autorisée uniquement si le dossier est
                            encore en sa possession (BROUILLON ou RETOURNE).
                            Dès que le dossier est transmis (EN_INSTANCE, VALIDE,
                            REJETE, ANNULE), l'agent perd la main.
      - Agent GU          : même règle que l'agent du tribunal (BROUILLON/RETOURNE).
    """
    permission_classes = [EstAgentOuGreffier]

    # Statuts pour lesquels un agent peut encore imprimer
    _STATUTS_AGENT_AUTORISES = ('BROUILLON', 'RETOURNE')

    def get(self, request, rc_id):
        try:
            rc = RegistreChronologique.objects.select_related(
                'ra',
                'ra__ph', 'ra__ph__nationalite',
                'ra__pm', 'ra__pm__forme_juridique',
                'ra__sc', 'ra__sc__pm_mere', 'ra__sc__pm_mere__forme_juridique',
                'validated_by',
            ).prefetch_related(
                'ra__gerants', 'ra__gerants__fonction',
            ).get(pk=rc_id)
        except RegistreChronologique.DoesNotExist:
            return Response({'detail': 'Enregistrement introuvable.'}, status=http_status.HTTP_404_NOT_FOUND)

        # ── Contrôle rôle × statut ────────────────────────────────────────────
        if not est_greffier(request.user):
            if rc.statut not in self._STATUTS_AGENT_AUTORISES:
                # Le dossier a été transmis : l'agent doit disposer d'une autorisation
                # d'impression active accordée par le greffier (IMPRESSION ou IMPRESSION_GLOBALE).
                # Règle métier : le contenu du certificat est strictement identique
                # quel que soit le rôle ; seul le droit d'imprimer diffère.
                if not rc.ra_id:
                    return Response(
                        {
                            'detail':    "Ce dossier chronologique n'est pas lié à un registre analytique.",
                            'detail_ar': 'هذا السجل الزمني غير مرتبط بسجل تحليلي.',
                        },
                        status=http_status.HTTP_403_FORBIDDEN,
                    )
                ok, err_resp = _verifier_autorisation_impression(
                    request, 'RA', rc.ra_id, 'EXTRAIT_RA'
                )
                if not ok:
                    statut_display = dict(RegistreChronologique.STATUT_CHOICES).get(rc.statut, rc.statut)
                    return Response(
                        {
                            'detail':    f"Le certificat ne peut pas être imprimé après transmission "
                                         f"au greffier sans autorisation d'impression valide. "
                                         f"Statut actuel : « {statut_display} ».",
                            'detail_ar': f"لا يمكن طباعة الشهادة بعد إرسالها إلى كاتب الضبط "
                                         f"دون إذن طباعة ساري المفعول. "
                                         f"الحالة الحالية : « {statut_display} ».",
                        },
                        status=http_status.HTTP_403_FORBIDDEN,
                    )

        ra         = rc.ra
        signataire = _get_signataire()
        # ── Règle RCCM : la langue est exclusivement celle de l'acte — jamais celle de l'UI
        lang       = rc.langue_acte if rc.langue_acte in ('fr', 'ar') else 'fr'
        styles     = getSampleStyleSheet()
        buffer     = io.BytesIO()
        doc        = _make_doc(buffer)

        # ── Styles ────────────────────────────────────────────────────────────
        _is_ar    = (lang == 'ar')
        _nfont    = _ARABIC_FONT if _is_ar else 'Helvetica'
        normal    = ParagraphStyle('N10', parent=styles['Normal'], fontSize=9,
                                   fontName=_nfont, spaceAfter=4)
        _c12font  = _ARABIC_FONT if _is_ar else 'Helvetica-Bold'
        # Numéro et date d'enregistrement : toujours centrés (FR et AR)
        center12  = ParagraphStyle('C12', parent=styles['Normal'], fontSize=11,
                                   fontName=_c12font, alignment=TA_CENTER,
                                   spaceAfter=6, textColor=COLORS['primary'])
        cell_ar   = _ar_style(styles['Normal'], fontSize=9, alignment=TA_RIGHT)

        # ── Analyse de la description JSON ────────────────────────────────────
        desc = {}
        if rc.description:
            try:
                desc = _json.loads(rc.description)
            except (ValueError, TypeError):
                pass

        def _d(key, default='—'):
            """Extrait une valeur du JSON description."""
            v = desc.get(key)
            return str(v).strip() if v and str(v).strip() not in ('', 'None', 'False') else default

        def _mm(key, default='—'):
            """Extrait une valeur de maison_mere dans le JSON."""
            v = (desc.get('maison_mere') or {}).get(key)
            return str(v).strip() if v and str(v).strip() not in ('', 'None') else default

        # ── Style valeur avec retour à la ligne automatique ───────────────────
        val_wrap = ParagraphStyle(
            'ValWrap', parent=styles['Normal'], fontSize=9,
            leading=12, wordWrap='LTR',
        )

        def _P(text):
            """Retourne un Paragraph si le texte est non vide, sinon '—'."""
            t = str(text).strip() if text else ''
            return Paragraph(t, val_wrap) if t else '—'

        # ── Gérants actifs liés au RA ─────────────────────────────────────────
        _gerants_actifs = list(ra.gerants.filter(actif=True)) if ra else []

        def _representant_label(gerant):
            """Retourne la désignation complète d'un gérant/représentant (الاسم واللقب)."""
            nom    = gerant.nom_gerant or ''
            di     = gerant.donnees_ident or {}
            prenom = di.get('prenom', '')
            # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
            full = f"{prenom} {nom}".strip() or nom or '—'
            if gerant.fonction:
                full += f"  ({gerant.fonction})"
            return full

        # ── Libellé du type d'entité ──────────────────────────────────────────
        _TYPE_LABELS_FR = {
            'PH': 'PERSONNE PHYSIQUE',
            'PM': 'PERSONNE MORALE',
            'SC': 'SUCCURSALE ÉTRANGÈRE',
        }
        _TYPE_LABELS_AR = {
            'PH': 'شخص طبيعي',
            'PM': 'شخص اعتباري',
            'SC': 'فرع أجنبي',
        }
        type_entite      = ra.type_entite if ra else ''
        type_label_fr    = _TYPE_LABELS_FR.get(type_entite, '')
        type_label_ar    = _TYPE_LABELS_AR.get(type_entite, 'شهادة التسجيل في السجل الزمني')
        titre_fr         = 'CERTIFICAT D\'ENREGISTREMENT AU REGISTRE CHRONOLOGIQUE'
        if type_label_fr:
            titre_fr += f' – {type_label_fr}'
        titre_ar_full    = f'شهادة تسجيل في السجل الكرنولوجي – {type_label_ar}' if type_label_ar else 'شهادة تسجيل في السجل الكرنولوجي'

        # ── En-tête ───────────────────────────────────────────────────────────
        story = _header_table(titre_fr, titre_ar_full, lang=lang)

        # ── Numéro de référence (format purement numérique) ───────────────────
        _num_display = _numero_chrono_display(rc.numero_chrono)
        _c9_font   = _ARABIC_FONT if _is_ar else 'Helvetica'
        # Date d'enregistrement : centrée (FR et AR)
        _c9_style  = ParagraphStyle('C9', parent=styles['Normal'], fontSize=9,
                                    fontName=_c9_font, alignment=TA_CENTER)
        story.append(Spacer(1, 0.15 * cm))
        # ⚠ Ne pas passer ar() sur des chaînes contenant des balises HTML <b> :
        #   le bidi-display réordonne les caractères et casse le balisage.
        #   Pour l'arabe, on n'utilise pas <b> (gras non rendu de toute façon
        #   avec la police arabe enregistrée), on passe ar() sur le texte pur.
        if _is_ar:
            story.append(Paragraph(
                ar(f"{_L('num_enreg', 'ar')} : {_num_display}"),
                center12,
            ))
            story.append(Spacer(1, 0.1 * cm))
            story.append(Paragraph(
                ar(f"{_L('date_enreg', 'ar')} : {rc.date_enregistrement or '—'}"),
                _c9_style,
            ))
        else:
            story.append(Paragraph(
                f"N° d'enregistrement : <b>{_num_display}</b>",
                center12,
            ))
            story.append(Spacer(1, 0.1 * cm))
            story.append(Paragraph(
                f"Date d'enregistrement : <b>{rc.date_enregistrement or '—'}</b>",
                _c9_style,
            ))
        story.append(Spacer(1, 0.2 * cm))

        # ── Lignes de données dynamiques selon type entité ────────────────────
        rows = []
        type_entite = ra.type_entite if ra else None

        if type_entite == 'PH' and ra.ph:
            ph = ra.ph
            # Nom et prénoms — avec civilité
            # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
            civ_ph       = _civ(getattr(ph, 'civilite', ''), lang)
            _ph_prenom_c9 = (ph.prenom_ar or ph.prenom or '') if lang == 'ar' else (ph.prenom or '')
            _ph_nom_c9    = (ph.nom_ar    or ph.nom    or '') if lang == 'ar' else (ph.nom    or '')
            nom_complet   = f"{civ_ph} {_ph_prenom_c9} {_ph_nom_c9}".strip() or '—'
            rows.append([_L('nom_prenoms', lang), nom_complet])
            # Nom en arabe (toujours affiché si disponible) — PRÉNOM puis NOM
            nom_ar_val = f"{ph.prenom_ar or ''} {ph.nom_ar or ''}".strip()
            if nom_ar_val and lang != 'ar':
                rows.append([
                    Paragraph(ar('الاسم واللقب'), cell_ar),
                    Paragraph(ar(nom_ar_val), cell_ar),
                ])
            # Nom commercial
            nom_com = _d('denomination_commerciale')
            if nom_com != '—':
                rows.append([_L('nom_commercial', lang), nom_com])
            # État civil — date/lieu naissance et NNI supprimés (données sensibles)
            if ph.nationalite:
                nat_lbl = (ph.nationalite.libelle_ar if lang == 'ar'
                           else ph.nationalite.libelle_fr) or str(ph.nationalite)
                rows.append([_L('nationalite', lang), nat_lbl])
            if ph.adresse:
                rows.append([_L('adresse_domicile', lang), ph.adresse])
            # Activité
            activite = _d('activite')
            if activite != '—':
                rows.append([_L('activite_ph', lang), activite])
            # Fonds & déclarant
            origine = _d('origine_fonds')
            if origine != '—':
                rows.append([_L('origine_fonds', lang), origine])
            declarant = _d('identite_declarant')
            if declarant != '—':
                rows.append([_L('identite_decl', lang), declarant])

        elif type_entite == 'PM' and ra.pm:
            pm = ra.pm
            # Dénomination sociale
            rows.append([_L('denomination_sc', lang), pm.denomination or '—'])
            denom_ar_val = pm.denomination_ar or ''
            if denom_ar_val and lang != 'ar':
                rows.append([
                    Paragraph(ar('التسمية / الاسم التجاري'), cell_ar),
                    Paragraph(ar(denom_ar_val), cell_ar),
                ])
            # Forme juridique
            if pm.forme_juridique:
                fj_lbl = (pm.forme_juridique.libelle_ar if lang == 'ar'
                          else pm.forme_juridique.libelle_fr) if hasattr(pm.forme_juridique, 'libelle_fr') else str(pm.forme_juridique)
                rows.append([_L('forme_juridique', lang), fj_lbl])
            # Capital social — devise traduite en arabe (أوقية) en mode AR
            if pm.capital_social is not None:
                _devise_pm = getattr(pm, 'devise_capital', 'MRU') or 'MRU'
                if lang == 'ar':
                    rows.append([_L('capital_social', lang), f"{pm.capital_social:,.0f} أوقية"])
                else:
                    rows.append([_L('capital_social', lang), _fmt_capital(pm.capital_social, _devise_pm)])
            # Siège social — champ long → Paragraph
            if pm.siege_social:
                rows.append([_L('siege_social', lang), pm.siege_social])
            # Objet social / activité — TOUJOURS affiché (champ obligatoire du certificat PM)
            objet    = _d('objet_social')
            activite = _d('activite')
            # Priorité : objet_social ; fallback : activite ; sinon '—'
            objet_display = objet if objet != '—' else activite
            rows.append([_L('objet_activite', lang), objet_display if objet_display != '—' else '—'])
            # Origine des fonds
            origine = _d('origine_fonds')
            if origine != '—':
                rows.append([_L('origine_fonds', lang), origine])
            # Identité du déclarant — remplace le représentant légal / gérant (CDC)
            declarant = _d('identite_declarant')
            rows.append([_L('identite_decl', lang), declarant if declarant != '—' else '—'])

        elif type_entite == 'SC':
            # ── Certificat SC : structure en deux blocs séparés ──────────────
            # rows reste vide → la table générique n'est pas utilisée pour SC
            sc = ra.sc if ra.sc else None

            # Style banderole de titre de section
            _ban_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica-Bold'
            _ban_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
            _ban_style = ParagraphStyle('BanSC', parent=styles['Normal'],
                fontSize=9, fontName=_ban_font, alignment=_ban_align, textColor=colors.white)

            def _sc_section_header(label_key):
                """Banderole verte RCCM de titre de section pour le certificat SC."""
                lbl = _L(label_key, lang)
                p   = Paragraph(ar(lbl) if lang == 'ar' else lbl, _ban_style)
                tbl = Table([[p]], colWidths=[16.5 * cm])
                tbl.setStyle(TableStyle([
                    ('BACKGROUND',    (0, 0), (-1, -1), COLORS['primary']),
                    ('TOPPADDING',    (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('LEFTPADDING',   (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
                ]))
                return tbl

            # ─── BLOC 1 — SUCCURSALE ────────────────────────────────────────
            sc_rows = []
            if sc:
                sc_rows.append([_L('denomination_sc', lang), sc.denomination or '—'])
                denom_ar_val = sc.denomination_ar or ''
                if denom_ar_val and lang != 'ar':
                    sc_rows.append([
                        Paragraph(ar('التسمية'), cell_ar),
                        Paragraph(ar(denom_ar_val), cell_ar),
                    ])
                if sc.siege_social:
                    sc_rows.append([_L('adresse_succ', lang), sc.siege_social])
                if getattr(sc, 'telephone', None):
                    sc_rows.append([_L('telephone', lang), sc.telephone])

            # Activités / Objet social
            objet_sc    = _d('objet_social')
            activite_sc = _d('activite')
            objet_display = objet_sc if objet_sc != '—' else activite_sc
            if objet_display != '—':
                sc_rows.append([_L('activite_sc', lang), objet_display])

            story.append(Spacer(1, 0.1 * cm))
            story.append(_sc_section_header('sec_succursale'))
            if sc_rows:
                t_sc = _build_info_table(sc_rows, col_w=[7 * cm, 9.5 * cm], lang=lang)
                story.append(t_sc)

            # ─── BLOC 2 — SOCIÉTÉ MÈRE ──────────────────────────────────────
            mm_rows = []
            denom_mm = _mm('denomination_sociale')
            if sc and sc.pm_mere:
                denom_mm = sc.pm_mere.denomination or denom_mm
            if denom_mm and denom_mm != '—':
                mm_rows.append([_L('denom_sociale', lang), denom_mm])
            fj_mm = None
            if sc and sc.pm_mere and sc.pm_mere.forme_juridique:
                fj_mm = (sc.pm_mere.forme_juridique.libelle_ar if lang == 'ar'
                         else sc.pm_mere.forme_juridique.libelle_fr) if hasattr(sc.pm_mere.forme_juridique, 'libelle_fr') else str(sc.pm_mere.forme_juridique)
            if fj_mm:
                mm_rows.append([_L('forme_juridique', lang), fj_mm])
            pays_origine = (getattr(sc, 'pays_origine', None) if sc else None) or _mm('pays_origine')
            if pays_origine and pays_origine != '—':
                mm_rows.append([_L('pays_origine', lang), pays_origine])
            siege_mm = (sc.pm_mere.siege_social if sc and sc.pm_mere else None) or _mm('siege_social')
            if siege_mm and siege_mm != '—':
                mm_rows.append([_L('siege_social', lang), siege_mm])

            story.append(Spacer(1, 0.2 * cm))
            story.append(_sc_section_header('sec_sm_sc'))
            if mm_rows:
                t_mm = _build_info_table(mm_rows, col_w=[7 * cm, 9.5 * cm], lang=lang)
                story.append(t_mm)
            else:
                story.append(Paragraph(_L('sm_non_renseigne', lang), normal))

            # ─── DÉCLARANT ──────────────────────────────────────────────────
            declarant = _d('identite_declarant')
            if declarant != '—':
                story.append(Spacer(1, 0.2 * cm))
                t_decl = _build_info_table(
                    [[_L('identite_decl', lang), declarant]],
                    col_w=[7 * cm, 9.5 * cm], lang=lang)
                story.append(t_decl)

        else:
            # Fallback générique
            nom_com = desc.get('denomination_commerciale', '') or (ra.denomination if ra else '')
            if nom_com:
                rows.append([_L('denomination_sc', lang), str(nom_com)])
            activite = _d('activite')
            if activite != '—':
                rows.append([_L('activite_gen', lang), activite])
            declarant = _d('identite_declarant')
            if declarant != '—':
                rows.append([_L('identite_decl', lang), declarant])

        if rows:
            info_table = _build_info_table(rows, col_w=[7 * cm, 9.5 * cm], lang=lang)
            story.append(info_table)

        # ── Observations (affichage conditionnel) ─────────────────────────────
        obs_text = (rc.observations or '').strip()
        if obs_text:
            story.append(Spacer(1, 0.25 * cm))
            _obs_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
            _obs_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
            obs_style = ParagraphStyle(
                'Obs', parent=styles['Normal'], fontSize=9,
                fontName=_obs_font, alignment=_obs_align,
                leftIndent=0.5 * cm, rightIndent=0.5 * cm,
            )
            _obs_lbl = _L('observations', lang)
            # ⚠ Ne pas passer ar() sur des strings contenant des balises <b> :
            #   bidi reordonne les caractères et casse le markup HTML.
            if _is_ar:
                _obs_line = ar(f"{_obs_lbl} : {obs_text}")
            else:
                _obs_line = f"<b>{_obs_lbl} :</b> {obs_text}"
            story.append(Paragraph(_obs_line, obs_style))

        # ── Bloc final : mention certifiante + date + signataire ─────────────
        # CondPageBreak garantit l'espace réel disponible avant d'insérer ce bloc.
        # Il force un saut de page UNIQUEMENT si < 4 cm restent — jamais inutilement.
        _cert_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        _cert_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
        _cert_style = ParagraphStyle('CertPhr', parent=styles['Normal'],
                                     fontSize=9, fontName=_cert_font,
                                     alignment=_cert_align, spaceAfter=4)
        _cert_txt  = _L('cert_phrase', lang)
        _cert_para = Paragraph(ar(_cert_txt) if lang == 'ar' else _cert_txt, _cert_style)

        _date_sig_font = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        date_style = ParagraphStyle('DateSig', parent=styles['Normal'], fontSize=9,
                                    fontName=_date_sig_font, alignment=TA_CENTER)
        _today_fmt = date.today().strftime('%d/%m/%Y')
        _date_txt  = f"{_L('fait_a', lang)} {_today_fmt}"
        _date_para = Paragraph(ar(_date_txt) if lang == 'ar' else _date_txt, date_style)

        story.append(CondPageBreak(2.8 * cm))
        story.append(Spacer(1, 0.15 * cm))
        story.append(_cert_para)
        story.append(Spacer(1, 0.1 * cm))
        story.append(_date_para)
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        # ── QR code + mention juridique en pied de page (registre chronologique) ──
        # AR : mention légale propre au registre chronologique (≠ registre analytique).
        # FR : texte inchangé via _PDF_LABELS.
        if lang == 'ar':
            _MENTION_PROVISOIRE = 'تُفيد هذه الإفادة بوقوع تسجيل في السجل الكرنولوجي، ولا تُعد تقييدا في السجل التجاري'
        else:
            _MENTION_PROVISOIRE = _L('mention_provisoire', 'fr')
        qr_str = _qr_text(
            'CERT_CHRONO',
            ref=_num_display,
            date_acte=rc.date_enregistrement.isoformat() if rc.date_enregistrement else '',
        )
        qr_cb = _make_qr_footer_callback(qr_str, footer_note=_MENTION_PROVISOIRE, lang=lang)

        doc.build(story,
                  onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
                  onLaterPages=qr_cb if qr_cb else lambda c, d: None)
        buffer.seek(0)
        filename = f"certificat_chrono_{_num_display}.pdf"
        return HttpResponse(buffer, content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'})


# ── Extrait d'immatriculation au registre du commerce (RA) ────────────────────

def _verifier_autorisation_impression(request, type_dossier, dossier_id, document_type):
    """
    Vérifie qu'un agent (non-greffier) possède une autorisation d'impression valide.

    Deux niveaux vérifiés dans l'ordre :
      1. Autorisation spécifique (IMPRESSION, dossier précis, 20 min)
      2. Autorisation globale   (IMPRESSION_GLOBALE, 24h) — uniquement si
         l'agent est le créateur du RA demandé.

    Retourne (True, None) si autorisé, (False, Response 403) sinon.
    """
    from apps.autorisations.models import DemandeAutorisation
    now = _tz.now()

    # ── 1. Autorisation unitaire ──────────────────────────────────────────────
    auth_unitaire = DemandeAutorisation.objects.filter(
        demandeur=request.user,
        type_demande='IMPRESSION',
        type_dossier=type_dossier,
        dossier_id=dossier_id,
        document_type=document_type,
        statut='AUTORISEE',
        date_expiration__gt=now,
    ).order_by('-date_decision').first()
    if auth_unitaire:
        return True, None

    # ── 2. Autorisation globale 24h ───────────────────────────────────────────
    # Valide seulement si l'agent est le créateur du RA (pas pour les dossiers
    # d'autres agents, même si leur RA a été autorisé par une autre voie).
    if type_dossier == 'RA':
        auth_globale = DemandeAutorisation.objects.filter(
            demandeur=request.user,
            type_demande='IMPRESSION_GLOBALE',
            type_dossier='RA',
            statut='AUTORISEE',
            date_expiration__gt=now,
        ).order_by('-date_decision').first()
        if auth_globale:
            from apps.registres.models import RegistreAnalytique
            try:
                ra = RegistreAnalytique.objects.only('created_by_id').get(pk=dossier_id)
                if ra.created_by_id == request.user.pk:
                    return True, None
            except RegistreAnalytique.DoesNotExist:
                pass

    # ── Aucune autorisation valide ────────────────────────────────────────────
    from rest_framework.response import Response
    import rest_framework.status as http_st
    return False, Response(
        {
            'detail':    'Impression non autorisée. Veuillez soumettre une demande d\'autorisation au greffier.',
            'detail_ar': 'الطباعة غير مسموح بها. يرجى تقديم طلب إذن إلى كاتب الضبط.',
        },
        status=http_st.HTTP_403_FORBIDDEN,
    )


# ── Langue de l'acte : lecture depuis le RA (immatriculation) ────────────────
def _get_langue_acte_from_ra(ra, fallback='fr'):
    """
    Retourne la langue de l'acte d'immatriculation du RA.
    Cherche dans les RegistreChronologique liés le premier acte de type IMMATRICULATION
    et lit son champ langue_acte.  Si introuvable, renvoie `fallback`.
    """
    try:
        chrono = next(
            (c for c in ra.chronos.all() if c.type_acte == 'IMMATRICULATION'),
            None,
        )
        if chrono and chrono.langue_acte in ('fr', 'ar'):
            return chrono.langue_acte
    except Exception:
        pass
    return fallback if fallback in ('fr', 'ar') else 'fr'


class AttestationImmatriculationView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'attestation-immatriculation'
    """
    ETAT_Extrait_Analytique — version simple (attestation one-page).
    Greffier : toujours autorisé.
    Agents (GU / Tribunal) : requiert une autorisation valide (DemandeAutorisation).
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request, ra_id):
        if not est_greffier(request.user):
            ok, err_resp = _verifier_autorisation_impression(
                request, 'RA', ra_id, 'EXTRAIT_RA'
            )
            if not ok:
                return err_resp
        try:
            ra = RegistreAnalytique.objects.select_related(
                'ph', 'pm', 'sc', 'localite'
            ).prefetch_related('chronos').get(pk=ra_id)
        except RegistreAnalytique.DoesNotExist:
            return Response({'detail': 'Introuvable.'}, status=http_status.HTTP_404_NOT_FOUND)

        signataire = _get_signataire()
        # ── Règle RCCM : langue exclusivement celle du chrono d'immatriculation — jamais celle de l'UI
        lang       = _get_langue_acte_from_ra(ra)
        styles     = getSampleStyleSheet()
        buffer     = io.BytesIO()
        doc        = _make_doc(buffer)

        today_str  = date.today().strftime('%d/%m/%Y')

        # ── Titre dynamique selon le type d'entité ─────────────────────────────
        _attest_titre_fr_map = {
            'PH': "ATTESTATION D'IMMATRICULATION AU REGISTRE DU COMMERCE – PERSONNE PHYSIQUE",
            'PM': "ATTESTATION D'IMMATRICULATION AU REGISTRE DU COMMERCE – PERSONNE MORALE",
            'SC': "ATTESTATION D'IMMATRICULATION AU REGISTRE DU COMMERCE – SUCCURSALE",
        }
        _attest_titre_ar_map = {
            'PH': 'شهادة التسجيل في السجل التجاري – شخص طبيعي',
            'PM': 'شهادة التسجيل في السجل التجاري – شخص معنوي',
            'SC': 'شهادة التسجيل في السجل التجاري – فرع',
        }
        _attest_titre_fr = _attest_titre_fr_map.get(ra.type_entite, "ATTESTATION D'IMMATRICULATION AU REGISTRE DU COMMERCE")
        _attest_titre_ar = _attest_titre_ar_map.get(ra.type_entite, 'شهادة التسجيل في السجل التجاري')
        story      = _header_table(_attest_titre_fr, _attest_titre_ar, lang=lang)
        normal     = ParagraphStyle('N9', parent=styles['Normal'], fontSize=9, spaceAfter=4)
        _sec_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica-Bold'
        _sec_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
        sec        = ParagraphStyle('Sec', parent=styles['Normal'], fontSize=10,
                                    fontName=_sec_font, alignment=_sec_align,
                                    textColor=COLORS['primary'],
                                    spaceBefore=8, spaceAfter=3)

        story.append(Spacer(1, 0.2 * cm))

        # ── I. RÉFÉRENCES ─────────────────────────────────────────────────────
        _sec_ref = _L('sec_references', lang)
        story.append(Paragraph(ar(_sec_ref) if lang == 'ar' else _sec_ref, sec))
        ref_rows = []
        _add_rows(ref_rows,
            _row_if(_L('num_chrono',    lang), _get_numero_chrono(ra)),
            _row_if(_L('num_analytique',lang), ra.numero_ra),
            _row_if(_L('date_immat',    lang), _get_immat_dt(ra, lang=lang)),
            _row_if(_L('greffe',        lang), str(ra.localite) if ra.localite else None),
        )
        t = _build_info_table(ref_rows, lang=lang)
        if t: story.append(t)

        # ── II. IDENTIFICATION ────────────────────────────────────────────────
        _sec_id = _L('sec_identification', lang)
        story.append(Paragraph(ar(_sec_id) if lang == 'ar' else _sec_id, sec))
        id_rows = []
        _te_fr_map_att = {'PH': 'Personne Physique', 'PM': 'Personne Morale', 'SC': 'Succursale'}
        _te_ar_map_att = {'PH': 'شخص طبيعي', 'PM': 'شخص معنوي', 'SC': 'فرع'}
        _te_display_att = (_te_ar_map_att if lang == 'ar' else _te_fr_map_att).get(
            ra.type_entite, ra.get_type_entite_display())
        id_rows.append([_L('type_entite', lang), _te_display_att])
        _add_rows(id_rows,
            _row_if(_L('denomination', lang), ra.denomination),
        )
        # Activité selon le type d'entité
        if ra.type_entite == 'PH' and ra.ph:
            _activite_ph = getattr(ra.ph, 'profession', None) or None
            _add_rows(id_rows, _row_if(_L('activite_ph', lang), _activite_ph))
        elif ra.type_entite == 'PM' and ra.pm:
            # Source 1 : IH.donnees (immatriculation historique), Source 2 : RC.description
            _activite_pm = _get_pm_objet_social(ra)
            _add_rows(id_rows, _row_if(_L('objet_activite2', lang), _activite_pm or None))
        elif ra.type_entite == 'SC':
            _sc_extra_att = _get_sc_donnees(ra)
            _activite_sc  = _sc_extra_att.get('objet_social') or _sc_extra_att.get('activite')
            _add_rows(id_rows, _row_if(_L('objet_activite_sc', lang), _activite_sc))
        t = _build_info_table(id_rows, lang=lang)
        if t: story.append(t)

        # ── Mention bénéficiaire effectif (PM et SC uniquement — règle métier) ──
        # Les personnes physiques ne sont pas soumises à la déclaration BE.
        if ra.type_entite in ('PM', 'SC'):
            story.append(Spacer(1, 0.3 * cm))
            _be_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
            _be_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
            be_style = ParagraphStyle('BE', parent=styles['Normal'], fontSize=8,
                                      fontName=_be_font, alignment=_be_align,
                                      leading=11, spaceAfter=4,
                                      textColor=colors.HexColor('#555555'))
            if ra.statut_be == 'DECLARE':
                date_be = ra.date_declaration_be.strftime('%d/%m/%Y') if ra.date_declaration_be else '—'
                be_text = _L('be_declare_text', lang).format(date=date_be)
            else:
                be_text = _L('be_non_declare_text', lang)
            story.append(Paragraph(ar(be_text) if lang == 'ar' else be_text, be_style))

        # ── Bloc final : date de délivrance + signataire ─────────────────────
        # CondPageBreak : saut uniquement si < 3.5 cm disponibles sur la page courante.
        _deliv_font = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        date_style  = ParagraphStyle('DateSig', parent=styles['Normal'], fontSize=9,
                                     fontName=_deliv_font, alignment=TA_CENTER)
        _deliv_txt  = f"{_L('delivre_le', lang)} {today_str}"
        _deliv_para = Paragraph(ar(_deliv_txt) if lang == 'ar' else _deliv_txt, date_style)

        story.append(CondPageBreak(2.2 * cm))
        story.append(Spacer(1, 0.1 * cm))
        story.append(_deliv_para)
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        # ── QR code + pied de page de validité (registre analytique) ────────────
        # AR : validité 3 mois avec date réelle — propre à l'extrait analytique.
        # FR : texte inchangé via _PDF_LABELS.
        if lang == 'ar':
            validity_note = f'ملاحظة : صلاحية هذا المستخرج ثلاثة (3) أشهر ابتداء من تاريخ {today_str}.'
        else:
            validity_note = _L('validity_3months', 'fr').format(date=today_str)
        qr_str = _qr_text(
            'ATTESTATION_IMMAT',
            ra=ra.numero_ra or '',
            rc=ra.numero_rc or '',
            date_acte=_get_immat_dt_iso(ra),
        )
        qr_cb = _make_qr_footer_callback(qr_str, footer_note=validity_note, lang=lang)

        doc.build(story,
                  onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
                  onLaterPages=qr_cb if qr_cb else lambda c, d: None)
        buffer.seek(0)
        _ref = (ra.numero_rc or ra.numero_ra or 'inconnu').replace('/', '-').replace('\\', '-')
        filename = f"attestation_immat_{_ref}.pdf"
        return HttpResponse(buffer, content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'})


class ExtraitRCView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'extrait-rc'
    """
    ETAT_Extrait_Analytique — extrait complet avec gérants, associés, domaines.
    Greffier : toujours autorisé.
    Agents (GU / Tribunal) : requiert une autorisation valide (DemandeAutorisation).
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request, ra_id):
        if not est_greffier(request.user):
            ok, err_resp = _verifier_autorisation_impression(
                request, 'RA', ra_id, 'EXTRAIT_RC_COMPLET'
            )
            if not ok:
                return err_resp
        try:
            ra = RegistreAnalytique.objects.prefetch_related(
                'gerants__ph', 'gerants__pm', 'gerants__fonction',
                'associes__ph', 'associes__pm', 'associes__nationalite',
                'administrateurs__nationalite',   # SA : conseil d'administration
                'commissaires__nationalite',      # SA : commissaires aux comptes
                'domaines__domaine',
                'chronos',
            ).select_related('ph', 'pm', 'sc', 'localite', 'pm__forme_juridique', 'validated_by').get(pk=ra_id)
        except RegistreAnalytique.DoesNotExist:
            return Response({'detail': 'Introuvable.'}, status=http_status.HTTP_404_NOT_FOUND)

        # ── Enveloppe diagnostique : capture le traceback exact dans les logs Railway ──
        try:
            return self._generate_pdf(request, ra)
        except Exception as _exc:
            import traceback as _tb
            logging.getLogger('rccm').error(
                '[ExtraitRCView] ERREUR génération PDF ra_id=%s type=%s lang=%s : %s\n%s',
                ra.pk, ra.type_entite,
                getattr(ra, '_lang_debug', '?'),
                _exc, _tb.format_exc(),
            )
            return Response(
                {'detail': f'Erreur génération PDF : {_exc}',
                 'detail_ar': 'خطأ أثناء إنشاء المستند.'},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _generate_pdf(self, request, ra):
        """Corps de la génération — séparé pour exposer le traceback exact dans les logs."""
        signataire = _get_signataire()
        # ── Règle RCCM : langue exclusivement celle du chrono d'immatriculation — jamais celle de l'UI
        lang       = _get_langue_acte_from_ra(ra)
        styles     = getSampleStyleSheet()
        buffer     = io.BytesIO()
        doc        = _make_doc(buffer)

        today_str  = date.today().strftime('%d/%m/%Y')

        # ── Titre dynamique selon le type d'entité ─────────────────────────────
        _titre_fr_map = {
            'PH': "EXTRAIT D'IMMATRICULATION AU REGISTRE DU COMMERCE – PERSONNE PHYSIQUE",
            'PM': "EXTRAIT D'IMMATRICULATION AU REGISTRE DU COMMERCE – PERSONNE MORALE",
            'SC': "EXTRAIT D'IMMATRICULATION AU REGISTRE DU COMMERCE – SUCCURSALE",
        }
        _titre_ar_map = {
            'PH': 'مستخرج من السجل التجاري – شخص طبيعي',
            'PM': 'مستخرج من السجل التجاري – شخص معنوي',
            'SC': 'مستخرج من السجل التجاري – فرع',
        }
        _titre_fr = _titre_fr_map.get(ra.type_entite, "EXTRAIT D'IMMATRICULATION AU REGISTRE DU COMMERCE")
        _titre_ar = _titre_ar_map.get(ra.type_entite, 'مستخرج من السجل التجاري')
        story      = _header_table(_titre_fr, _titre_ar, lang=lang)
        normal     = ParagraphStyle('N10', parent=styles['Normal'], fontSize=9, spaceAfter=3)
        _sec_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica-Bold'
        _sec_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
        sec        = ParagraphStyle('Sec', parent=styles['Normal'], fontSize=10,
                                    fontName=_sec_font, alignment=_sec_align,
                                    textColor=COLORS['primary'],
                                    spaceBefore=8, spaceAfter=3)
        cell_ar    = _ar_style(styles['Normal'], fontSize=9, alignment=TA_RIGHT)

        story.append(Spacer(1, 0.1 * cm))

        # ── RC primaire : chrono initial validé ───────────────────────────────
        # Utilisé pour :
        #   • fallback du N° chronologique quand ra.numero_rc est vide
        #   • lecture de l'activité exercée et du nom commercial (JSON description)
        _primary_chrono = None
        _rc_desc        = {}
        try:
            _all_ch = list(ra.chronos.all())          # cache prefetch
            _val_ch = [c for c in _all_ch if c.statut == 'VALIDE']
            if _val_ch:
                _primary_chrono = sorted(_val_ch, key=lambda c: (c.date_acte or date.min))[0]
                if _primary_chrono.description:
                    _rc_desc = _json.loads(_primary_chrono.description)
        except Exception:
            _rc_desc = {}

        # ── Dénomination arabe ─────────────────────────────────────────────────
        denom_ar = ''
        if ra.type_entite == 'PH' and ra.ph:
            # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
            denom_ar = f"{ra.ph.prenom_ar or ''} {ra.ph.nom_ar or ''}".strip()
        elif ra.type_entite == 'PM' and ra.pm:
            denom_ar = ra.pm.denomination_ar or ''
        elif ra.type_entite == 'SC' and ra.sc:
            denom_ar = ra.sc.denomination_ar or ''

        # ─────────────────────────────────────────────────────────────────────
        # I. RÉFÉRENCES
        # ─────────────────────────────────────────────────────────────────────
        _sec_ref = _L('sec_references', lang)
        story.append(Paragraph(ar(_sec_ref) if lang == 'ar' else _sec_ref, sec))
        # N° chronologique — cascade robuste via _get_numero_chrono()
        ref_rows = []
        ref_rows.append([_L('num_chrono', lang), _get_numero_chrono(ra)])
        _add_rows(ref_rows,
            _row_if(_L('num_analytique',lang), ra.numero_ra),
            _row_if(_L('date_immat',    lang), _get_immat_dt(ra, lang=lang)),
            _row_if(_L('greffe',        lang), str(ra.localite) if ra.localite else None),
        )
        # En arabe : نوع الكيان ajouté dans بيانات مرجعية (section I)
        if lang == 'ar':
            _te_ar_map = {'PH': 'شخص طبيعي', 'PM': 'شخص معنوي', 'SC': 'فرع'}
            _te_ar_val = _te_ar_map.get(ra.type_entite, ra.get_type_entite_display())
            ref_rows.append([_L('type_entite', lang), _te_ar_val])
        t = _build_info_table(ref_rows, lang=lang)
        if t: story.append(t)

        # ─────────────────────────────────────────────────────────────────────
        # II. IDENTIFICATION
        # Pour PM (FR et AR) : section supprimée.
        #   → AR : نوع الكيان déjà dans section I, التسمية ira dans section II (sec_info_pm)
        #   → FR : Type d'entité implicite dans le titre, Dénomination ira dans section II
        # Pour PH et SC : section II conservée normalement.
        # ─────────────────────────────────────────────────────────────────────
        _te_fr_map = {'PH': 'Personne Physique', 'PM': 'Personne Morale', 'SC': 'Succursale'}
        if ra.type_entite != 'PM':
            _sec_id = _L('sec_identification', lang)
            story.append(Paragraph(ar(_sec_id) if lang == 'ar' else _sec_id, sec))
            id_rows = []
            id_rows.append([_L('type_entite', lang),
                            _te_fr_map.get(ra.type_entite, ra.get_type_entite_display())])
            if ra.type_entite == 'PH':
                # PH : ne pas afficher ra.denomination (= nom_complet → duplication avec section III)
                # Afficher uniquement le nom commercial / enseigne s'il est réellement renseigné
                _nom_com_ph = (
                    _rc_desc.get('denomination_commerciale', '') or ''
                ).strip() or None
                if _nom_com_ph:
                    id_rows.append([_L('nom_commercial_ph', lang), _nom_com_ph])
            else:
                # PM et SC : dénomination légale distincte → afficher normalement
                _add_rows(id_rows, _row_if(_L('denomination', lang), ra.denomination))
                if denom_ar and lang != 'ar':
                    id_rows.append([Paragraph(ar('التسمية'), cell_ar), Paragraph(ar(denom_ar), cell_ar)])
            t = _build_info_table(id_rows, lang=lang)
            if t: story.append(t)

        # ─────────────────────────────────────────────────────────────────────
        # III. INFORMATIONS SPÉCIFIQUES
        # ─────────────────────────────────────────────────────────────────────

        # ── Personne Physique ─────────────────────────────────────────────────
        if ra.type_entite == 'PH' and ra.ph:
            ph = ra.ph
            _sec_ph = _L('sec_info_ph', lang)
            story.append(Paragraph(ar(_sec_ph) if lang == 'ar' else _sec_ph, sec))
            ph_rows = []
            # Nom et prénoms (données actuelles — reflète l'état après cession éventuelle)
            civ_ph2  = _civ(getattr(ph, 'civilite', ''), lang)
            # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
            _ph_p2   = (ph.prenom_ar or ph.prenom or '') if lang == 'ar' else (ph.prenom or '')
            _ph_n2   = (ph.nom_ar    or ph.nom    or '') if lang == 'ar' else (ph.nom    or '')
            _ph_nom  = f"{civ_ph2} {_ph_p2} {_ph_n2}".strip() or None
            _add_rows(ph_rows, _row_if(_L('nom_prenoms', lang), _ph_nom))
            # Pièce d'identité : NNI prioritaire, sinon passeport
            if ph.nni:
                ph_rows.append([_L('nni',       lang), ph.nni])
            elif ph.num_passeport:
                ph_rows.append([_L('passeport', lang), ph.num_passeport])
            # Date et lieu de naissance
            _add_rows(ph_rows,
                _row_if(_L('date_naissance', lang),
                        str(ph.date_naissance) if ph.date_naissance else None),
                _row_if(_L('lieu_naissance', lang), ph.lieu_naissance or None),
            )
            # Nationalité, activité, adresse (bilingue), téléphone, e-mail
            _nat_lib_ph = (
                (ph.nationalite.libelle_ar if lang == 'ar' else ph.nationalite.libelle_fr)
                if ph.nationalite else None
            )
            _adresse_ph = ((ph.adresse_ar or ph.adresse) if lang == 'ar' else ph.adresse) or None
            # Activité exercée : ph.profession en priorité, sinon 'activite' du RC initial
            _activite_ph = (ph.profession or '').strip() or (
                _rc_desc.get('activite') or ''
            ).strip() or None
            _add_rows(ph_rows,
                _row_if(_L('nationalite',  lang), _nat_lib_ph),
                _row_if(_L('activite_ph',  lang), _activite_ph),
                _row_if(_L('adresse',      lang), _adresse_ph),
                _row_if(_L('telephone',    lang), ph.telephone or None),
                _row_if(_L('email',        lang), ph.email or None),
            )
            t = _build_info_table(ph_rows, lang=lang)
            if t: story.append(t)

        # ── Personne Morale ───────────────────────────────────────────────────
        elif ra.type_entite == 'PM' and ra.pm:
            pm = ra.pm
            _sec_pm = _L('sec_info_pm', lang)
            story.append(Paragraph(ar(_sec_pm) if lang == 'ar' else _sec_pm, sec))

            # Récupérer l'objet social — Source 1 : IH.donnees, Source 2 : RC.description
            _objet_social_extrait = _get_pm_objet_social(ra)

            pm_rows = []
            # Dénomination en tête de section (déplacée depuis section II — FR et AR)
            # AR : denomination_ar (ou denomination si non renseigné)
            # FR : denomination principale
            _denom_pm = (denom_ar or ra.denomination or '') if lang == 'ar' else (ra.denomination or '')
            if _denom_pm:
                pm_rows.append([_L('denomination', lang), _denom_pm])
            if hasattr(pm, 'forme_juridique') and pm.forme_juridique:
                fj_lib = ((pm.forme_juridique.libelle_ar if lang == 'ar' else pm.forme_juridique.libelle_fr)
                          if hasattr(pm.forme_juridique, 'libelle_fr')
                          else str(pm.forme_juridique))
                pm_rows.append([_L('forme_juridique', lang), fj_lib])
            if pm.capital_social:
                if lang == 'ar':
                    pm_rows.append([_L('capital_social', lang), f"{pm.capital_social:,.0f} أوقية"])
                else:
                    devise = getattr(pm, 'devise_capital', 'MRU') or 'MRU'
                    pm_rows.append([_L('capital_social', lang), f"{pm.capital_social:,.0f} {devise}".strip()])
            if getattr(pm, 'duree_societe', None):
                _duree_unite = 'سنة' if lang == 'ar' else 'ans'
                pm_rows.append([_L('duree', lang), f"{pm.duree_societe} {_duree_unite}"])
            _add_rows(pm_rows,
                _row_if(_L('objet_social',  lang), _objet_social_extrait or None),
                _row_if(_L('siege_social',  lang), pm.siege_social),
                _row_if(_L('telephone',     lang), pm.telephone),
                _row_if(_L('fax',           lang), getattr(pm, 'fax',      None)),
                _row_if(_L('email',         lang), getattr(pm, 'email',    None) or None),
                _row_if(_L('site_web',      lang), getattr(pm, 'site_web', None)),
                _row_if(_L('bp',            lang), getattr(pm, 'bp',       None)),
            )
            t = _build_info_table(pm_rows, lang=lang)
            if t: story.append(t)

        # ── Succursale ────────────────────────────────────────────────────────
        elif ra.type_entite == 'SC' and ra.sc:
            sc       = ra.sc
            sc_extra = _get_sc_donnees(ra)

            _sec_sc = _L('sec_info_sc', lang)
            story.append(Paragraph(ar(_sec_sc) if lang == 'ar' else _sec_sc, sec))
            sc_rows = []
            _add_rows(sc_rows,
                _row_if(_L('denomination_sc',   lang), sc.denomination),
                _row_if(_L('siege_social_sc',   lang), sc.siege_social),
                _row_if(_L('telephone',         lang), sc.telephone),
                _row_if(_L('email',             lang), sc.email or None),
                _row_if(_L('objet_activite_sc', lang),
                        sc_extra.get('objet_social') or sc_extra.get('activite')),
            )
            t = _build_info_table(sc_rows, lang=lang)
            if t: story.append(t)

            # Section IV – Société mère (champs non pertinents supprimés)
            mm = sc_extra.get('maison_mere') or {}
            if any(mm.get(k) for k in ('denomination_sociale', 'numero_rc', 'siege_social',
                                        'forme_juridique_id', 'nationalite_id', 'date_depot_statuts')):
                _sec_sm = _L('sec_societe_mere', lang)
                story.append(Paragraph(ar(_sec_sm) if lang == 'ar' else _sec_sm, sec))
                fj_label = nat_label = ''
                if mm.get('forme_juridique_id'):
                    try:
                        from apps.parametrage.models import FormeJuridique
                        fj = FormeJuridique.objects.get(pk=mm['forme_juridique_id'])
                        fj_label = (fj.libelle_ar if lang == 'ar' else fj.libelle_fr) or ''
                    except Exception:
                        pass
                if mm.get('nationalite_id'):
                    try:
                        from apps.parametrage.models import Nationalite
                        nat = Nationalite.objects.get(pk=mm['nationalite_id'])
                        nat_label = (nat.libelle_ar if lang == 'ar' else nat.libelle_fr) or ''
                    except Exception:
                        pass
                mm_rows = []
                # Capital social maison mère avec devise obligatoire (CDC)
                _mm_capital = mm.get('capital_social')
                _mm_devise  = (mm.get('devise_capital') or 'MRU').strip()
                _mm_capital_fmt = (
                    _fmt_capital(_mm_capital, _mm_devise)
                    if _mm_capital else None
                )
                _add_rows(mm_rows,
                    _row_if(_L('denom_sociale', lang), mm.get('denomination_sociale')),
                    _row_if(_L('num_rc',        lang), mm.get('numero_rc')),
                    _row_if(_L('forme_juridique',lang), fj_label),
                    _row_if(_L('capital_social', lang), _mm_capital_fmt),
                    _row_if(_L('date_depot',    lang), mm.get('date_depot_statuts')),
                    _row_if(_L('nationalite',   lang), nat_label),
                    _row_if(_L('siege_social',  lang), mm.get('siege_social')),
                )
                t = _build_info_table(mm_rows, lang=lang)
                if t: story.append(t)

        # ─────────────────────────────────────────────────────────────────────
        # DOMAINES D'ACTIVITÉ (PH uniquement — section IV dynamique)
        # ─────────────────────────────────────────────────────────────────────
        _ph_domaines_shown = False
        if ra.type_entite == 'PH':
            domaines = list(ra.domaines.all()) if hasattr(ra, 'domaines') else []
            if domaines:
                _dom_sec_fr = "IV. DOMAINES D'ACTIVITÉ"
                _dom_sec_ar = 'IV. مجالات النشاط'
                _dom_sec_lbl = _dom_sec_ar if lang == 'ar' else _dom_sec_fr
                story.append(Paragraph(ar(_dom_sec_lbl) if lang == 'ar' else _dom_sec_lbl, sec))
                dom_rows = []
                for rd in domaines:
                    if rd.domaine:
                        dom_lib = (
                            rd.domaine.libelle_ar if lang == 'ar' else rd.domaine.libelle_fr
                        ) or ''
                        if dom_lib:
                            dom_rows.append([_L('domaine_activite', lang), dom_lib])
                t = _build_info_table(dom_rows, lang=lang)
                if t:
                    story.append(t)
                    _ph_domaines_shown = True

        # ─────────────────────────────────────────────────────────────────────
        # GÉRANTS / DIRECTEURS
        # Format : Prénom Nom – Nationalité – Fonction  (une ligne / personne)
        # Cadre cohérent avec les autres sections (BOX + LINEBELOW entre personnes)
        # ─────────────────────────────────────────────────────────────────────
        gerants = list(ra.gerants.filter(actif=True)) if hasattr(ra, 'gerants') else []
        if gerants:
            if ra.type_entite == 'SC':
                _sec_g = _L('sec_gerants_sc', lang)
            elif ra.type_entite == 'PH':
                # Numérotation dynamique : V si domaines ont été affichés, sinon IV
                _g_rom = 'V' if _ph_domaines_shown else 'IV'
                _sec_g = (f'{_g_rom}. المسيِّر(ون)' if lang == 'ar'
                          else f'{_g_rom}. GÉRANT(S)')
            else:
                _sec_g = _L('sec_gerants_pm', lang)
            story.append(Paragraph(ar(_sec_g) if lang == 'ar' else _sec_g, sec))
            _g_lines = [_gerant_line(g, lang=lang) for g in gerants]
            _g_lines = [l for l in _g_lines if l]
            t = _build_persons_table(_g_lines, lang=lang)
            if t:
                story.append(t)

        # ─────────────────────────────────────────────────────────────────────
        # ASSOCIÉS / ACTIONNAIRES  (PM uniquement)
        # Format : Prénom Nom – Nationalité – Quote-part  (une ligne / personne)
        # ─────────────────────────────────────────────────────────────────────
        associes = list(ra.associes.filter(actif=True)) if hasattr(ra, 'associes') else []
        if associes and ra.type_entite == 'PM':
            _sec_assoc = _L('sec_associes', lang)
            story.append(Paragraph(ar(_sec_assoc) if lang == 'ar' else _sec_assoc, sec))
            _a_lines = [_associe_line(a, lang=lang) for a in associes]
            _a_lines = [l for l in _a_lines if l]
            t = _build_persons_table(_a_lines, lang=lang)
            if t:
                story.append(t)

        # ─────────────────────────────────────────────────────────────────────
        # CONSEIL D'ADMINISTRATION  (SA uniquement)
        # ─────────────────────────────────────────────────────────────────────
        if ra.est_sa:
            _admins = list(ra.administrateurs.filter(actif=True)) if hasattr(ra, 'administrateurs') else []
            if _admins:
                _sec_ca = _L('sec_conseil_admin', lang)
                story.append(Paragraph(ar(_sec_ca) if lang == 'ar' else _sec_ca, sec))
                _adm_lines = [_administrateur_line(_adm, lang=lang) for _adm in _admins]
                _adm_lines = [l for l in _adm_lines if l]
                t = _build_persons_table(_adm_lines, lang=lang)
                if t:
                    story.append(t)

            # ─────────────────────────────────────────────────────────────────
            # COMMISSAIRES AUX COMPTES  (SA uniquement)
            # ─────────────────────────────────────────────────────────────────
            _comms = list(ra.commissaires.filter(actif=True)) if hasattr(ra, 'commissaires') else []
            if _comms:
                _sec_comm = _L('sec_commissaires', lang)
                story.append(Paragraph(ar(_sec_comm) if lang == 'ar' else _sec_comm, sec))
                _comm_lines = [_commissaire_line(_comm, lang=lang) for _comm in _comms]
                _comm_lines = [l for l in _comm_lines if l]
                t = _build_persons_table(_comm_lines, lang=lang)
                if t:
                    story.append(t)

        # ── Mention bénéficiaire effectif (PM et SC uniquement — règle métier) ──
        # Les personnes physiques ne sont pas soumises à la déclaration BE.
        if ra.type_entite in ('PM', 'SC'):
            story.append(Spacer(1, 0.2 * cm))
            _be_font_ext  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
            _be_align_ext = TA_RIGHT     if lang == 'ar' else TA_LEFT
            be_style_ext = ParagraphStyle('BExt', parent=styles['Normal'], fontSize=8,
                                          fontName=_be_font_ext, alignment=_be_align_ext,
                                          leading=11, spaceAfter=4,
                                          textColor=colors.HexColor('#555555'))
            if ra.statut_be == 'DECLARE':
                date_be = ra.date_declaration_be.strftime('%d/%m/%Y') if ra.date_declaration_be else '—'
                be_text_ext = _L('be_declare_text', lang).format(date=date_be)
            else:
                be_text_ext = _L('be_non_declare_text', lang)
            story.append(Paragraph(ar(be_text_ext) if lang == 'ar' else be_text_ext, be_style_ext))

        # ── Bloc final : date de délivrance + signataire ─────────────────────
        _deliv_font_ext = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        date_style      = ParagraphStyle('DateSig', parent=styles['Normal'], fontSize=9,
                                         fontName=_deliv_font_ext, alignment=TA_CENTER)
        _deliv_txt_ext  = f"{_L('delivre_le', lang)} {today_str}"
        _deliv_para_ext = Paragraph(ar(_deliv_txt_ext) if lang == 'ar' else _deliv_txt_ext, date_style)

        story.append(CondPageBreak(2.2 * cm))
        story.append(Spacer(1, 0.1 * cm))
        story.append(_deliv_para_ext)
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        # ── QR code + pied de page de validité (registre analytique) ────────────
        # AR : validité 3 mois avec date réelle — propre à l'extrait analytique.
        # FR : texte inchangé via _PDF_LABELS.
        if lang == 'ar':
            validity_note = f'ملاحظة : صلاحية هذا المستخرج ثلاثة (3) أشهر ابتداء من تاريخ {today_str}.'
        else:
            validity_note = _L('validity_3months', 'fr').format(date=today_str)
        qr_str = _qr_text(
            'EXTRAIT_RC',
            ra=ra.numero_ra or '',
            rc=ra.numero_rc or '',
            date_acte=_get_immat_dt_iso(ra),
        )
        qr_cb = _make_qr_footer_callback(qr_str, footer_note=validity_note, lang=lang)

        doc.build(story,
                  onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
                  onLaterPages=qr_cb if qr_cb else lambda c, d: None)
        buffer.seek(0)
        _ref = (ra.numero_rc or ra.numero_ra or 'inconnu').replace('/', '-').replace('\\', '-')
        filename = f"extrait_rc_{_ref}.pdf"
        return HttpResponse(buffer, content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'})


# ── Registre chronologique (liste PDF) ────────────────────────────────────────

class RegistreChronologiquePDFView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'registre-chronologique'
    """Registre chronologique PDF — réservé au greffier (CDC §5)."""
    permission_classes = [EstGreffier]

    def get(self, request):
        date_debut = request.query_params.get('date_debut')
        date_fin   = request.query_params.get('date_fin')
        qs = RegistreChronologique.objects.select_related('ra').order_by('date_acte')
        if date_debut:
            qs = qs.filter(date_acte__gte=date_debut)
        if date_fin:
            qs = qs.filter(date_acte__lte=date_fin)

        buffer = io.BytesIO()
        doc    = _make_doc(buffer, landscape=True)
        story  = _header_table('REGISTRE CHRONOLOGIQUE DES ACTES')
        story.append(Paragraph(
            f"Période : {date_debut or '...'} au {date_fin or '...'}",
            getSampleStyleSheet()['Normal'],
        ))
        story.append(Spacer(1, 0.3 * cm))

        data = [['N° Chrono', 'Date acte', 'Type acte', 'N° RA', 'N° RC', 'Dénomination', 'Statut']]
        for rc in qs:
            data.append([
                rc.numero_chrono or '—',
                _fmt_acte_dt(rc.date_acte),
                rc.type_acte or '—',
                rc.ra.numero_ra if rc.ra else '—',
                rc.ra.numero_rc if rc.ra else '—',
                (rc.ra.denomination[:35] if rc.ra else '—'),
                rc.get_statut_display(),
            ])

        t = Table(data, colWidths=[3 * cm, 2.5 * cm, 3.2 * cm, 2.8 * cm, 2.8 * cm, 5 * cm, 2.5 * cm])
        t.setStyle(_table_style())
        story.append(t)

        # ── QR code (pied de page — identifie le document liste) ──────────────
        period_label = f"{date_debut or '...'}_au_{date_fin or '...'}"
        qr_str = _qr_text(
            'REGISTRE_CHRONO',
            ref=f"PERIODE:{period_label}",
        )
        qr_cb = _make_qr_footer_callback(qr_str, qr_size_cm=2.2, label='Document officiel')

        doc.build(story,
                  onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
                  onLaterPages=qr_cb if qr_cb else lambda c, d: None)
        buffer.seek(0)
        return HttpResponse(buffer, content_type='application/pdf',
            headers={'Content-Disposition': 'attachment; filename="registre_chronologique.pdf"'})


# ── Vues RBE (Registre des Bénéficiaires Effectifs) ───────────────────────────

class AttestationRBEView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'attestation-rbe'
    """Attestation d'inscription au Registre des Bénéficiaires Effectifs.
    Impression réservée au greffier (CDC §5)."""
    permission_classes = [EstGreffier]

    def get(self, request, rbe_id):
        from apps.rbe.models import RegistreBE
        try:
            rbe = RegistreBE.objects.select_related(
                'ra', 'localite', 'validated_by'
            ).get(pk=rbe_id)
        except RegistreBE.DoesNotExist:
            return Response({'detail': 'Introuvable.'}, status=http_status.HTTP_404_NOT_FOUND)

        signataire = _get_signataire()
        lang       = request.query_params.get('lang', 'fr').lower()
        styles     = getSampleStyleSheet()
        buffer     = io.BytesIO()
        doc        = _make_doc(buffer)

        story = _header_table(
            "ATTESTATION D'INSCRIPTION AU REGISTRE DES BÉNÉFICIAIRES EFFECTIFS",
            "شهادة التسجيل في سجل المستفيدين الحقيقيين",
            lang=lang,
        )
        _nfont_rbe  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        _nalign_rbe = TA_RIGHT     if lang == 'ar' else TA_LEFT
        normal = ParagraphStyle('N10', parent=styles['Normal'], fontSize=10,
                                fontName=_nfont_rbe, alignment=_nalign_rbe, spaceAfter=6)
        _cfont_rbe = _ARABIC_FONT if lang == 'ar' else 'Helvetica-Bold'
        # Référence RBE : centrée (FR et AR)
        center = ParagraphStyle('C12', parent=styles['Normal'], fontSize=12,
                                fontName=_cfont_rbe, alignment=TA_CENTER,
                                spaceAfter=8, textColor=COLORS['primary'])

        story.append(Spacer(1, 0.3 * cm))
        # Référence : toujours affiché (numéro neutre), label traduit si arabe
        if lang == 'ar':
            _ref_rbe_txt = ar(f"{_L('num_decl_rbe', 'ar')} : {rbe.numero_rbe}")
        else:
            _ref_rbe_txt = f"Référence : <b>{rbe.numero_rbe}</b>"
        story.append(Paragraph(_ref_rbe_txt, center))
        story.append(Spacer(1, 0.3 * cm))

        denomination = rbe.ra.denomination if rbe.ra else rbe.denomination_entite
        rows = [
            [_L('num_decl_rbe',    lang), rbe.numero_rbe or '—'],
            [_L('type_entite',     lang), dict(RegistreBE.TYPE_ENTITE_CHOICES).get(rbe.type_entite, rbe.type_entite)],
            [_L('denomination_rbe',lang), denomination or '—'],
            [_L('type_decl',       lang), dict(RegistreBE.TYPE_DECLARATION_CHOICES).get(rbe.type_declaration, rbe.type_declaration)],
            [_L('date_decl',       lang), str(rbe.date_declaration) if rbe.date_declaration else '—'],
            [_L('greffe_rbe',      lang), str(rbe.localite) if rbe.localite else '—'],
            [_L('statut_rbe',      lang), dict(RegistreBE.STATUT_CHOICES).get(rbe.statut, rbe.statut)],
        ]
        if rbe.ra:
            rows.insert(2, [_L('num_rc_lie', lang), rbe.ra.numero_rc or rbe.ra.numero_ra or '—'])

        beneficiaires = rbe.beneficiaires.filter(actif=True)
        if beneficiaires.exists():
            rows.append([_L('nb_beneficiaires', lang), str(beneficiaires.count())])

        info_table = _build_info_table(rows, col_w=[7 * cm, 9.5 * cm], lang=lang)
        story.append(info_table)

        story.append(Spacer(1, 0.5 * cm))
        _cert_rbe_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        _cert_rbe_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
        normal = ParagraphStyle('N10', parent=styles['Normal'], fontSize=10,
                                fontName=_cert_rbe_font, alignment=_cert_rbe_align, spaceAfter=6)
        # ⚠ Pour l'arabe : pas de <b> dans la chaîne passée à ar() — le bidi
        #   réordonne les caractères et casse le balisage HTML.
        if lang == 'ar':
            _cert_rbe_txt = ar(
                f"أشهد أنا الممضي أدناه بأن إقرار المستفيد(ين) الحقيقي(ين) "
                f"لـ{denomination or '—'} قد سُجِّل رسمياً في سجل المستفيدين الحقيقيين "
                f"تحت الرقم {rbe.numero_rbe}."
            )
        else:
            _cert_rbe_txt = (
                f"Je soussigné(e) certifie que la déclaration de bénéficiaire(s) effectif(s) "
                f"de <b>{denomination or '—'}</b> a été régulièrement inscrite au Registre "
                f"des Bénéficiaires Effectifs sous le numéro <b>{rbe.numero_rbe}</b>."
            )
        # ── Bloc final : phrase certifiante + acte + date + signataire ───────
        _acte_txt  = _L('acte_phrase', lang)
        _acte_para = Paragraph(ar(_acte_txt) if lang == 'ar' else _acte_txt, normal)

        _today_rbe     = date.today().strftime('%d/%m/%Y')
        _fait_txt_rbe  = f"{_L('fait_a', lang)} {_today_rbe}"
        _fait_rbe_font = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        _fait_rbe_style = ParagraphStyle('FaitRBE', parent=styles['Normal'], fontSize=10,
                                         fontName=_fait_rbe_font, alignment=TA_CENTER)
        _fait_rbe_para = Paragraph(ar(_fait_txt_rbe) if lang == 'ar' else _fait_txt_rbe, _fait_rbe_style)

        story.append(CondPageBreak(3.2 * cm))
        story.append(Paragraph(_cert_rbe_txt, normal))
        story.append(Spacer(1, 0.15 * cm))
        story.append(_acte_para)
        story.append(Spacer(1, 0.15 * cm))
        story.append(_fait_rbe_para)
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        qr_str = _qr_text('ATTESTATION_RBE',
                          ref=rbe.numero_rbe or '',
                          ra=rbe.ra.numero_ra if rbe.ra else '')
        qr_cb = _make_qr_footer_callback(qr_str, lang=lang)
        doc.build(story,
                  onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
                  onLaterPages=qr_cb if qr_cb else lambda c, d: None)
        buffer.seek(0)
        filename = f"attestation_rbe_{rbe.numero_rbe}.pdf"
        return HttpResponse(buffer, content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'})


class ExtraitRBEView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'extrait-rbe'
    """Extrait complet du dossier RBE avec liste des bénéficiaires.
    Impression réservée au greffier (CDC §5)."""
    permission_classes = [EstGreffier]

    def get(self, request, rbe_id):
        from apps.rbe.models import RegistreBE, BeneficiaireEffectif
        try:
            rbe = RegistreBE.objects.select_related(
                'ra', 'localite', 'validated_by'
            ).prefetch_related('beneficiaires__nationalite').get(pk=rbe_id)
        except RegistreBE.DoesNotExist:
            return Response({'detail': 'Introuvable.'}, status=http_status.HTTP_404_NOT_FOUND)

        signataire = _get_signataire()
        lang       = request.query_params.get('lang', 'fr').lower()
        styles     = getSampleStyleSheet()
        buffer     = io.BytesIO()
        doc        = _make_doc(buffer)

        story = _header_table(
            "EXTRAIT DU REGISTRE DES BÉNÉFICIAIRES EFFECTIFS",
            "مستخرج من سجل المستفيدين الحقيقيين",
            lang=lang,
        )

        denomination = rbe.ra.denomination if rbe.ra else rbe.denomination_entite

        _sec_font_rbe  = _ARABIC_FONT if lang == 'ar' else 'Helvetica-Bold'
        _sec_align_rbe = TA_RIGHT     if lang == 'ar' else TA_LEFT
        sec    = ParagraphStyle('Secx', parent=styles['Normal'], fontSize=11,
                                fontName=_sec_font_rbe, alignment=_sec_align_rbe,
                                textColor=COLORS['primary'],
                                spaceBefore=10, spaceAfter=4)
        _normal_font_rbe  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        _normal_align_rbe = TA_RIGHT     if lang == 'ar' else TA_LEFT
        normal = ParagraphStyle('N10x', parent=styles['Normal'], fontSize=10,
                                fontName=_normal_font_rbe, alignment=_normal_align_rbe, spaceAfter=6)

        # ── Déclaration ──────────────────────────────────────────────────────
        _sec_decl_txt = _L('sec_decl', lang)
        story.append(Paragraph(ar(_sec_decl_txt) if lang == 'ar' else _sec_decl_txt, sec))
        decl_rows = [
            [_L('num_decl_rbe',    lang), rbe.numero_rbe or '—'],
            [_L('type_entite',     lang), dict(RegistreBE.TYPE_ENTITE_CHOICES).get(rbe.type_entite, rbe.type_entite)],
            [_L('denom_rbe2',      lang), denomination or '—'],
            [_L('type_decl',       lang), dict(RegistreBE.TYPE_DECLARATION_CHOICES).get(rbe.type_declaration, rbe.type_declaration)],
            [_L('date_decl',       lang), str(rbe.date_declaration) if rbe.date_declaration else '—'],
            [_L('statut_rbe',      lang), dict(RegistreBE.STATUT_CHOICES).get(rbe.statut, rbe.statut)],
            [_L('greffe_rbe',      lang), str(rbe.localite) if rbe.localite else '—'],
        ]
        if rbe.ra:
            decl_rows.insert(2, [_L('num_rc_lie', lang), rbe.ra.numero_rc or rbe.ra.numero_ra or '—'])

        decl_table = _build_info_table(decl_rows, lang=lang)
        story.append(decl_table)

        # ── Déclarant ────────────────────────────────────────────────────────
        if rbe.declarant_nom:
            _sec_declarant_txt = _L('sec_declarant', lang)
            story.append(Paragraph(ar(_sec_declarant_txt) if lang == 'ar' else _sec_declarant_txt, sec))
            d_rows = [
                # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
                [_L('nom_prenom_g', lang), f"{_civ(rbe.declarant_civilite, lang)} {rbe.declarant_prenom} {rbe.declarant_nom}".strip()],
                [_L('qualite',      lang), rbe.declarant_qualite or '—'],
                [_L('adresse',      lang), rbe.declarant_adresse or '—'],
                [_L('telephone',    lang), rbe.declarant_telephone or '—'],
            ]
            if rbe.declarant_email:
                d_rows.append([_L('email', lang), rbe.declarant_email])
            dt = _build_info_table(d_rows, lang=lang)
            story.append(dt)

        # ── Bénéficiaires effectifs ──────────────────────────────────────────
        beneficiaires = rbe.beneficiaires.filter(actif=True)
        if beneficiaires.exists():
            _sec_ben_txt = _L('sec_beneficiaires', lang)
            story.append(Paragraph(ar(_sec_ben_txt) if lang == 'ar' else _sec_ben_txt, sec))
            NATURE_LABELS = dict(BeneficiaireEffectif.NATURE_CONTROLE_CHOICES)
            TYPE_DOC_LABELS = dict(BeneficiaireEffectif.TYPE_DOCUMENT_CHOICES)
            for i, b in enumerate(beneficiaires, 1):
                if lang == 'ar':
                    _ben_n_txt = ar(f"{_L('ben_eff_n', 'ar')} {i}")
                else:
                    _ben_n_txt = f"<b>{_L('ben_eff_n', 'fr')} {i}</b>"
                story.append(Paragraph(_ben_n_txt, normal))
                b_rows = [
                    [_L('nom_complet', lang), f"{_civ(b.civilite, lang)} {b.prenom} {b.nom}".strip()],
                ]
                if b.nom_ar or b.prenom_ar:
                    # Ne pas pré-appeler ar() ici : _build_info_table le fera pour lang='ar'
                    # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
                    b_rows.append([_L('nom_arabe', lang), f"{b.prenom_ar or ''} {b.nom_ar or ''}".strip()])
                if b.date_naissance:
                    b_rows.append([_L('date_naissance', lang), str(b.date_naissance)])
                if b.lieu_naissance:
                    b_rows.append([_L('lieu_naissance', lang), b.lieu_naissance])
                if b.nationalite:
                    _nat_lbl_b = (b.nationalite.libelle_ar if lang == 'ar' else b.nationalite.libelle_fr) or '—'
                    b_rows.append([_L('nationalite', lang), _nat_lbl_b])
                if b.type_document and b.numero_document:
                    b_rows.append([_L('doc_identification', lang),
                                   f"{TYPE_DOC_LABELS.get(b.type_document, b.type_document)} : {b.numero_document}"])
                if b.adresse:
                    b_rows.append([_L('adresse', lang), b.adresse])
                if b.nature_controle:
                    b_rows.append([_L('nature_controle', lang),
                                   NATURE_LABELS.get(b.nature_controle, b.nature_controle)])
                if b.pourcentage_detention is not None:
                    b_rows.append([_L('pct_detention', lang), f"{b.pourcentage_detention:.2f} %"])
                if b.date_prise_effet:
                    b_rows.append([_L('date_prise_effet', lang), str(b.date_prise_effet)])
                bt = _build_info_table(b_rows, lang=lang)
                story.append(bt)
                if i < beneficiaires.count():
                    story.append(Spacer(1, 0.3 * cm))

        # ── Observations ─────────────────────────────────────────────────────
        if rbe.observations:
            _sec_obs_txt = _L('sec_observations', lang)
            story.append(Paragraph(ar(_sec_obs_txt) if lang == 'ar' else _sec_obs_txt, sec))
            story.append(Paragraph(ar(rbe.observations) if lang == 'ar' else rbe.observations, normal))

        # ── Bloc final : date de délivrance + signataire ─────────────────────
        _today_rbe_ext   = date.today().strftime('%d/%m/%Y')
        _deliv_rbe_txt   = f"{_L('delivre_le', lang)} {_today_rbe_ext}"
        _deliv_rbe_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        _deliv_rbe_style = ParagraphStyle('DelivRBE', parent=styles['Normal'], fontSize=10,
                                          fontName=_deliv_rbe_font, alignment=TA_CENTER)
        _deliv_rbe_para  = Paragraph(ar(_deliv_rbe_txt) if lang == 'ar' else _deliv_rbe_txt, _deliv_rbe_style)

        story.append(CondPageBreak(2.2 * cm))
        story.append(Spacer(1, 0.1 * cm))
        story.append(_deliv_rbe_para)
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        qr_str = _qr_text('EXTRAIT_RBE',
                          ref=rbe.numero_rbe or '',
                          ra=rbe.ra.numero_ra if rbe.ra else '')
        qr_cb = _make_qr_footer_callback(qr_str, lang=lang)
        doc.build(story,
                  onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
                  onLaterPages=qr_cb if qr_cb else lambda c, d: None)
        buffer.seek(0)
        filename = f"extrait_rbe_{rbe.numero_rbe}.pdf"
        return HttpResponse(buffer, content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'})


# ── Certificat de radiation ────────────────────────────────────────────────────

class CertificatRadiationView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'certificat-radiation'
    """GET /rapports/certificat-radiation/<rad_id>/
    Impression réservée au greffier (CDC §5)."""
    permission_classes = [EstGreffier]

    def get(self, request, rad_id):
        from apps.radiations.models import Radiation
        try:
            rad = Radiation.objects.select_related(
                'ra', 'ra__ph', 'ra__pm', 'ra__sc', 'ra__localite',
                'validated_by', 'created_by',
            ).prefetch_related('ra__chronos').get(pk=rad_id)
        except Radiation.DoesNotExist:
            return Response({'detail': 'Radiation introuvable.'}, status=http_status.HTTP_404_NOT_FOUND)

        if rad.statut != 'VALIDEE':
            return Response({'detail': 'Le certificat n\'est disponible que pour une radiation validée.'}, status=http_status.HTTP_400_BAD_REQUEST)

        ra         = rad.ra
        signataire = _get_signataire()
        # ── Règle RCCM : langue exclusivement celle de l'acte — jamais celle de l'UI
        lang       = rad.langue_acte if rad.langue_acte in ('fr', 'ar') else 'fr'
        styles     = getSampleStyleSheet()
        buffer     = io.BytesIO()
        doc        = _make_doc(buffer)

        story = _header_table(
            'CERTIFICAT DE RADIATION',
            'شهادة الشطب',
            lang=lang,
        )

        _is_ar_rad   = (lang == 'ar')
        _nfont_rad   = _ARABIC_FONT if _is_ar_rad else 'Helvetica'
        _nalign_rad  = TA_RIGHT     if _is_ar_rad else TA_LEFT
        normal   = ParagraphStyle('N10', parent=styles['Normal'], fontSize=9,
                                  fontName=_nfont_rad, alignment=_nalign_rad, spaceAfter=4)
        _c12font_rad = _ARABIC_FONT if _is_ar_rad else 'Helvetica-Bold'
        # Référence radiation : centrée (FR et AR)
        center12 = ParagraphStyle('C12', parent=styles['Normal'], fontSize=12,
                                  fontName=_c12font_rad, alignment=TA_CENTER,
                                  spaceAfter=6, textColor=COLORS['primary'])
        _warn_font = _ARABIC_FONT if _is_ar_rad else 'Helvetica-Bold'
        warn_style = ParagraphStyle('Warn', parent=styles['Normal'], fontSize=10,
                                   fontName=_warn_font, alignment=TA_CENTER,
                                   textColor=colors.HexColor('#b91c1c'), spaceAfter=8)

        # ── Référence ──────────────────────────────────────────────────────────
        story.append(Spacer(1, 0.15 * cm))
        # ⚠ Pas de <b> dans les chaînes passées à ar() (bidi casse le balisage HTML)
        if _is_ar_rad:
            _ref_rad_txt = ar(f"{_L('num_radiation', 'ar')} : {rad.numero_radia}")
        else:
            _ref_rad_txt = f"Référence : <b>{rad.numero_radia}</b>"
        story.append(Paragraph(_ref_rad_txt, center12))
        _radie_txt = _L('radie_mention', lang)
        story.append(Paragraph(ar(_radie_txt) if lang == 'ar' else _radie_txt, warn_style))
        story.append(Spacer(1, 0.1 * cm))

        # ── Tableau des informations ───────────────────────────────────────────
        denomination_fr = ra.denomination if ra else '—'
        numero_ra       = ra.numero_ra    if ra else '—'
        numero_rc_val   = ra.numero_rc    if ra else '—'
        date_immat      = _get_immat_dt(ra, lang=lang) if ra else '—'
        _type_entite_ar_map = {
            'PH': _L('ph_label', lang), 'PM': _L('pm_label', lang), 'SC': _L('sc_label', lang),
        }
        type_entite_lbl = _type_entite_ar_map.get(ra.type_entite, ra.type_entite) if ra else '—'

        forme_juridique = ''
        if ra and ra.type_entite == 'PM' and ra.pm and ra.pm.forme_juridique:
            if lang == 'ar' and hasattr(ra.pm.forme_juridique, 'libelle_ar'):
                forme_juridique = ra.pm.forme_juridique.libelle_ar or str(ra.pm.forme_juridique)
            else:
                forme_juridique = str(ra.pm.forme_juridique)

        _nom_prenom_rad = lambda u: (
            f"{u.prenom or ''} {u.nom or ''}".strip() or getattr(u, 'login', '—')
        ) if u else '—'
        _demandeur_rad = (rad.demandeur or '').strip() or _nom_prenom_rad(rad.created_by)

        rows = [
            [_L('num_radiation',  lang), rad.numero_radia or '—'],
            [_L('date_radiation', lang), _fmt_acte_dt(rad.date_radiation, lang=lang)],
            [_L('demandeur',      lang), _demandeur_rad],
            # Numéro chronologique en premier — numéro analytique en second (règle RCCM)
            [_L('num_chrono',     lang), _get_numero_chrono(ra)],
            [_L('num_ra',         lang), numero_ra],
            [_L('denomination',   lang), denomination_fr],
            [_L('type_entite',    lang), type_entite_lbl],
        ]
        if forme_juridique:
            rows.append([_L('forme_juridique', lang), forme_juridique])
        rows += [
            [_L('date_immat',     lang), date_immat],
            [_L('motif',          lang), _motif_label(rad.motif, lang)],
        ]
        if rad.description:
            rows.append([_L('description', lang), rad.description])
        # ⚠ Les mentions « Validé par » et « Date de validation » sont supprimées :
        # un certificat officiel RCCM n'expose jamais les données internes du workflow.

        info_table = _build_info_table(rows, col_w=[7 * cm, 9.5 * cm], lang=lang)
        story.append(info_table)

        # ── Mention certifiante ────────────────────────────────────────────────
        story.append(Spacer(1, 0.4 * cm))
        _cert_rad_font  = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        _cert_rad_align = TA_RIGHT     if lang == 'ar' else TA_LEFT
        normal = ParagraphStyle('N10', parent=styles['Normal'], fontSize=9,
                                fontName=_cert_rad_font, alignment=_cert_rad_align, spaceAfter=4)
        # ⚠ Pas de <b> dans les chaînes ar() : bidi casse le balisage HTML.
        if lang == 'ar':
            _cert_rad_txt = ar(
                f"أشهد أنا الممضي أدناه بأن {denomination_fr} قد شُطب رسمياً من السجل "
                f"التجاري تحت الرقم التحليلي {numero_ra}، "
                f"بتاريخ {_fmt_acte_dt(rad.date_radiation, lang='ar')}، "
                f"لسبب: {_motif_label(rad.motif, 'ar')}."
            )
        else:
            _cert_rad_txt = (
                f"Je soussigné(e), certifie que <b>{denomination_fr}</b> a été régulièrement radiée "
                f"du registre du commerce sous le numéro analytique <b>{numero_ra}</b>, "
                f"en date du <b>{_fmt_acte_dt(rad.date_radiation, lang='fr')}</b>, "
                f"pour motif de <b>{_motif_label(rad.motif, 'fr')}</b>."
            )
        # ── Bloc final : texte certifiant + phrase + date + signataire ────────
        _cert_phrase_rad      = _L('cert_phrase', lang)
        _cert_phrase_rendered = ar(_cert_phrase_rad) if lang == 'ar' else _cert_phrase_rad

        _rad_date_font = _ARABIC_FONT if lang == 'ar' else 'Helvetica'
        date_style     = ParagraphStyle('DateSig', parent=styles['Normal'], fontSize=9,
                                        fontName=_rad_date_font, alignment=TA_CENTER)
        _today_rad    = date.today().strftime('%d/%m/%Y')
        _fait_rad_txt = f"{_L('fait_a', lang)} {_today_rad}"
        _fait_rad_para = Paragraph(ar(_fait_rad_txt) if lang == 'ar' else _fait_rad_txt, date_style)

        story.append(CondPageBreak(3.2 * cm))
        story.append(Paragraph(_cert_rad_txt, normal))
        story.append(Spacer(1, 0.15 * cm))
        story.append(Paragraph(_cert_phrase_rendered, normal))
        story.append(Spacer(1, 0.1 * cm))
        story.append(_fait_rad_para)
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        qr_str = _qr_text('CERTIFICAT_RADIATION',
                          ref=rad.numero_radia or '',
                          ra=numero_ra,
                          rc=numero_rc_val,
                          date_acte=rad.date_radiation.isoformat() if rad.date_radiation else '')
        qr_cb = _make_qr_footer_callback(qr_str, lang=lang)
        doc.build(story,
                  onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
                  onLaterPages=qr_cb if qr_cb else lambda c, d: None)
        buffer.seek(0)
        filename = f"certificat_radiation_{rad.numero_radia}.pdf"
        return HttpResponse(buffer, content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'})


# ── Certificat d'inscription modificative ─────────────────────────────────────

class CertificatModificationView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'certificat-modification'
    """GET /rapports/certificat-modification/<modif_id>/?lang=fr|ar
    Certificat d'inscription modificative au registre du commerce.
    Disponible après validation (statut VALIDE).
    Accessible au greffier et aux agents pour leurs propres modifications validées."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request, modif_id):
        from apps.modifications.models import Modification

        # ── Récupération ────────────────────────────────────────────────────────
        try:
            modif = Modification.objects.select_related(
                'ra', 'ra__ph', 'ra__pm', 'ra__sc', 'ra__localite',
                'validated_by', 'created_by',
            ).prefetch_related('lignes', 'ra__chronos').get(pk=modif_id)
        except Modification.DoesNotExist:
            return Response({'detail': 'Modification introuvable.'},
                            status=http_status.HTTP_404_NOT_FOUND)

        # ── Contrôle statut : certificat uniquement pour VALIDE ─────────────────
        if modif.statut != 'VALIDE':
            return Response(
                {'detail': 'Le certificat n\'est disponible que pour une modification validée.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # ── Contrôle accès : un agent ne voit que ses propres modifications ─────
        if not est_greffier(request.user) and modif.created_by_id != request.user.pk:
            return Response({'detail': 'Accès non autorisé à ce document.'},
                            status=http_status.HTTP_403_FORBIDDEN)

        # ── Initialisations ─────────────────────────────────────────────────────
        ra         = modif.ra
        signataire = _get_signataire()
        # ── Règle RCCM : langue exclusivement celle de l'acte — jamais celle de l'UI
        lang       = modif.langue_acte if modif.langue_acte in ('fr', 'ar') else 'fr'

        styles  = getSampleStyleSheet()
        buffer  = io.BytesIO()
        doc     = _make_doc(buffer)

        _is_ar  = (lang == 'ar')
        _nfont  = _ARABIC_FONT if _is_ar else 'Helvetica'
        _nalign = TA_RIGHT     if _is_ar else TA_LEFT
        _bfont  = _ARABIC_FONT if _is_ar else 'Helvetica-Bold'

        normal      = ParagraphStyle('CM_N',   parent=styles['Normal'], fontSize=9,
                                     fontName=_nfont,  alignment=_nalign, spaceAfter=4)
        small       = ParagraphStyle('CM_S',   parent=styles['Normal'], fontSize=8,
                                     fontName=_nfont,  alignment=_nalign,
                                     textColor=colors.HexColor('#555555'), spaceAfter=3)
        sec_style   = ParagraphStyle('CM_Sec', parent=styles['Normal'], fontSize=9.5,
                                     fontName=_bfont,  alignment=_nalign,
                                     textColor=COLORS['primary'], spaceBefore=8, spaceAfter=4)
        intro_style = ParagraphStyle('CM_Int', parent=styles['Normal'], fontSize=9,
                                     fontName=_nfont,  alignment=_nalign,
                                     textColor=colors.HexColor('#374151'),
                                     spaceAfter=4, leftIndent=4)

        # ── Variables communes ───────────────────────────────────────────────────
        numero_ra      = ra.numero_ra           if ra                     else '—'
        numero_rc      = ra.numero_rc           if ra                     else '—'
        type_entite    = ra.type_entite         if ra                     else ''
        date_modif_str = _fmt_acte_dt(modif.date_modif, lang=lang) if modif.date_modif else '—'
        date_valid_str = (modif.validated_at.strftime('%d/%m/%Y')
                          if modif.validated_at else '—')
        date_immat_str = _get_immat_dt(ra, lang=lang) if ra else '—'

        _nom_prenom = lambda u: (
            f"{u.prenom or ''} {u.nom or ''}".strip() or getattr(u, 'login', '—')
        ) if u else '—'
        validated_by_nom = _nom_prenom(modif.validated_by)
        created_by_nom   = _nom_prenom(modif.created_by)

        _type_lbl = {'PH': _L('ph_label', lang), 'PM': _L('pm_label', lang),
                     'SC': _L('sc_label', lang)}.get(type_entite, '—')

        # Dénomination d'identification = ancienne valeur (avant modification)
        # Pour PH : le nom civil ne change jamais → ra.denomination (nom_complet) toujours correct
        # Pour PM/SC : la dénomination peut avoir changé → on utilise avant_donnees
        _avant_entity = (modif.avant_donnees or {}).get('entity', {})
        if type_entite in ('PM', 'SC') and _avant_entity.get('denomination'):
            denomination = _avant_entity['denomination']
        else:
            denomination = ra.denomination if ra else '—'

        # Demandeur métier : champ dédié (priorité), puis méta JSON (compat.), puis créateur
        _meta_nd    = (modif.nouvelles_donnees or {}).get('meta', {}) or {}
        demandeur   = (
            (modif.demandeur or '').strip()
            or (_meta_nd.get('demandeur', '') or '').strip()
            or created_by_nom
        )

        # ── En-tête officiel ─────────────────────────────────────────────────────
        story = _header_table(
            'CERTIFICAT D\'INSCRIPTION MODIFICATIVE AU REGISTRE DU COMMERCE',
            'شهادة القيد التعديلي في السجل التجاري',
            lang=lang,
        )
        # Sous-titre : type d'entité (PM / PH / SC) affiché immédiatement sous le titre
        _type_lbl_fr = {'PH': 'Personne physique', 'PM': 'Personne morale',
                        'SC': 'Succursale'}.get(type_entite, type_entite)
        _type_lbl_ar = {'PH': 'شخص طبيعي', 'PM': 'شخص اعتباري',
                        'SC': 'فرع'}.get(type_entite, type_entite)
        _subtitle_txt = ar(_type_lbl_ar) if _is_ar else _type_lbl_fr
        subtitle_style = ParagraphStyle(
            'CM_Sub', fontName=_bfont, fontSize=10,
            alignment=TA_CENTER if not _is_ar else TA_CENTER,
            textColor=colors.HexColor('#374151'), spaceAfter=6, spaceBefore=0,
        )
        story.append(Paragraph(_subtitle_txt, subtitle_style))
        story.append(Spacer(1, 0.1 * cm))

        # ════════════════════════════════════════════════════════════════════════
        # SECTION I — Identification de l'entreprise
        # ════════════════════════════════════════════════════════════════════════
        _sec_i = _L('sec_ent_modif', lang)
        story.append(Paragraph(ar(_sec_i) if _is_ar else _sec_i, sec_style))

        id_rows = [
            [_L('num_ra',       lang), numero_ra],
            [_L('num_chrono',   lang), _get_numero_chrono(ra)],
            [_L('denomination', lang), denomination],
            [_L('type_entite',  lang), _type_lbl],
            [_L('date_immat',   lang), date_immat_str],
        ]

        # Lignes spécifiques selon type d'entité
        # Note : nom commercial PH absent de l'identification — il figure déjà dans le tableau III
        if type_entite == 'PH' and ra and ra.ph:
            # Gérant actif uniquement
            try:
                g = ra.gerants.filter(actif=True).first()
                if g and g.nom_gerant:
                    # Restitution nom + prénom — الاسم واللقب
                    # Règle absolue RCCM : PRÉNOM puis NOM, quelle que soit la langue
                    _gdi     = g.donnees_ident or {}
                    _gprenom = _gdi.get('prenom', '')
                    _gfull   = f"{_gprenom} {g.nom_gerant}".strip()
                    id_rows.append([_L('gerant_ph', lang), _gfull or g.nom_gerant])
            except Exception:
                pass

        elif type_entite == 'PM' and ra and ra.pm:
            pm = ra.pm
            if pm.forme_juridique:
                id_rows.append([_L('forme_juridique', lang), str(pm.forme_juridique)])

        elif type_entite == 'SC' and ra and ra.sc:
            # Note : le siège social et l'activité de la succursale ne figurent PAS
            # dans la section d'identification — ils apparaissent uniquement dans le
            # tableau des modifications (Section III) si ils ont été modifiés.
            pass

        story.append(_build_info_table(id_rows, col_w=[6.5 * cm, 10 * cm], lang=lang))
        story.append(Spacer(1, 0.15 * cm))

        # ════════════════════════════════════════════════════════════════════════
        # SECTION II — Références de l'opération
        # ════════════════════════════════════════════════════════════════════════
        _sec_ii = _L('sec_ref_operation', lang)
        story.append(Paragraph(ar(_sec_ii) if _is_ar else _sec_ii, sec_style))

        ref_rows = [
            [_L('num_modif',    lang), modif.numero_modif or '—'],
            [_L('date_demande', lang), date_modif_str],
            [_L('demandeur',    lang), demandeur],
        ]
        story.append(_build_info_table(ref_rows, col_w=[6.5 * cm, 10 * cm], lang=lang))
        story.append(Spacer(1, 0.15 * cm))

        # ════════════════════════════════════════════════════════════════════════
        # SECTION III — Modifications enregistrées
        # ════════════════════════════════════════════════════════════════════════
        _sec_iii = _L('sec_detail_modif', lang)
        story.append(Paragraph(ar(_sec_iii) if _is_ar else _sec_iii, sec_style))

        # Paragraphe d'introduction
        _intro = _L('objet_modif_intro', lang)
        story.append(Paragraph(ar(_intro) if _is_ar else _intro, intro_style))

        # Entêtes colonnes
        if _is_ar:
            _col_champ = ar('الحقل المُعدَّل')
            _col_avant = ar('القيمة السابقة')
            _col_apres = ar('القيمة الجديدة')
        else:
            _col_champ = 'Champ modifié'
            _col_avant = 'Ancienne valeur'
            _col_apres = 'Nouvelle valeur'

        # ── Source préférée : LigneModification (peuplées à la validation) ─────
        lignes = list(modif.lignes.all())

        # ── SC : correction de libellé sur les lignes stockées ────────────────
        # L'ancienne implémentation stockait 'objet_social' pour la SC ; le libellé
        # correct est 'Activité'. On corrige à la volée sans toucher à la base.
        # Note : ar() n'est PAS appliqué ici — il est appliqué par _p() au rendu.
        if type_entite == 'SC' and lignes:
            _act_lbl = 'النشاط' if _is_ar else 'Activité'

            class _WrappedLigne:
                """Proxy corrigeant objet_social→activite pour SC."""
                __slots__ = ('libelle_champ', 'ancienne_valeur', 'nouvelle_valeur')

                def __init__(self, l):
                    _code = getattr(l, 'code_champ', '')
                    self.libelle_champ   = (_act_lbl
                                            if _code == 'objet_social'
                                            else getattr(l, 'libelle_champ', ''))
                    self.ancienne_valeur = getattr(l, 'ancienne_valeur', '')
                    self.nouvelle_valeur = getattr(l, 'nouvelle_valeur', '')

            lignes = [_WrappedLigne(l) for l in lignes]

        # ── Fallback : déduire depuis avant_donnees / nouvelles_donnees ─────────
        if not lignes:
            av      = modif.avant_donnees    or {}
            nd      = modif.nouvelles_donnees or {}
            av_ent  = av.get('entity', {})
            av_ra_d = av.get('ra',     {})
            av_meta = av.get('meta',   {})
            nd_ent  = nd.get('entity', {})
            nd_ra_d = nd.get('ra',     {})
            nd_meta = nd.get('meta',   {})

            # Libellés métier lisibles
            _FLABELS = {
                'denomination':       ('Nom commercial (enseigne)'
                                       if type_entite == 'PH' else 'Dénomination'),
                'denomination_ar':    'Dénomination (AR)',
                'sigle':              'Sigle',
                'forme_juridique_id': 'Forme juridique',
                'capital_social':     'Capital social',
                'devise_capital':     'Devise du capital',
                'duree_societe':      'Durée de la société',
                'siege_social':       'Siège social',
                'ville':              'Ville',
                'telephone':          'Téléphone',
                'fax':                'Fax',
                'email':              'E-mail',
                'site_web':           'Site web',
                'bp':                 'B.P.',
                'adresse':            'Adresse',
                'adresse_ar':         'Adresse (AR)',
                'objet_social':       'Objet social',
                'activite':           'Activité',
                'profession':         'Profession / Activité exercée',
                'capital_affecte':    'Capital affecté',
                'numero_rc':          'N° RC',
                'localite_id':        'Localité',
            }

            class _FL:
                """Ligne synthétique imitant LigneModification."""
                def __init__(self, lbl, avant, apres):
                    self.libelle_champ   = lbl
                    self.ancienne_valeur = avant
                    self.nouvelle_valeur = apres

            for champ, nval in nd_ent.items():
                if nval in ('', None):
                    continue
                # ── SC : normaliser objet_social → activite (compat. ancienne implémentation) ─
                champ_eff = champ
                if type_entite == 'SC' and champ == 'objet_social':
                    champ_eff = 'activite'
                # Lecture de l'ancienne valeur : clé canonique puis fallback ancienne clé
                aval = av_ent.get(champ_eff, '') or av_ent.get(champ, '')
                # Libellé : SC→activite forcé 'Activité', sinon _FLABELS
                if type_entite == 'SC' and champ_eff == 'activite':
                    lbl = _L('activite_gen', lang)   # FR: 'Activité' / AR: 'النشاط'
                else:
                    lbl = _FLABELS.get(champ_eff, champ_eff)
                if str(nval) != str(aval if aval is not None else ''):
                    lignes.append(_FL(lbl, str(aval) if aval else '', str(nval)))

            for champ, nval in nd_ra_d.items():
                if nval in ('', None):
                    continue
                aval = av_ra_d.get(champ, '')
                if str(nval) != str(aval if aval is not None else ''):
                    lignes.append(_FL(_FLABELS.get(champ, champ),
                                      str(aval) if aval else '', str(nval)))

            # Gérant PH (méta)
            if nd_meta.get('nouveau_gerant_nom'):
                ancienne_g = str(av_meta.get('gerant_actif_nom', '') or '')
                nouvelle_g = str(nd_meta['nouveau_gerant_nom'])
                if nouvelle_g != ancienne_g:
                    lignes.append(_FL('Gérant', ancienne_g, nouvelle_g))

            # Directeur SC — nouveau format objet ou ancien format chaîne (compat.)
            _cert_dir_obj = nd_meta.get('nouveau_directeur') or {}
            if not _cert_dir_obj and nd_meta.get('nouveau_directeur_nom'):
                _cert_dir_obj = {'nom': nd_meta['nouveau_directeur_nom']}
            if _cert_dir_obj:
                _cd_nom    = (_cert_dir_obj.get('nom')    or '').strip()
                _cd_prenom = (_cert_dir_obj.get('prenom') or '').strip()
                nouvelle_d = f"{_cd_prenom} {_cd_nom}".strip() if _cd_prenom else _cd_nom
                ancienne_d = str(av_meta.get('directeur_actif_nom', '') or '')
                if nouvelle_d and nouvelle_d != ancienne_d:
                    lignes.append(_FL('Directeur', ancienne_d, nouvelle_d))

        # ── Styles cellules du tableau ──────────────────────────────────────────
        _hdr_style  = ParagraphStyle('CM_TH',   parent=styles['Normal'], fontSize=8.5,
                                     fontName=_bfont, alignment=_nalign,
                                     textColor=colors.white)
        _cell_style = ParagraphStyle('CM_TC',   parent=styles['Normal'], fontSize=8.5,
                                     fontName=_nfont, alignment=_nalign)
        _old_style  = ParagraphStyle('CM_TOld', parent=styles['Normal'], fontSize=8.5,
                                     fontName=_nfont, alignment=_nalign,
                                     textColor=colors.HexColor('#b91c1c'))
        _new_style  = ParagraphStyle('CM_TNew', parent=styles['Normal'], fontSize=8.5,
                                     fontName=_nfont, alignment=_nalign,
                                     textColor=COLORS['primary'])

        def _p(txt, sty):
            return Paragraph(ar(str(txt)) if _is_ar else str(txt), sty)

        diff_data = [[_p(_col_champ, _hdr_style),
                      _p(_col_avant, _hdr_style),
                      _p(_col_apres, _hdr_style)]]
        for l in lignes:
            diff_data.append([
                _p(l.libelle_champ or '—',    _cell_style),
                _p(l.ancienne_valeur or '—',  _old_style),
                _p(l.nouvelle_valeur or '—',  _new_style),
            ])
        if len(diff_data) == 1:
            # Aucune modification détectée — ligne vide explicite
            diff_data.append([_p('—', _cell_style), _p('—', _cell_style), _p('—', _cell_style)])

        diff_tbl = Table(diff_data, colWidths=[5 * cm, 5.5 * cm, 6 * cm], repeatRows=1)
        diff_tbl.setStyle(TableStyle([
            ('BACKGROUND',     (0, 0), (-1, 0),  COLORS['primary']),
            ('TEXTCOLOR',      (0, 0), (-1, 0),  colors.white),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLORS['row_even']]),
            ('GRID',           (0, 0), (-1, -1), 0.4, COLORS['border']),
            ('TOPPADDING',     (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING',  (0, 0), (-1, -1), 4),
            ('LEFTPADDING',    (0, 0), (-1, -1), 5),
            ('RIGHTPADDING',   (0, 0), (-1, -1), 5),
            ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(diff_tbl)
        story.append(Spacer(1, 0.35 * cm))

        # ── Mention certifiante spécifique aux inscriptions modificatives ───────
        _cert_modif = _L('cert_modif_phrase', lang)
        story.append(Paragraph(ar(_cert_modif) if _is_ar else _cert_modif, normal))
        story.append(Spacer(1, 0.2 * cm))

        # ── Lieu, date et signature ──────────────────────────────────────────────
        _today     = date.today().strftime('%d/%m/%Y')
        _fait_txt  = f"{_L('fait_a', lang)} {_today}"
        date_style = ParagraphStyle('CM_Date', parent=styles['Normal'], fontSize=9,
                                    fontName=_nfont, alignment=TA_CENTER)
        story.append(Paragraph(ar(_fait_txt) if _is_ar else _fait_txt, date_style))
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        # ── QR code sécurité documentaire ───────────────────────────────────────
        qr_str = _qr_text(
            'CERTIFICAT_MODIFICATION',
            ref=modif.numero_modif or '',
            ra=numero_ra,
            rc=numero_rc,
            date_acte=modif.date_modif.isoformat() if modif.date_modif else '',
        )
        qr_cb = _make_qr_footer_callback(qr_str, lang=lang)
        doc.build(
            story,
            onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
            onLaterPages=qr_cb if qr_cb else lambda c, d: None,
        )
        buffer.seek(0)
        filename = f"certificat_modification_{modif.numero_modif or modif_id}.pdf"
        return HttpResponse(
            buffer,
            content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )


# ── Certificat de cession de parts sociales ──────────────────────────────────

class CertificatCessionPartsView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'certificat-cession-parts'
    """GET /rapports/certificat-cession-parts/<ces_id>/?lang=fr|ar
    Certificat de cession de parts sociales / d'actions.
    Disponible uniquement après validation (statut VALIDE).
    Accessible au greffier et aux agents pour leurs propres opérations validées."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request, ces_id):
        from apps.cessions.models import Cession

        # ── Récupération ────────────────────────────────────────────────────────
        try:
            ces = Cession.objects.select_related(
                'ra', 'ra__pm', 'ra__ph', 'ra__sc', 'ra__localite',
                'associe_cedant', 'associe_cedant__ph', 'associe_cedant__pm',
                'beneficiaire_associe', 'beneficiaire_associe__ph', 'beneficiaire_associe__pm',
                'validated_by', 'created_by',
            ).prefetch_related('ra__chronos').get(pk=ces_id)
        except Cession.DoesNotExist:
            return Response({'detail': 'Cession introuvable.'},
                            status=http_status.HTTP_404_NOT_FOUND)

        if ces.statut != 'VALIDE':
            return Response(
                {'detail': 'Le certificat n\'est disponible que pour une cession validée.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if not est_greffier(request.user) and ces.created_by_id != request.user.pk:
            return Response({'detail': 'Accès non autorisé à ce document.'},
                            status=http_status.HTTP_403_FORBIDDEN)

        # ── Initialisations ─────────────────────────────────────────────────────
        ra         = ces.ra
        signataire = _get_signataire()
        # ── Règle RCCM : langue exclusivement celle de l'acte — jamais celle de l'UI
        lang       = ces.langue_acte if ces.langue_acte in ('fr', 'ar') else 'fr'

        styles  = getSampleStyleSheet()
        buffer  = io.BytesIO()
        doc     = _make_doc(buffer)

        _is_ar  = (lang == 'ar')
        _nfont  = _ARABIC_FONT if _is_ar else 'Helvetica'
        _nalign = TA_RIGHT     if _is_ar else TA_LEFT
        _bfont  = _ARABIC_FONT if _is_ar else 'Helvetica-Bold'

        normal    = ParagraphStyle('CP_N',   parent=styles['Normal'], fontSize=9,
                                   fontName=_nfont,  alignment=_nalign, spaceAfter=4)
        small     = ParagraphStyle('CP_S',   parent=styles['Normal'], fontSize=8,
                                   fontName=_nfont,  alignment=_nalign,
                                   textColor=colors.HexColor('#555555'), spaceAfter=3)
        sec_style = ParagraphStyle('CP_Sec', parent=styles['Normal'], fontSize=9.5,
                                   fontName=_bfont,  alignment=_nalign,
                                   textColor=COLORS['primary'], spaceBefore=8, spaceAfter=4)

        # ── Données de base ──────────────────────────────────────────────────────
        numero_ra       = ra.numero_ra if ra else '—'
        numero_rc       = ra.numero_rc if ra else '—'
        type_entite     = ra.type_entite if ra else ''
        denomination    = ra.denomination if ra else '—'
        date_immat_str  = _get_immat_dt(ra, lang=lang) if ra else '—'
        date_ces_str    = _fmt_acte_dt(ces.date_cession, lang=lang) if ces.date_cession else '—'
        date_valid_str  = ces.validated_at.strftime('%d/%m/%Y') if ces.validated_at else '—'

        _nom_prenom = lambda u: (
            f"{u.prenom or ''} {u.nom or ''}".strip() or getattr(u, 'login', '—')
        ) if u else '—'
        validated_by_nom = _nom_prenom(ces.validated_by)
        created_by_nom   = _nom_prenom(ces.created_by)
        demandeur        = (ces.demandeur or '').strip() or created_by_nom

        # Dénomination de l'associé (ph/pm/nom_associe) — الاسم واللقب complet
        def _assoc_nom(a):
            if not a: return '—'
            if a.ph:  return a.ph.nom_complet or '—'
            if a.pm:  return a.pm.denomination or '—'
            # Associé sans entité liée : reconstruire nom + prénom depuis donnees_ident
            _adi    = a.donnees_ident or {}
            _aprenom = _adi.get('prenom', '')
            _anom    = a.nom_associe or ''
            _afull   = f"{_aprenom} {_anom}".strip() if _aprenom else _anom
            return _afull or '—'

        cedant_nom = _assoc_nom(ces.associe_cedant)

        if ces.beneficiaire_type == 'EXISTANT':
            beneficiaire_nom = _assoc_nom(ces.beneficiaire_associe)
        else:
            d = ces.beneficiaire_data or {}
            beneficiaire_nom = f"{d.get('prenom','')} {d.get('nom','')}".strip() or '—'

        # ── Parts avant/après depuis snapshot ────────────────────────────────────
        snapshot = ces.snapshot_avant or {}
        av_parts = {str(s['id']): s['nombre_parts'] for s in snapshot.get('associes', [])}

        def _parts_avant(assoc):
            if not assoc: return '—'
            return str(av_parts.get(str(assoc.id), '—'))

        def _parts_apres(assoc):
            if not assoc: return '—'
            return str(assoc.nombre_parts)

        cedant_av   = _parts_avant(ces.associe_cedant)
        cedant_ap   = _parts_apres(ces.associe_cedant)

        if ces.beneficiaire_type == 'EXISTANT':
            benef_av = _parts_avant(ces.beneficiaire_associe)
            benef_ap = _parts_apres(ces.beneficiaire_associe)
        else:
            # Nouvel associé : parts avant = 0
            benef_av = '0'
            benef_ap = str(ces.nombre_parts_cedees or '—') if ces.type_cession_parts == 'PARTIELLE' else cedant_av

        # Parts cédées
        if ces.type_cession_parts == 'TOTALE':
            parts_cedees_str = cedant_av  # toutes les parts / actions du cédant
        else:
            parts_cedees_str = str(ces.nombre_parts_cedees or '—')

        # ── Détection SA : terminologie « actions » ou « parts sociales » ────────
        # SA → capital divisé en actions ; toute autre forme → parts sociales.
        _is_sa = False
        try:
            if ra and ra.pm and ra.pm.forme_juridique:
                _is_sa = (ra.pm.forme_juridique.code or '').upper() == 'SA'
        except Exception:
            pass

        # ── Libellés dépendants de la forme sociale ──────────────────────────────
        if _is_sa:
            _titre_fr  = 'CERTIFICAT DE CESSION D\'ACTIONS'
            _titre_ar  = 'شهادة التنازل عن الأسهم'
            _sec_iii_fr = 'III — Situation des actions — Avant / Après cession'
            _sec_iii_ar = 'III — وضعية الأسهم — قبل / بعد التنازل'
            _lbl_parts_ced_fr = 'Actions cédées'
            _lbl_parts_ced_ar = 'عدد الأسهم المتنازَل عنها'
            _type_ces_fr = {'TOTALE': 'Cession totale d\'actions',
                            'PARTIELLE': 'Cession partielle d\'actions'}.get(ces.type_cession_parts, '—')
            _type_ces_ar = {'TOTALE': 'تنازل كلي عن أسهم',
                            'PARTIELLE': 'تنازل جزئي عن أسهم'}.get(ces.type_cession_parts, '—')
            _col_av_fr = 'Actions avant cession'
            _col_ap_fr = 'Actions après cession'
            _col_av_ar = 'الأسهم قبل التنازل'
            _col_ap_ar = 'الأسهم بعد التنازل'
        else:
            _titre_fr  = 'CERTIFICAT DE CESSION DE PARTS SOCIALES'
            _titre_ar  = 'شهادة التنازل عن الحصص الاجتماعية'
            _sec_iii_fr = 'III — Situation des parts sociales — Avant / Après cession'
            _sec_iii_ar = 'III — وضعية الحصص الاجتماعية — قبل / بعد التنازل'
            _lbl_parts_ced_fr = 'Parts cédées'
            _lbl_parts_ced_ar = 'عدد الحصص المتنازَل عنها'
            _type_ces_fr = {'TOTALE': 'Cession totale',
                            'PARTIELLE': 'Cession partielle'}.get(ces.type_cession_parts, '—')
            _type_ces_ar = {'TOTALE': 'تنازل كلي',
                            'PARTIELLE': 'تنازل جزئي'}.get(ces.type_cession_parts, '—')
            _col_av_fr = 'Parts avant cession'
            _col_ap_fr = 'Parts après cession'
            _col_av_ar = 'الحصص قبل التنازل'
            _col_ap_ar = 'الحصص بعد التنازل'

        # ── En-tête officiel ─────────────────────────────────────────────────────
        story = _header_table(_titre_fr, _titre_ar, lang=lang)
        subtitle_style = ParagraphStyle(
            'CP_Sub', fontName=_bfont, fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#374151'), spaceAfter=6, spaceBefore=0,
        )
        _type_lbl_fr = {'PH': 'Personne physique', 'PM': 'Personne morale',
                        'SC': 'Succursale'}.get(type_entite, type_entite)
        _type_lbl_ar = {'PH': 'شخص طبيعي', 'PM': 'شخص اعتباري',
                        'SC': 'فرع'}.get(type_entite, type_entite)
        _subtitle_txt = ar(_type_lbl_ar) if _is_ar else _type_lbl_fr
        story.append(Paragraph(_subtitle_txt, subtitle_style))
        story.append(Spacer(1, 0.1 * cm))

        # ════════════════════════════════════════════════════════════════════════
        # SECTION I — Identification de l'entreprise
        # ════════════════════════════════════════════════════════════════════════
        _sec_i_fr = 'I — Identification de l\'entreprise'
        _sec_i_ar = 'I — التعريف بالمنشأة'
        story.append(Paragraph(ar(_sec_i_ar) if _is_ar else _sec_i_fr, sec_style))

        _type_lbl = _type_lbl_ar if _is_ar else _type_lbl_fr
        id_rows = [
            [_L('num_ra',       lang), numero_ra],
            [_L('num_chrono',   lang), _get_numero_chrono(ra)],
            [_L('denomination', lang), denomination],
            [_L('type_entite',  lang), _type_lbl],
            [_L('date_immat',   lang), date_immat_str],
        ]
        if ra and ra.pm and ra.pm.forme_juridique:
            id_rows.append([_L('forme_juridique', lang), str(ra.pm.forme_juridique)])

        story.append(_build_info_table(id_rows, col_w=[6.5 * cm, 10 * cm], lang=lang))
        story.append(Spacer(1, 0.15 * cm))

        # ════════════════════════════════════════════════════════════════════════
        # SECTION II — Références de l'opération
        # Note : « Validé par » et « Date de validation » exclus (workflow interne)
        # ════════════════════════════════════════════════════════════════════════
        _sec_ii_fr = 'II — Références de l\'opération'
        _sec_ii_ar = 'II — مراجع العملية'
        story.append(Paragraph(ar(_sec_ii_ar) if _is_ar else _sec_ii_fr, sec_style))

        _lbl_num_ces   = ar('رقم التنازل')         if _is_ar else 'N° Cession'
        _lbl_date_ces  = ar('تاريخ الطلب')         if _is_ar else 'Date de la demande'
        _lbl_dem       = ar('المُقدِّم')            if _is_ar else 'Demandeur'
        _lbl_type_ces  = ar('نوع التنازل')          if _is_ar else 'Type de cession'
        _lbl_parts_ced = ar(_lbl_parts_ced_ar) if _is_ar else _lbl_parts_ced_fr
        _type_ces_str  = _type_ces_ar if _is_ar else _type_ces_fr

        # ── Référence : lignes / multi-parties / héritage ───────────────────────
        _lignes = ces.lignes or []
        if _lignes:
            _total_lignes = sum(l.get('nombre_parts', 0) for l in _lignes)
            _lbl_total_tr = ar('مجموع الحصص المتنازَل عنها')  if _is_ar else 'Total parts transférées'
            ref_rows = [
                [_lbl_num_ces,    ces.numero_cession or '—'],
                [_lbl_date_ces,   date_ces_str],
                [_lbl_dem,        demandeur],
                [_lbl_total_tr,   str(_total_lignes)],
            ]
        elif ces.cedants:
            _total_multi  = sum(c.get('nombre_parts', 0) for c in ces.cedants)
            _lbl_total_tr = ar('مجموع الحصص المتنازَل عنها') if _is_ar else 'Total parts transférées'
            ref_rows = [
                [_lbl_num_ces,    ces.numero_cession or '—'],
                [_lbl_date_ces,   date_ces_str],
                [_lbl_dem,        demandeur],
                [_lbl_total_tr,   str(_total_multi)],
            ]
        else:
            ref_rows = [
                [_lbl_num_ces,   ces.numero_cession or '—'],
                [_lbl_date_ces,  date_ces_str],
                [_lbl_dem,       demandeur],
                [_lbl_type_ces,  _type_ces_str],
                [_lbl_parts_ced, parts_cedees_str],
            ]
        story.append(_build_info_table(ref_rows, col_w=[6.5 * cm, 10 * cm], lang=lang))
        story.append(Spacer(1, 0.15 * cm))

        # ════════════════════════════════════════════════════════════════════════
        # SECTION II bis — Détail des transferts de parts (Cédant → Cessionnaire)
        # ════════════════════════════════════════════════════════════════════════
        _sec_iib_fr = 'II bis — Détail des transferts de parts'
        _sec_iib_ar = 'II مكرر — تفاصيل نقل الحصص'
        _det_col_ced   = ar('المتنازِل')             if _is_ar else 'Cédant'
        _det_col_cess  = ar('المستفيد')              if _is_ar else 'Cessionnaire'
        _det_col_parts = ar('الحصص المتنازَل عنها')  if _is_ar else 'Parts cédées'

        _det_hdr_style = ParagraphStyle('CP_DH', parent=styles['Normal'], fontSize=8.5,
                                        fontName=_bfont, alignment=_nalign,
                                        textColor=colors.white)
        _det_cell_st   = ParagraphStyle('CP_DC', parent=styles['Normal'], fontSize=8.5,
                                        fontName=_nfont, alignment=_nalign)
        _det_parts_st  = ParagraphStyle('CP_DP', parent=styles['Normal'], fontSize=8.5,
                                        fontName=_bfont, alignment=TA_CENTER,
                                        textColor=COLORS['primary'])

        def _dp(txt, sty):
            return Paragraph(ar(str(txt)) if _is_ar else str(txt), sty)

        def _cess_identity(l):
            """Return display name for a cessionnaire ligne."""
            if l.get('cessionnaire_type') == 'EXISTANT':
                return l.get('cessionnaire_nom') or '—'
            tp = l.get('cessionnaire_type_personne', 'PH')
            if tp == 'PM':
                return l.get('cessionnaire_denomination') or \
                       f"{l.get('cessionnaire_prenom','').strip()} {l.get('cessionnaire_nom','').strip()}".strip() or '—'
            # PH
            civ    = l.get('cessionnaire_civilite', '')
            prenom = l.get('cessionnaire_prenom', '').strip()
            nom    = l.get('cessionnaire_nom', '').strip()
            parts  = [p for p in [civ, prenom, nom] if p]
            return ' '.join(parts) or '—'

        if _lignes or ces.cedants:
            story.append(Paragraph(ar(_sec_iib_ar) if _is_ar else _sec_iib_fr, sec_style))
            det_data = [
                [_dp(_det_col_ced,   _det_hdr_style),
                 _dp('→',            _det_hdr_style),
                 _dp(_det_col_cess,  _det_hdr_style),
                 _dp(_det_col_parts, _det_hdr_style)],
            ]
            if _lignes:
                for l in _lignes:
                    det_data.append([
                        _dp(l.get('cedant_nom') or '—',  _det_cell_st),
                        _dp('→',                          _det_cell_st),
                        _dp(_cess_identity(l),            _det_cell_st),
                        _dp(l.get('nombre_parts', '—'),   _det_parts_st),
                    ])
            else:
                # Mode multi-parties : associer cedants et cessionnaires séquentiellement
                _ced_list  = ces.cedants or []
                _cess_list = ces.cessionnaires or []
                _max_rows  = max(len(_ced_list), len(_cess_list))
                for i in range(_max_rows):
                    _ced_d  = _ced_list[i]  if i < len(_ced_list)  else {}
                    _cess_d = _cess_list[i] if i < len(_cess_list) else {}
                    _ced_nm  = _ced_d.get('nom', '—') or '—'
                    _cess_nm = (_cess_d.get('prenom', '') + ' ' + _cess_d.get('nom', '')).strip() \
                               if _cess_d.get('type') == 'NOUVEAU' \
                               else (_cess_d.get('nom') or '—')
                    _pts     = _ced_d.get('nombre_parts', _cess_d.get('nombre_parts', '—'))
                    det_data.append([
                        _dp(_ced_nm,  _det_cell_st),
                        _dp('→',      _det_cell_st),
                        _dp(_cess_nm, _det_cell_st),
                        _dp(_pts,     _det_parts_st),
                    ])

            _det_col_widths = [5.5 * cm, 0.8 * cm, 7.5 * cm, 2.7 * cm]
            _det_tbl = Table(det_data, colWidths=_det_col_widths, repeatRows=1)
            _det_tbl.setStyle(TableStyle([
                ('BACKGROUND',  (0, 0), (-1, 0), COLORS['primary']),
                ('TEXTCOLOR',   (0, 0), (-1, 0), colors.white),
                ('FONTNAME',    (0, 0), (-1, 0), _bfont),
                ('FONTSIZE',    (0, 0), (-1, -1), 8.5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f9ff')]),
                ('GRID',        (0, 0), (-1, -1), 0.4, colors.HexColor('#d1d5db')),
                ('VALIGN',      (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING',  (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('ALIGN',       (3, 0), (3, -1), 'CENTER'),
            ]))
            story.append(_det_tbl)
            story.append(Spacer(1, 0.15 * cm))

        # ════════════════════════════════════════════════════════════════════════
        # SECTION III — Situation avant / après cession
        # ════════════════════════════════════════════════════════════════════════
        story.append(Paragraph(ar(_sec_iii_ar) if _is_ar else _sec_iii_fr, sec_style))

        # Paragraphe introductif = observations saisies par l'agent (mot pour mot).
        # Si aucune observation, le paragraphe est simplement omis.
        intro_style = ParagraphStyle('CP_Int', parent=styles['Normal'], fontSize=9,
                                     fontName=_nfont, alignment=_nalign,
                                     textColor=colors.HexColor('#374151'),
                                     spaceAfter=6, leftIndent=4)
        _obs_text = (ces.observations or '').strip()
        if _obs_text:
            story.append(Paragraph(ar(_obs_text) if _is_ar else _obs_text, intro_style))

        # Styles tableau
        _hdr_style  = ParagraphStyle('CP_TH',   parent=styles['Normal'], fontSize=8.5,
                                     fontName=_bfont, alignment=_nalign,
                                     textColor=colors.white)
        _cell_style = ParagraphStyle('CP_TC',   parent=styles['Normal'], fontSize=8.5,
                                     fontName=_nfont, alignment=_nalign)
        _old_style  = ParagraphStyle('CP_TOld', parent=styles['Normal'], fontSize=8.5,
                                     fontName=_nfont, alignment=_nalign,
                                     textColor=colors.HexColor('#b91c1c'))
        _new_style  = ParagraphStyle('CP_TNew', parent=styles['Normal'], fontSize=8.5,
                                     fontName=_nfont, alignment=_nalign,
                                     textColor=COLORS['primary'])

        def _p(txt, sty):
            return Paragraph(ar(str(txt)) if _is_ar else str(txt), sty)

        _col_role = ar('الطرف')           if _is_ar else 'Partie'
        _col_nom  = ar('الاسم / التسمية') if _is_ar else 'Nom / Dénomination'
        _col_av   = ar(_col_av_ar)         if _is_ar else _col_av_fr
        _col_ap   = ar(_col_ap_ar)         if _is_ar else _col_ap_fr

        _role_cedant = ar('المتنازِل') if _is_ar else 'Cédant'
        _role_benef  = ar('المستفيد') if _is_ar else 'Bénéficiaire'

        parts_data = [
            [_p(_col_role, _hdr_style), _p(_col_nom, _hdr_style),
             _p(_col_av, _hdr_style),   _p(_col_ap, _hdr_style)],
        ]

        if _lignes:
            # ── Mode lignes RCCM (canonique) ─────────────────────────────────
            from apps.registres.models import Associe as _Associe
            from collections import defaultdict, OrderedDict as _OD

            # Cédants uniques (ordre d'apparition)
            _ced_ids_ord = list(_OD.fromkeys(l['cedant_associe_id'] for l in _lignes))
            _ced_nom_map = {l['cedant_associe_id']: l['cedant_nom'] for l in _lignes}
            _nb_ced = len(_ced_ids_ord)

            for i, assoc_id in enumerate(_ced_ids_ord):
                nom_c = _ced_nom_map.get(assoc_id, '—') or '—'
                av_c  = str(av_parts.get(str(assoc_id), '—'))
                try:
                    _ac  = _Associe.objects.get(id=assoc_id)
                    ap_c = str(_ac.nombre_parts)
                except Exception:
                    ap_c = '0'
                _lbl = (ar(f'المتنازِل {i+1}') if _is_ar else f'Cédant {i+1}') \
                       if _nb_ced > 1 else _role_cedant
                parts_data.append([
                    _p(_lbl,  _cell_style), _p(nom_c, _cell_style),
                    _p(av_c,  _old_style),  _p(ap_c,  _new_style),
                ])

            # Cessionnaires EXISTANT uniques (ordre d'apparition)
            _cess_exist_ids = list(_OD.fromkeys(
                l['cessionnaire_associe_id']
                for l in _lignes
                if l.get('cessionnaire_type') == 'EXISTANT' and l.get('cessionnaire_associe_id')
            ))
            # Cessionnaires NOUVEAU uniques — clé : (type_personne, identifiant textuel)
            def _nouveau_key(l):
                tp = l.get('cessionnaire_type_personne', 'PH')
                if tp == 'PM':
                    return ('PM', l.get('cessionnaire_denomination', '').strip())
                return ('PH', f"{l.get('cessionnaire_prenom','').strip()}|{l.get('cessionnaire_nom','').strip()}")
            _cess_nouveau = list(_OD.fromkeys(
                _nouveau_key(l)
                for l in _lignes
                if l.get('cessionnaire_type') == 'NOUVEAU'
            ))
            _nb_cess = len(_cess_exist_ids) + len(_cess_nouveau)
            _cess_idx = 0

            for assoc_id in _cess_exist_ids:
                av_cess = str(av_parts.get(str(assoc_id), '0'))
                try:
                    _ac      = _Associe.objects.get(id=assoc_id)
                    nom_cess = _assoc_nom(_ac)
                    ap_cess  = str(_ac.nombre_parts)
                except Exception:
                    nom_cess = '—'; ap_cess = '—'
                _lbl = (ar(f'المستفيد {_cess_idx+1}') if _is_ar else f'Cessionnaire {_cess_idx+1}') \
                       if _nb_cess > 1 else _role_benef
                parts_data.append([
                    _p(_lbl,     _cell_style), _p(nom_cess, _cell_style),
                    _p(av_cess,  _old_style),  _p(ap_cess,  _new_style),
                ])
                _cess_idx += 1

            for (_tp_n, _ident_n) in _cess_nouveau:
                if _tp_n == 'PM':
                    nom_cess = _ident_n or '—'
                    _ap_n = sum(
                        l.get('nombre_parts', 0) for l in _lignes
                        if l.get('cessionnaire_type') == 'NOUVEAU'
                        and l.get('cessionnaire_type_personne', 'PH') == 'PM'
                        and l.get('cessionnaire_denomination', '').strip() == _ident_n
                    )
                else:
                    prenom_n, nom_n = (_ident_n.split('|') + [''])[:2]
                    nom_cess = f"{prenom_n} {nom_n}".strip() or '—'
                    _ap_n = sum(
                        l.get('nombre_parts', 0) for l in _lignes
                        if l.get('cessionnaire_type') == 'NOUVEAU'
                        and l.get('cessionnaire_type_personne', 'PH') == 'PH'
                        and l.get('cessionnaire_prenom', '').strip() == prenom_n
                        and l.get('cessionnaire_nom', '').strip() == nom_n
                    )
                _lbl = (ar(f'المستفيد {_cess_idx+1}') if _is_ar else f'Cessionnaire {_cess_idx+1}') \
                       if _nb_cess > 1 else _role_benef
                parts_data.append([
                    _p(_lbl,     _cell_style), _p(nom_cess,    _cell_style),
                    _p('0',      _old_style),  _p(str(_ap_n),  _new_style),
                ])
                _cess_idx += 1

        elif ces.cedants:
            # ── Mode multi-parties ───────────────────────────────────────────
            from apps.registres.models import Associe as _Associe
            _nb_ced  = len(ces.cedants)
            _nb_cess = len(ces.cessionnaires or [])

            for i, cedant_data in enumerate(ces.cedants):
                assoc_id    = cedant_data.get('associe_id')
                nom_c       = cedant_data.get('nom', '—') or '—'
                av_c        = str(av_parts.get(str(assoc_id),
                                               cedant_data.get('nombre_parts_avant', '—')))
                try:
                    _ac = _Associe.objects.get(id=assoc_id)
                    ap_c = str(_ac.nombre_parts)
                except Exception:
                    ap_c = '0' if cedant_data.get('type_cession') == 'TOTALE' else '—'
                _lbl = (ar(f'المتنازِل {i+1}') if _is_ar else f'Cédant {i+1}') \
                       if _nb_ced > 1 else _role_cedant
                parts_data.append([
                    _p(_lbl,  _cell_style), _p(nom_c, _cell_style),
                    _p(av_c,  _old_style),  _p(ap_c,  _new_style),
                ])

            for i, cess_data in enumerate(ces.cessionnaires or []):
                type_cess = cess_data.get('type', 'EXISTANT')
                if type_cess == 'EXISTANT':
                    assoc_id = cess_data.get('associe_id')
                    av_cess  = str(av_parts.get(str(assoc_id), '0'))
                    try:
                        _ac  = _Associe.objects.get(id=assoc_id)
                        nom_cess = _assoc_nom(_ac)
                        ap_cess  = str(_ac.nombre_parts)
                    except Exception:
                        nom_cess = cess_data.get('nom', '—') or '—'
                        ap_cess  = str(cess_data.get('nombre_parts', '—'))
                else:
                    nom_cess = f"{cess_data.get('prenom', '')} {cess_data.get('nom', '')}".strip() or '—'
                    av_cess  = '0'
                    ap_cess  = str(cess_data.get('nombre_parts', '—'))
                _lbl = (ar(f'المستفيد {i+1}') if _is_ar else f'Cessionnaire {i+1}') \
                       if _nb_cess > 1 else _role_benef
                parts_data.append([
                    _p(_lbl,     _cell_style), _p(nom_cess, _cell_style),
                    _p(av_cess,  _old_style),  _p(ap_cess,  _new_style),
                ])
        else:
            # ── Mode héritage : 1 cédant + 1 bénéficiaire ───────────────────
            parts_data.append([
                _p(_role_cedant,     _cell_style), _p(cedant_nom,       _cell_style),
                _p(cedant_av,        _old_style),  _p(cedant_ap,        _new_style),
            ])
            parts_data.append([
                _p(_role_benef,      _cell_style), _p(beneficiaire_nom, _cell_style),
                _p(benef_av,         _old_style),  _p(benef_ap,         _new_style),
            ])

        parts_tbl = Table(parts_data, colWidths=[3 * cm, 5 * cm, 4 * cm, 4.5 * cm], repeatRows=1)
        parts_tbl.setStyle(TableStyle([
            ('BACKGROUND',     (0, 0), (-1, 0),  COLORS['primary']),
            ('TEXTCOLOR',      (0, 0), (-1, 0),  colors.white),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLORS['row_even']]),
            ('GRID',           (0, 0), (-1, -1), 0.4, COLORS['border']),
            ('TOPPADDING',     (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING',  (0, 0), (-1, -1), 4),
            ('LEFTPADDING',    (0, 0), (-1, -1), 5),
            ('RIGHTPADDING',   (0, 0), (-1, -1), 5),
            ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(parts_tbl)
        story.append(Spacer(1, 0.35 * cm))

        # ── Mention certifiante (texte réglementaire exact — non modifiable) ──────
        # FR : texte officiel imposé par l'exigence métier
        # AR : traduction fidèle, sans divergence juridique
        _cert_fr = ('Le Greffier en charge du Registre du Commerce au Tribunal de Commerce '
                    'de Nouakchott certifie que la présente cession a été dûment enregistrée '
                    'au Registre du commerce.')
        _cert_ar = ('يشهد كاتب الضبط المكلف بالسجل التجاري بالمحكمة التجارية بنواكشوط '
                    'بأن هذا التنازل قد تم تسجيله بصفة نظامية في السجل التجاري.')
        story.append(Paragraph(ar(_cert_ar) if _is_ar else _cert_fr, normal))
        story.append(Spacer(1, 0.2 * cm))

        # ── Lieu, date et signature ─────────────────────────────────────────────
        _today    = date.today().strftime('%d/%m/%Y')
        _fait_fr  = f"Fait le {_today}"
        _fait_ar  = f"حُرِّر بتاريخ {_today}"
        date_style = ParagraphStyle('CP_Date', parent=styles['Normal'], fontSize=9,
                                    fontName=_nfont, alignment=TA_CENTER)
        story.append(Paragraph(ar(_fait_ar) if _is_ar else _fait_fr, date_style))
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        # ── QR code ────────────────────────────────────────────────────────────
        qr_str = _qr_text(
            'CERTIFICAT_CESSION_PARTS',
            ref=ces.numero_cession or '',
            ra=numero_ra,
            rc=numero_rc,
            date_acte=ces.date_cession.isoformat() if ces.date_cession else '',
        )
        qr_cb = _make_qr_footer_callback(qr_str, lang=lang)
        doc.build(
            story,
            onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
            onLaterPages=qr_cb if qr_cb else lambda c, d: None,
        )
        buffer.seek(0)
        filename = f"certificat_cession_{ces.numero_cession or ces_id}.pdf"
        return HttpResponse(
            buffer,
            content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )


# ── Certificat de cession de fonds de commerce ────────────────────────────────

class CertificatCessionFondsView(PdfAuditMixin, APIView):
    _pdf_acte_name = 'certificat-cession-fonds'
    """GET /rapports/certificat-cession-fonds/<cf_id>/?lang=fr|ar
    Certificat de cession d'entreprise (fonds de commerce).
    Disponible uniquement après validation (statut VALIDE).
    Accessible au greffier et aux agents pour leurs propres opérations validées."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request, cf_id):
        from apps.cessions_fonds.models import CessionFonds

        try:
            cf = CessionFonds.objects.select_related(
                'ra', 'ra__ph', 'ra__localite',
                'validated_by', 'created_by',
            ).prefetch_related('ra__chronos').get(pk=cf_id)
        except CessionFonds.DoesNotExist:
            return Response({'detail': 'Cession de fonds introuvable.'},
                            status=http_status.HTTP_404_NOT_FOUND)

        if cf.statut != 'VALIDE':
            return Response(
                {'detail': 'Le certificat est uniquement disponible pour une cession de fonds validée.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # Cloisonnement : agent voit uniquement ses propres opérations
        if not est_greffier(request.user) and cf.created_by_id != request.user.id:
            return Response({'detail': 'Accès non autorisé.'}, status=http_status.HTTP_403_FORBIDDEN)

        ra         = cf.ra
        signataire = _get_signataire()
        # ── Règle RCCM : langue exclusivement celle de l'acte — jamais celle de l'UI
        lang       = cf.langue_acte if cf.langue_acte in ('fr', 'ar') else 'fr'
        styles     = getSampleStyleSheet()
        buffer     = io.BytesIO()
        doc        = _make_doc(buffer)
        _is_ar     = (lang == 'ar')
        _nfont     = _ARABIC_FONT if _is_ar else 'Helvetica'
        _nalign    = TA_RIGHT     if _is_ar else TA_LEFT

        def _L(key, lg='fr'):
            return _PDF_LABELS.get(key, {}).get(lg, _PDF_LABELS.get(key, {}).get('fr', key))

        def _p(txt, style):
            """Wraps in Paragraph; applies ar() if lang=='ar'."""
            t = str(txt) if txt is not None else '—'
            if _is_ar:
                t = ar(t)
            return Paragraph(t, style)

        # ── Styles (optimisés pour tenir sur une seule page A4) ────────────────
        normal = ParagraphStyle('CF_N', parent=styles['Normal'], fontSize=9,
                                fontName=_nfont, alignment=_nalign, spaceAfter=2)
        sec_style = ParagraphStyle('CF_Sec', parent=styles['Normal'], fontSize=10,
                                   fontName=_ARABIC_FONT if _is_ar else 'Helvetica-Bold',
                                   textColor=COLORS['primary'], alignment=_nalign,
                                   spaceBefore=5, spaceAfter=2)
        center12 = ParagraphStyle('CF_C12', parent=styles['Normal'], fontSize=12,
                                  fontName=_ARABIC_FONT if _is_ar else 'Helvetica-Bold',
                                  alignment=TA_CENTER, spaceAfter=4,
                                  textColor=COLORS['primary'])
        date_style = ParagraphStyle('CF_Date', parent=styles['Normal'], fontSize=9,
                                    fontName=_nfont, alignment=TA_CENTER)

        # ── En-tête ─────────────────────────────────────────────────────────────
        story = _header_table(
            'CERTIFICAT DE CESSION DE FONDS DE COMMERCE',
            'شهادة التنازل عن المحل التجاري',
            lang=lang,
        )

        # ── Référence ───────────────────────────────────────────────────────────
        story.append(Spacer(1, 0.08 * cm))
        if _is_ar:
            _ref_txt = ar(f"المرجع : {cf.numero_cession_fonds}")
        else:
            _ref_txt = f"Référence : <b>{cf.numero_cession_fonds}</b>"
        story.append(Paragraph(_ref_txt, center12))
        story.append(Spacer(1, 0.12 * cm))

        # ── Données RA / entreprise ─────────────────────────────────────────────
        numero_ra    = ra.numero_ra    if ra else '—'
        numero_rc    = ra.numero_rc    if ra else '—'
        date_immat   = _get_immat_dt(ra, lang=lang) if ra else '—'

        # Nom commercial / activité depuis RC d'immatriculation
        import json as _j
        nom_commercial = ''
        activite_ent   = ''
        siege_ent      = ''
        try:
            rc_immat = (
                ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                          .order_by('-validated_at').first()
                or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
            )
            if rc_immat and rc_immat.description:
                _desc = (_j.loads(rc_immat.description)
                         if isinstance(rc_immat.description, str) else (rc_immat.description or {}))
                nom_commercial = _desc.get('denomination_commerciale', '') or _desc.get('denomination', '')
                activite_ent   = _desc.get('activite', '') or _desc.get('objet_social', '')
                siege_ent      = _desc.get('siege_social', '')
        except Exception:
            pass

        # Si pas de nom commercial, on utilise le nom du titulaire
        if not nom_commercial and ra and ra.ph:
            nom_commercial = ra.ph.nom_complet

        # ── SECTION I : Identification de l'entreprise ──────────────────────────
        _sec_i = (ar('I. تعريف المنشأة التجارية') if _is_ar
                  else 'I. IDENTIFICATION DE L\'ENTREPRISE')
        story.append(Paragraph(_sec_i, sec_style))
        story.append(HRFlowable(width='100%', thickness=0.5, color=COLORS['border'], spaceAfter=4))

        rows_ent = [
            [_L('num_analytique', lang), numero_ra],
            [_L('num_chrono',     lang), _get_numero_chrono(ra)],
            [_L('date_immat',     lang), date_immat],
        ]
        if nom_commercial:
            rows_ent.append([_L('nom_commercial', lang), nom_commercial])
        if activite_ent:
            rows_ent.append([_L('activite_ph', lang), activite_ent])
        if siege_ent:
            rows_ent.append([_L('siege_social', lang), siege_ent])

        tbl_ent = _build_info_table(rows_ent, col_w=[7 * cm, 9.5 * cm], lang=lang)
        if tbl_ent:
            story.append(tbl_ent)
        story.append(Spacer(1, 0.12 * cm))

        # ── SECTION II : Ancien titulaire (cédant) ──────────────────────────────
        _sec_ii = (ar('II. المتنازِل (الشخص السابق)') if _is_ar
                   else 'II. ANCIEN TITULAIRE (CÉDANT)')
        story.append(Paragraph(_sec_ii, sec_style))
        story.append(HRFlowable(width='100%', thickness=0.5, color=COLORS['border'], spaceAfter=4))

        snap = cf.snapshot_cedant or {}
        cedant_nom_complet = f"{snap.get('prenom', '')} {snap.get('nom', '')}".strip() or '—'
        rows_cedant = [
            [_L('nom_prenoms', lang), cedant_nom_complet],
        ]
        if snap.get('nationalite'):
            rows_cedant.append([_L('nationalite', lang), snap['nationalite']])
        if snap.get('date_naissance'):
            rows_cedant.append([_L('date_naissance', lang), snap['date_naissance']])
        if snap.get('lieu_naissance'):
            rows_cedant.append([_L('lieu_naissance', lang), snap['lieu_naissance']])
        _id_cedant = snap.get('nni', '') or snap.get('num_passeport', '') or ''
        if _id_cedant:
            rows_cedant.append([_L('piece_identite', lang), _id_cedant])
        if snap.get('adresse'):
            rows_cedant.append([_L('adresse', lang), snap['adresse']])
        if snap.get('telephone'):
            rows_cedant.append([_L('telephone', lang), snap['telephone']])

        tbl_cedant = _build_info_table(rows_cedant, col_w=[7 * cm, 9.5 * cm], lang=lang)
        if tbl_cedant:
            story.append(tbl_cedant)
        story.append(Spacer(1, 0.12 * cm))

        # ── SECTION III : Nouveau titulaire (cessionnaire) ──────────────────────
        _sec_iii = (ar('III. المتنازَل إليه (الشخص الجديد)') if _is_ar
                    else 'III. NOUVEAU TITULAIRE (CESSIONNAIRE)')
        story.append(Paragraph(_sec_iii, sec_style))
        story.append(HRFlowable(width='100%', thickness=0.5, color=COLORS['border'], spaceAfter=4))

        cess = cf.cessionnaire_data or {}
        cessionnaire_nom = f"{cess.get('prenom', '')} {cess.get('nom', '')}".strip() or '—'
        rows_cess = [
            [_L('nom_prenoms', lang), cessionnaire_nom],
        ]
        if cess.get('nationalite_id'):
            try:
                from apps.parametrage.models import Nationalite as _Nat
                _nat = _Nat.objects.get(pk=cess['nationalite_id'])
                rows_cess.append([_L('nationalite', lang),
                                  _nat.libelle_ar if _is_ar and _nat.libelle_ar else _nat.libelle_fr])
            except Exception:
                pass
        if cess.get('date_naissance'):
            rows_cess.append([_L('date_naissance', lang), str(cess['date_naissance'])])
        if cess.get('lieu_naissance'):
            rows_cess.append([_L('lieu_naissance', lang), cess['lieu_naissance']])
        _id_cess = cess.get('nni', '') or cess.get('num_passeport', '') or ''
        if _id_cess:
            rows_cess.append([_L('piece_identite', lang), _id_cess])
        if cess.get('adresse'):
            rows_cess.append([_L('adresse', lang), cess['adresse']])
        if cess.get('telephone'):
            rows_cess.append([_L('telephone', lang), cess['telephone']])

        tbl_cess = _build_info_table(rows_cess, col_w=[7 * cm, 9.5 * cm], lang=lang)
        if tbl_cess:
            story.append(tbl_cess)
        story.append(Spacer(1, 0.12 * cm))

        # ── SECTION IV : Références de la cession ───────────────────────────────
        _sec_iv = (ar('IV. بيانات التنازل') if _is_ar else 'IV. RÉFÉRENCES DE LA CESSION')
        story.append(Paragraph(_sec_iv, sec_style))
        story.append(HRFlowable(width='100%', thickness=0.5, color=COLORS['border'], spaceAfter=4))

        _TYPE_ACTE_FR = {'NOTARIE': 'Acte notarié', 'SEING_PRIVE': 'Acte sous seing privé'}
        type_acte_display = _TYPE_ACTE_FR.get(cf.type_acte, cf.type_acte or '—')
        if _is_ar:
            type_acte_ar = {'NOTARIE': 'عقد رسمي', 'SEING_PRIVE': 'عقد عرفي'}
            type_acte_display = type_acte_ar.get(cf.type_acte, type_acte_display)

        _nom_prenom_cf = lambda u: (
            f"{u.prenom or ''} {u.nom or ''}".strip() or getattr(u, 'login', '—')
        ) if u else '—'
        _demandeur_cf = (cf.demandeur or '').strip() or _nom_prenom_cf(cf.created_by)

        rows_ref = [
            [('رقم المرجع' if _is_ar else 'N° de référence'), cf.numero_cession_fonds],
            [('تاريخ ووقت التنازل' if _is_ar else 'Date et heure de cession'),
             _fmt_acte_dt(cf.date_cession, lang=lang)],
            [_L('demandeur', lang), _demandeur_cf],
            [('نوع العقد' if _is_ar else 'Type d\'acte'), type_acte_display],
        ]
        if cf.observations:
            rows_ref.append([_L('observations', lang), cf.observations])

        tbl_ref = _build_info_table(rows_ref, col_w=[7 * cm, 9.5 * cm], lang=lang)
        if tbl_ref:
            story.append(tbl_ref)
        story.append(Spacer(1, 0.15 * cm))

        # ── Mention certifiante ─────────────────────────────────────────────────
        story.append(CondPageBreak(1.5 * cm))
        if _is_ar:
            _cert_txt = ar(
                f"أشهد أنا الممضي أدناه بأن المنشأة التجارية المقيدة تحت الرقم التحليلي "
                f"{numero_ra} قد انتقلت من {cedant_nom_complet} إلى "
                f"{cessionnaire_nom}، "
                f"وذلك بموجب عقد تنازل مؤرخ في {_fmt_acte_dt(cf.date_cession, lang='ar') if cf.date_cession else '—'}."
            )
        else:
            _cert_txt = (
                f"Je soussigné(e) certifie que l'entreprise inscrite au registre sous le numéro "
                f"analytique <b>{numero_ra}</b> a été régulièrement cédée par "
                f"<b>{cedant_nom_complet}</b> à <b>{cessionnaire_nom}</b>, "
                f"par acte de cession en date du "
                f"<b>{_fmt_acte_dt(cf.date_cession) if cf.date_cession else '—'}</b>."
            )
        story.append(Paragraph(_cert_txt, normal))
        story.append(Spacer(1, 0.12 * cm))

        _today     = date.today().strftime('%d/%m/%Y')
        _fait_txt  = f"{_L('fait_a', lang)} {_today}"
        story.append(Paragraph(ar(_fait_txt) if _is_ar else _fait_txt, date_style))
        story += _signature_block(styles, signataire, lang=lang, keep_together=True)

        # ── QR code ─────────────────────────────────────────────────────────────
        qr_str = _qr_text(
            'CESSION_FONDS',
            ref=cf.numero_cession_fonds or '',
            ra=numero_ra,
            rc=numero_rc or '',
            date_acte=cf.date_cession.isoformat() if cf.date_cession else '',
        )
        qr_cb = _make_qr_footer_callback(qr_str, lang=lang)
        doc.build(
            story,
            onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
            onLaterPages=qr_cb if qr_cb else lambda c, d: None,
        )
        buffer.seek(0)
        filename = f"certificat_cession_fonds_{cf.numero_cession_fonds}.pdf"
        return HttpResponse(
            buffer,
            content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )
