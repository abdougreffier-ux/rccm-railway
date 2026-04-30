"""
Relevé mensuel officiel du Guichet unique — vues REST + génération PDF bilingue.

Accès : GREFFIER uniquement (lecture + génération + finalisation + PDF).
"""
import io
import time
import logging
from django.utils import timezone
from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, Table, TableStyle, Spacer, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from apps.registres.models import RegistreChronologique
from apps.core.permissions import EstGreffier

# ── Réutilisation de l'infrastructure PDF de apps.rapports ───────────────────
# Polices, helpers, charte graphique et journalisation PDF sont mutualisés.
from apps.rapports.views import (
    _header_table, _signature_block, _make_doc,
    _ar_style, ar, COLORS, _ARABIC_FONT, _ARABIC_FONT_BOLD,
    _qr_text, _make_qr_footer_callback, _log_pdf, PdfAuditMixin,
    _get_signataire,
)

from .models import ReleveGuichetUnique
from .serializers import ReleveGUListSerializer, ReleveGUDetailSerializer

_log = logging.getLogger('rccm.pdf_audit')

# ── Libellés mois (indépendants de la langue d'interface) ─────────────────────
_MOIS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
_MOIS_AR = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']


# ══════════════════════════════════════════════════════════════════════════════
# ── RÈGLE DE FILTRAGE — NON NÉGOCIABLE ───────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _queryset_immat_gu(annee: int, mois: int):
    """
    Retourne les RegistreChronologique correspondant aux immatriculations GU
    validées pour le mois donné.

    Les quatre critères suivants doivent être satisfaits SIMULTANÉMENT.
    Tout assouplissement constitue une erreur juridique grave :

      1. type_acte = 'IMMATRICULATION'
         → Exclut : MODIFICATION, CESSION, RADIATION, SUSPENSION, REACTIVATION.

      2. statut = 'VALIDE'
         → Exclut : BROUILLON, EN_INSTANCE, RETOURNE, REJETE, ANNULE.

      3. validated_at__year = annee  AND  validated_at__month = mois
         → Borne sur la DATE DE VALIDATION par le greffier.
         → N'utilise PAS date_acte ni created_at.

      4. created_by__role__code = 'AGENT_GU'
         → Exclut toutes les immatriculations créées par GREFFIER ou AGENT_TRIBUNAL.
         → Garantit le périmètre exclusif du Guichet unique.
    """
    return (
        RegistreChronologique.objects
        .filter(
            type_acte='IMMATRICULATION',
            statut='VALIDE',
            validated_at__year=annee,
            validated_at__month=mois,
            created_by__role__code='AGENT_GU',
        )
        .select_related(
            'ra',
            'ra__ph',
            'ra__pm', 'ra__pm__forme_juridique',
            'ra__sc', 'ra__sc__forme_juridique',
            'validated_by',
            'created_by', 'created_by__role',
        )
        .order_by('annee_chrono', 'numero_chrono')
    )


def _generer_contenu(annee: int, mois: int) -> dict:
    """
    Construit le dictionnaire figé du relevé :

    {
      "ph": [<entrée>, …],   # personnes physiques
      "pm": [<entrée>, …],   # personnes morales
      "sc": [<entrée>, …],   # succursales
      "nb_ph": int, "nb_pm": int, "nb_sc": int, "nb_total": int
    }

    Chaque <entrée> :
    {
      "rc_id": int,
      "annee_chrono": int,
      "numero_chrono": str,
      "numero_ra": str,
      "type_entite": "PH"|"PM"|"SC",
      "denomination": str,
      "denomination_ar": str,
      "forme_juridique": str,
      "date_immatriculation": "YYYY-MM-DD",
      "validated_at": "ISO8601"
    }
    """
    ph, pm, sc = [], [], []

    for rc in _queryset_immat_gu(annee, mois):
        ra = rc.ra
        if not ra:
            continue

        # Forme juridique (pertinente pour PM et SC seulement)
        fj = ''
        if ra.type_entite == 'PM' and ra.pm and ra.pm.forme_juridique:
            fj = ra.pm.forme_juridique.code
        elif ra.type_entite == 'SC' and ra.sc and ra.sc.forme_juridique:
            fj = ra.sc.forme_juridique.code

        entry = {
            'rc_id':              rc.id,
            'annee_chrono':       rc.annee_chrono,
            'numero_chrono':      rc.numero_chrono,
            'numero_ra':          ra.numero_ra or '',
            'type_entite':        ra.type_entite,
            'denomination':       ra.denomination or '',
            'denomination_ar':    ra.denomination_ar or '',
            'forme_juridique':    fj,
            'date_immatriculation': (str(ra.date_immatriculation)
                                     if ra.date_immatriculation else ''),
            'validated_at': (rc.validated_at.isoformat()
                             if rc.validated_at else ''),
        }

        if ra.type_entite == 'PH':
            ph.append(entry)
        elif ra.type_entite == 'PM':
            pm.append(entry)
        elif ra.type_entite == 'SC':
            sc.append(entry)

    return {
        'ph':       ph,
        'pm':       pm,
        'sc':       sc,
        'nb_ph':    len(ph),
        'nb_pm':    len(pm),
        'nb_sc':    len(sc),
        'nb_total': len(ph) + len(pm) + len(sc),
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── VUES REST ─────────────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

class ReleveGUListView(generics.ListAPIView):
    """GET /api/releve-gu/ — liste des relevés mensuels (Greffier uniquement)."""
    permission_classes = [EstGreffier]
    serializer_class   = ReleveGUListSerializer
    pagination_class   = None   # Réponse tableau direct — pas de pagination DRF

    def get_queryset(self):
        return (
            ReleveGuichetUnique.objects
            .select_related('genere_par', 'finalise_par')
            .all()
        )


class GenererReleveGUView(APIView):
    """
    POST /api/releve-gu/generer/

    Body  : { "annee": 2026, "mois": 4 }
    Règle : un seul relevé par (annee, mois).
      • Si un relevé FINALISE existe → bloqué (HTTP 400).
      • Si un BROUILLON existe        → écrasé (recalcul + HTTP 200).
      • Sinon                         → créé (HTTP 201).
    """
    permission_classes = [EstGreffier]

    def post(self, request):
        annee = request.data.get('annee')
        mois  = request.data.get('mois')
        if not annee or not mois:
            return Response({'detail': 'Les champs annee et mois sont requis.'}, status=400)
        try:
            annee, mois = int(annee), int(mois)
        except (TypeError, ValueError):
            return Response({'detail': 'annee et mois doivent être des entiers.'}, status=400)
        if not (1 <= mois <= 12):
            return Response({'detail': 'mois doit être compris entre 1 et 12.'}, status=400)
        if annee < 2000 or annee > 2100:
            return Response({'detail': f"annee hors plage valide (2000-2100) : {annee}."}, status=400)

        existant = ReleveGuichetUnique.objects.filter(annee=annee, mois=mois).first()

        # Bloquer l'écrasement d'un relevé finalisé
        if existant and existant.statut == 'FINALISE':
            return Response(
                {'detail': (
                    f"Un relevé finalisé existe déjà pour {annee}/{mois:02d}. "
                    "Les données sont figées et ne peuvent pas être régénérées."
                )},
                status=400,
            )

        contenu = _generer_contenu(annee, mois)

        if existant:
            # Recalcul du brouillon existant
            existant.nb_ph        = contenu['nb_ph']
            existant.nb_pm        = contenu['nb_pm']
            existant.nb_sc        = contenu['nb_sc']
            existant.nb_total     = contenu['nb_total']
            existant.contenu_json = contenu
            existant.genere_par   = request.user
            existant.save(update_fields=[
                'nb_ph', 'nb_pm', 'nb_sc', 'nb_total',
                'contenu_json', 'genere_par',
            ])
            return Response(ReleveGUDetailSerializer(existant).data, status=200)

        releve = ReleveGuichetUnique.objects.create(
            annee=annee, mois=mois,
            nb_ph=contenu['nb_ph'], nb_pm=contenu['nb_pm'],
            nb_sc=contenu['nb_sc'], nb_total=contenu['nb_total'],
            contenu_json=contenu,
            genere_par=request.user,
        )
        return Response(ReleveGUDetailSerializer(releve).data, status=201)


class ReleveGUDetailView(generics.RetrieveAPIView):
    """GET /api/releve-gu/<id>/ — détail d'un relevé avec contenu JSON."""
    permission_classes = [EstGreffier]
    serializer_class   = ReleveGUDetailSerializer
    queryset = ReleveGuichetUnique.objects.select_related('genere_par', 'finalise_par').all()


class FinaliserReleveGUView(APIView):
    """
    POST /api/releve-gu/<pk>/finaliser/

    Fige définitivement le relevé (BROUILLON → FINALISE).
    Un recalcul de sécurité est effectué juste avant la finalisation.
    Aucune modification n'est possible après cette étape.
    """
    permission_classes = [EstGreffier]

    def post(self, request, pk):
        releve = generics.get_object_or_404(ReleveGuichetUnique, pk=pk)

        if releve.statut == 'FINALISE':
            return Response({'detail': 'Ce relevé est déjà finalisé.'}, status=400)

        # Recalcul de sécurité — garantit la cohérence des données figées
        contenu = _generer_contenu(releve.annee, releve.mois)
        releve.nb_ph        = contenu['nb_ph']
        releve.nb_pm        = contenu['nb_pm']
        releve.nb_sc        = contenu['nb_sc']
        releve.nb_total     = contenu['nb_total']
        releve.contenu_json = contenu
        releve.statut       = 'FINALISE'
        releve.finalise_le  = timezone.now()
        releve.finalise_par = request.user
        releve.save()

        return Response({
            'message': 'Relevé finalisé et figé définitivement.',
            'statut':  releve.statut,
            'nb_total': releve.nb_total,
        })


# ══════════════════════════════════════════════════════════════════════════════
# ── GÉNÉRATION PDF ─────────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _build_stat_table_style(is_ar, font, font_b):
    """TableStyle pour le tableau de synthèse statistique."""
    return TableStyle([
        ('BACKGROUND',     (0, 0), (-1,  0),  COLORS['header_bg']),
        ('TEXTCOLOR',      (0, 0), (-1,  0),  colors.white),
        ('FONTNAME',       (0, 0), (-1,  0),  font_b),
        ('FONTSIZE',       (0, 0), (-1,  0),  10),
        ('ALIGN',          (0, 0), (-1, -1),  'RIGHT' if is_ar else 'CENTER'),
        ('FONTNAME',       (0, 1), (-1, -2),  font),
        ('FONTSIZE',       (0, 1), (-1, -2),  9),
        ('FONTNAME',       (0, -1), (-1, -1), font_b),
        ('BACKGROUND',     (0, -1), (-1, -1), COLORS['light_bg']),
        ('ROWBACKGROUNDS', (0,  1), (-1, -2), [colors.white, COLORS['row_even']]),
        ('GRID',           (0,  0), (-1, -1), 0.5, COLORS['border']),
        ('TOPPADDING',     (0,  0), (-1, -1), 7),
        ('BOTTOMPADDING',  (0,  0), (-1, -1), 7),
        ('LEFTPADDING',    (0,  0), (-1, -1), 8),
        ('RIGHTPADDING',   (0,  0), (-1, -1), 8),
    ])


def _build_detail_table_style(is_ar, font, font_b):
    """TableStyle pour le tableau détaillé des immatriculations."""
    return TableStyle([
        ('BACKGROUND',     (0, 0), (-1,  0),  COLORS['header_bg']),
        ('TEXTCOLOR',      (0, 0), (-1,  0),  colors.white),
        ('FONTNAME',       (0, 0), (-1,  0),  font_b),
        ('FONTSIZE',       (0, 0), (-1,  0),  8),
        ('FONTNAME',       (0, 1), (-1, -1),  font),
        ('FONTSIZE',       (0, 1), (-1, -1),  8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),  [colors.white, COLORS['row_even']]),
        ('GRID',           (0, 0), (-1, -1),  0.5, COLORS['border']),
        ('ALIGN',          (0, 0), (-1, -1),  'RIGHT' if is_ar else 'LEFT'),
        ('TOPPADDING',     (0, 0), (-1, -1),  4),
        ('BOTTOMPADDING',  (0, 0), (-1, -1),  4),
        ('LEFTPADDING',    (0, 0), (-1, -1),  5),
        ('RIGHTPADDING',   (0, 0), (-1, -1),  5),
        ('VALIGN',         (0, 0), (-1, -1),  'MIDDLE'),
    ])


def _build_pdf_releve_gu(releve: 'ReleveGuichetUnique', lang: str, user=None) -> bytes:
    """
    Construit le PDF officiel du relevé mensuel GU.

    Garanties :
      • FR et AR produisent un document structuré identique (mêmes chiffres, même structure).
      • Aucune divergence de données entre les deux versions.
      • En-tête institutionnel bilingue dans les deux cas (via _header_table).
    """
    is_ar   = (lang == 'ar')
    styles  = getSampleStyleSheet()
    signat  = _get_signataire()
    contenu = releve.contenu_json

    mois_int = releve.mois
    mois_lbl = ((_MOIS_AR[mois_int] if is_ar else _MOIS_FR[mois_int])
                if 1 <= mois_int <= 12 else str(mois_int))

    # ── Polices selon la langue ───────────────────────────────────────────────
    _font   = _ARABIC_FONT       if is_ar else 'Helvetica'
    _font_b = _ARABIC_FONT_BOLD  if is_ar else 'Helvetica-Bold'
    _align  = TA_RIGHT           if is_ar else TA_LEFT

    # ── Styles Paragraph ─────────────────────────────────────────────────────
    s_normal = ParagraphStyle('GU_N', fontName=_font, fontSize=9,
                              alignment=_align, leading=13, spaceAfter=4)
    s_sectn  = ParagraphStyle('GU_S', fontName=_font_b, fontSize=10,
                              alignment=_align, leading=13, textColor=COLORS['primary'],
                              spaceAfter=6, spaceBefore=12)
    s_cell   = ParagraphStyle('GU_cell', fontName=_font, fontSize=8,
                              alignment=_align, leading=10, spaceAfter=0)
    s_cell_b = ParagraphStyle('GU_cellB', fontName=_font_b, fontSize=8,
                              alignment=_align, leading=10, spaceAfter=0)

    def P(txt, style=None): return Paragraph(str(txt), style or s_cell)
    def PA(txt, style=None): return Paragraph(ar(str(txt)), style or s_cell)

    buffer = io.BytesIO()
    doc    = _make_doc(buffer)
    story  = []

    # ── En-tête institutionnel bilingue ───────────────────────────────────────
    story += _header_table(
        'RELEVÉ MENSUEL DES IMMATRICULATIONS DU GUICHET UNIQUE',
        'كشف شهري لتسجيلات الشباك الموحد',
        lang=lang,
    )

    # ── Période + méta-données ────────────────────────────────────────────────
    genere_par_login = releve.genere_par.login if releve.genere_par else '—'
    genere_le_str    = (releve.genere_le.strftime('%d/%m/%Y %H:%M')
                        if releve.genere_le else '—')
    finalise_le_str  = (releve.finalise_le.strftime('%d/%m/%Y %H:%M')
                        if releve.finalise_le else '—')
    statut_lbl_fr    = 'Finalisé' if releve.statut == 'FINALISE' else 'Brouillon'
    statut_lbl_ar    = 'محدد'    if releve.statut == 'FINALISE' else 'مسودة'

    if is_ar:
        story.append(Paragraph(
            ar(f"الفترة : شهر {mois_lbl} {releve.annee}"),
            s_normal,
        ))
        story.append(Paragraph(
            ar(f"تاريخ التوليد : {genere_le_str}   |   بواسطة : {genere_par_login}   |   الحالة : {statut_lbl_ar}"),
            s_normal,
        ))
        if releve.statut == 'FINALISE':
            story.append(Paragraph(
                ar(f"تاريخ التحديد : {finalise_le_str}"),
                s_normal,
            ))
    else:
        story.append(Paragraph(
            f"<b>Période :</b> Mois de {mois_lbl} {releve.annee}",
            s_normal,
        ))
        story.append(Paragraph(
            f"Généré le : {genere_le_str}   |   Par : {genere_par_login}   |   Statut : {statut_lbl_fr}",
            s_normal,
        ))
        if releve.statut == 'FINALISE':
            story.append(Paragraph(
                f"Finalisé le : {finalise_le_str}",
                s_normal,
            ))

    story.append(Spacer(1, 0.35 * cm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLORS['border']))
    story.append(Spacer(1, 0.3 * cm))

    # ── Synthèse statistique ──────────────────────────────────────────────────
    if is_ar:
        story.append(Paragraph(ar('ملخص إحصائي'), s_sectn))
        stat_hdr = [PA('عدد التسجيلات', s_cell_b), PA('نوع الشخص', s_cell_b)]
        stat_rows = [
            [PA(str(releve.nb_ph)),    PA('أشخاص طبيعيون (ش.ط)')],
            [PA(str(releve.nb_pm)),    PA('أشخاص معنويون (ش.م)')],
            [PA(str(releve.nb_sc)),    PA('فروع (ف)')],
            [PA(str(releve.nb_total), s_cell_b), PA('المجموع', s_cell_b)],
        ]
        stat_col_w = [3.5 * cm, 9.5 * cm]
    else:
        story.append(Paragraph('Synthèse statistique', s_sectn))
        stat_hdr = [P("Type d'entité", s_cell_b), P("Nb. immatriculations", s_cell_b)]
        stat_rows = [
            [P('Personnes physiques (PH)'),   P(str(releve.nb_ph))],
            [P('Personnes morales (PM)'),      P(str(releve.nb_pm))],
            [P('Succursales (SC)'),            P(str(releve.nb_sc))],
            [P('TOTAL', s_cell_b),             P(str(releve.nb_total), s_cell_b)],
        ]
        stat_col_w = [9.5 * cm, 3.5 * cm]

    stat_data = [stat_hdr] + stat_rows
    stat_tbl  = Table(stat_data, colWidths=stat_col_w)
    stat_tbl.setStyle(_build_stat_table_style(is_ar, _font, _font_b))
    story.append(stat_tbl)
    story.append(Spacer(1, 0.5 * cm))

    # ── Tableau détaillé des immatriculations ─────────────────────────────────
    all_entries = (
        contenu.get('ph', []) +
        contenu.get('pm', []) +
        contenu.get('sc', [])
    )

    if all_entries:
        if is_ar:
            story.append(Paragraph(ar('تفاصيل التسجيلات'), s_sectn))
            det_hdr = [
                PA('#'),
                PA('السنة / الرقم التسلسلي'),
                PA('الرقم التحليلي'),
                PA('التسمية'),
                PA('النوع'),
                PA('تاريخ التصديق'),
            ]
            det_col_w = [0.8*cm, 2.8*cm, 2.5*cm, 6.0*cm, 1.2*cm, 2.2*cm]
        else:
            story.append(Paragraph('Détail des immatriculations', s_sectn))
            det_hdr = [
                P('#'),
                P('Année/Chrono'),
                P('N° Analytique'),
                P('Dénomination'),
                P('Type'),
                P('Date val.'),
            ]
            det_col_w = [0.8*cm, 2.8*cm, 2.5*cm, 6.0*cm, 1.2*cm, 2.2*cm]

        det_rows = []
        for idx, e in enumerate(all_entries, 1):
            chrono_str = (f"{e.get('annee_chrono', '')}/{e.get('numero_chrono', '')}"
                          if e.get('annee_chrono') else e.get('numero_chrono', '—'))
            num_ra     = (f"RA{e.get('numero_ra')}" if e.get('numero_ra') else '—')
            denom_val  = (e.get('denomination_ar') or e.get('denomination', '—')
                          if is_ar else e.get('denomination', '—'))
            type_ent   = e.get('type_entite', '—')
            date_val   = (e.get('date_immatriculation', '')
                          or e.get('validated_at', '')[:10]
                          or '—')

            if is_ar:
                det_rows.append([
                    PA(str(idx)),
                    PA(chrono_str),
                    PA(num_ra),
                    PA(denom_val),
                    PA(type_ent),
                    PA(date_val),
                ])
            else:
                det_rows.append([
                    P(str(idx)),
                    P(chrono_str),
                    P(num_ra),
                    P(denom_val),
                    P(type_ent),
                    P(date_val),
                ])

        det_data = [det_hdr] + det_rows
        det_tbl  = Table(det_data, colWidths=det_col_w, repeatRows=1)
        det_tbl.setStyle(_build_detail_table_style(is_ar, _font, _font_b))
        story.append(det_tbl)
    else:
        if is_ar:
            story.append(Paragraph(
                ar('لا توجد تسجيلات عبر الشباك الموحد للفترة المحددة.'),
                s_normal,
            ))
        else:
            story.append(Paragraph(
                'Aucune immatriculation via le Guichet unique pour cette période.',
                s_normal,
            ))

    story.append(Spacer(1, 0.8 * cm))

    # ── Bloc de signature officielle du greffier ──────────────────────────────
    story += _signature_block(styles, signataire=signat, lang=lang, keep_together=True)

    # ── QR code de vérification électronique ──────────────────────────────────
    qr_str = _qr_text(
        'RELEVE_GU',
        ref=(
            f"GU-{releve.annee}-{str(releve.mois).zfill(2)}"
            f"|IMMAT:{releve.nb_total}"
            f"|PH:{releve.nb_ph}|PM:{releve.nb_pm}|SC:{releve.nb_sc}"
            f"|STATUT:{releve.statut}"
        ),
    )
    qr_cb = _make_qr_footer_callback(
        qr_str, qr_size_cm=2.2, label='Relevé officiel GU', lang=lang,
    )
    doc.build(
        story,
        onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
        onLaterPages=qr_cb if qr_cb else lambda c, d: None,
    )
    return buffer.getvalue()


class ReleveGUPDFView(PdfAuditMixin, APIView):
    """
    GET /api/releve-gu/<pk>/pdf/?lang=fr|ar

    Génère et retourne le relevé mensuel officiel en PDF.
    FR et AR produisent un document strictement identique (mêmes données, même structure).
    Accès : Greffier uniquement.
    """
    _pdf_acte_name     = 'releve-gu'
    permission_classes = [EstGreffier]

    def get(self, request, pk):
        releve = generics.get_object_or_404(
            ReleveGuichetUnique.objects.select_related('genere_par', 'finalise_par'),
            pk=pk,
        )
        lang = request.query_params.get('lang', 'fr').lower()
        if lang not in ('fr', 'ar'):
            lang = 'fr'

        t0 = time.monotonic()
        try:
            pdf_bytes = _build_pdf_releve_gu(releve, lang, request.user)
        except Exception as exc:
            _log_pdf(
                user=getattr(request.user, 'login', str(request.user)),
                acte=self._pdf_acte_name,
                reference=str(releve.id),
                langue=lang, succes=False,
                duree_ms=(time.monotonic() - t0) * 1000,
                erreur=str(exc),
            )
            return Response({'detail': f'Erreur génération PDF : {exc}'}, status=500)

        mois_pad = str(releve.mois).zfill(2)
        fname    = f'releve_gu_{releve.annee}_{mois_pad}_{lang}.pdf'
        return HttpResponse(
            pdf_bytes,
            content_type='application/pdf',
            headers={'Content-Disposition': f'attachment; filename="{fname}"'},
        )
