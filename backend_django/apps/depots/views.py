import io
from datetime import date as _date
from django.http import HttpResponse
from rest_framework import generics, serializers, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from .models import Depot
from apps.core.permissions import EstAgentTribunalOuGreffier, EstGreffier, filtrer_par_auteur


# ─── Serializer ───────────────────────────────────────────────────────────────

class DepotSerializer(serializers.ModelSerializer):
    forme_juridique_libelle = serializers.SerializerMethodField()
    created_by_nom          = serializers.SerializerMethodField()
    documents               = serializers.SerializerMethodField()

    class Meta:
        model  = Depot
        fields = [
            'id', 'uuid', 'numero_depot', 'date_depot',
            'civilite_deposant', 'prenom_deposant', 'nom_deposant', 'telephone_deposant',
            'denomination', 'forme_juridique', 'forme_juridique_libelle',
            'objet_social', 'capital', 'siege_social', 'observations',
            'created_at', 'updated_at', 'created_by', 'created_by_nom',
            'documents',
        ]
        read_only_fields = ['uuid', 'numero_depot', 'date_depot', 'created_at', 'updated_at', 'documents']

    def get_forme_juridique_libelle(self, obj):
        if obj.forme_juridique:
            return f"{obj.forme_juridique.code} – {obj.forme_juridique.libelle_fr}"
        return None

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return (f"{obj.created_by.prenom} {obj.created_by.nom}".strip()
                    or obj.created_by.login)
        return None

    def get_documents(self, obj):
        from apps.documents.models import Document
        docs = (Document.objects
                .filter(depot=obj)
                .select_related('type_doc')
                .order_by('-created_at'))
        return [
            {
                'id':          d.id,
                'nom_fichier': d.nom_fichier,
                'taille_ko':   d.taille_ko,
                'mime_type':   d.mime_type,
                'date_scan':   str(d.date_scan),
            }
            for d in docs
        ]


# ─── Vues CRUD ────────────────────────────────────────────────────────────────

class DepotListCreate(generics.ListCreateAPIView):
    """CDC §3.2 : dépôt de statuts — agents tribunal + greffier, cloisonnement par created_by."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = DepotSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields    = ['numero_depot', 'denomination', 'nom_deposant', 'prenom_deposant']
    ordering         = ['-created_at']

    def get_queryset(self):
        qs = Depot.objects.select_related('forme_juridique', 'created_by').all()
        return filtrer_par_auteur(qs, self.request.user)

    def perform_create(self, serializer):
        from apps.demandes.views import _next_numero
        serializer.save(
            numero_depot=_next_numero('DEP'),
            created_by=self.request.user,
        )


class DepotDetail(generics.RetrieveUpdateAPIView):
    """CDC §3.2 : agents voient uniquement leurs dossiers."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = DepotSerializer

    def get_queryset(self):
        qs = Depot.objects.select_related('forme_juridique', 'created_by').all()
        return filtrer_par_auteur(qs, self.request.user)


# ─── Certificat de dépôt (PDF) ────────────────────────────────────────────────

class CertificatDepotView(APIView):
    """Certificat de dépôt PDF — impression réservée au greffier (CDC §5)."""
    permission_classes = [EstGreffier]

    def get(self, request, pk):
        depot = get_object_or_404(Depot, pk=pk)
        lang  = request.query_params.get('lang', 'fr').lower()
        pdf   = _build_certificat(depot, lang=lang)
        resp  = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = (
            f'inline; filename="certificat_depot_{depot.numero_depot}.pdf"'
        )
        return resp


def _build_certificat(depot, lang='fr'):
    """
    Certificat de dépôt PDF — versions française et arabe.

    Corrections appliquées :
      1. En-tête institutionnel officiel (identique aux autres actes) via _header_table().
      2. Titre juridiquement explicite : « CERTIFICAT DE DÉPÔT — SOCIÉTÉ/SUCCURSALE »
         déterminé à partir de FormeJuridique.type_entite (PM/SC/PH).
         Sous-titre : code + libellé de la forme juridique (ex. SUARL — Société …).
      3. Date de délivrance présentée comme dans les autres actes.
      4. Signataire compact via _signature_block() — aucun interligne excessif.
      5. Version arabe strictement identique (même structure, même effet documentaire).
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Table, TableStyle,
        Spacer, HRFlowable, KeepTogether, CondPageBreak,
    )
    # ── Emprunts depuis rapports : header officiel, signature, i18n, arabe ──
    from apps.rapports.views import (
        _header_table, _signature_block,
        _L, ar, COLORS, _ARABIC_FONT,
        _make_qr_footer_callback, _qr_text,
    )
    from apps.parametrage.models import Signataire

    is_ar     = (lang == 'ar')
    today_str = _date.today().strftime('%d/%m/%Y')

    # ── 1. Titre dynamique : nature de l'entité ────────────────────────────
    # FormeJuridique.type_entite ∈ { 'PM', 'SC', 'PH', 'ALL' }
    _NATURES = {
        'PM':  {'fr': 'SOCIÉTÉ',           'ar': 'شركة'},
        'SC':  {'fr': 'SUCCURSALE',        'ar': 'فرع'},
        'PH':  {'fr': 'PERSONNE PHYSIQUE', 'ar': 'شخص طبيعي'},
    }
    te = (depot.forme_juridique.type_entite
          if depot.forme_juridique and depot.forme_juridique.type_entite not in ('', 'ALL')
          else '')
    nat = _NATURES.get(te, {'fr': '', 'ar': ''})

    titre_fr = f"CERTIFICAT DE DÉPÔT — {nat['fr']}" if nat['fr'] else "CERTIFICAT DE DÉPÔT"
    titre_ar = f"شهادة الإيداع — {nat['ar']}"        if nat['ar'] else "شهادة الإيداع"

    # ── QR code — URL de vérification RCCM ────────────────────────────────
    try:
        qr_str = _qr_text(
            doc_type  = 'DEP',
            ref       = depot.numero_depot,
            date_acte = str(depot.date_depot),
        )
        _qr_label = ar('التحقق الإلكتروني') if is_ar else 'Vérification électronique'
        qr_cb = _make_qr_footer_callback(
            qr_text_str = qr_str,
            label       = _qr_label,
            lang        = lang,
        )
    except Exception:
        qr_cb = None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=1.8*cm, bottomMargin=3.5*cm,
    )
    styles = getSampleStyleSheet()
    W = A4[0] - 4*cm   # largeur utile

    # ── 2. En-tête officiel — identique aux autres actes ──────────────────
    story = _header_table(titre_fr, titre_ar, lang=lang)

    # ── Numéro du dépôt sous le titre ──────────────────────────────────────
    num_style = ParagraphStyle('NumDep', parent=styles['Normal'],
        fontSize=10, alignment=TA_CENTER,
        textColor=colors.HexColor('#666666'), spaceAfter=3)
    story.append(Paragraph(f"N° {depot.numero_depot}", num_style))

    # ── Sous-titre : forme juridique (code + libellé) ─────────────────────
    if depot.forme_juridique:
        if is_ar:
            fj_label = depot.forme_juridique.libelle_ar or depot.forme_juridique.libelle_fr
            fj_sub   = f"{depot.forme_juridique.code} — {fj_label}"
            fj_style = ParagraphStyle('FJAr', fontName=_ARABIC_FONT, fontSize=10,
                                      alignment=TA_CENTER, textColor=COLORS['primary'],
                                      spaceBefore=2, spaceAfter=8)
            story.append(Paragraph(ar(fj_sub), fj_style))
        else:
            fj_sub   = f"{depot.forme_juridique.code} — {depot.forme_juridique.libelle_fr}"
            fj_style = ParagraphStyle('FJFr', parent=styles['Normal'], fontSize=10,
                                      fontName='Helvetica', alignment=TA_CENTER,
                                      textColor=COLORS['primary'],
                                      spaceBefore=2, spaceAfter=8)
            story.append(Paragraph(fj_sub, fj_style))

    story.append(Spacer(1, 0.3*cm))

    # ── 3. Corps — champs informatifs ──────────────────────────────────────
    fj_str   = (f"{depot.forme_juridique.code} – {depot.forme_juridique.libelle_fr}"
                if depot.forme_juridique else '—')
    cap_str  = (f"{float(depot.capital):,.2f} MRU" if depot.capital else '—')
    date_str = depot.date_depot.strftime('%d/%m/%Y') if depot.date_depot else '—'

    if is_ar:
        # Version arabe : label à droite (col 1), valeur à gauche (col 0)
        rows_ar = [
            ('رقم الإيداع',       depot.numero_depot),
            ('تاريخ الإيداع',     date_str),
            ('المودِع',           f"{depot.prenom_deposant} {depot.nom_deposant}".strip() or '—'),
            ('الهاتف',            depot.telephone_deposant or '—'),
            ('التسمية',           depot.denomination or '—'),
            ('الشكل القانوني',    fj_str),
            ('رأس المال',         cap_str),
            ('المقر الاجتماعي',   depot.siege_social or '—'),
            ('موضوع النشاط',      depot.objet_social or '—'),
            ('ملاحظات',           depot.observations or '—'),
        ]
        s_lbl = ParagraphStyle('LblAr', fontName='Helvetica-Bold', fontSize=9,
                               alignment=TA_RIGHT, textColor=COLORS['primary'])
        s_val = ParagraphStyle('ValAr', fontName=_ARABIC_FONT, fontSize=10,
                               alignment=TA_RIGHT)
        # Col 0 = valeur (plus large, à gauche physique), Col 1 = label (fond coloré, à droite)
        tbl_data = [
            [Paragraph(ar(val_txt), s_val), Paragraph(ar(lbl_txt), s_lbl)]
            for lbl_txt, val_txt in rows_ar
        ]
        body_tbl = Table(tbl_data, colWidths=[W - 4.2*cm, 4.2*cm])
        body_tbl.setStyle(TableStyle([
            ('BACKGROUND',    (1, 0), (1, -1), colors.HexColor('#eef2f8')),
            ('GRID',          (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING',    (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING',   (0, 0), (-1, -1), 8),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
            ('ALIGN',         (0, 0), (-1, -1), 'RIGHT'),
        ]))
    else:
        rows_fr = [
            ('N° de dépôt',     depot.numero_depot),
            ('Date de dépôt',   date_str),
            ('Déposant',        f"{depot.prenom_deposant} {depot.nom_deposant}".strip() or '—'),
            ('Téléphone',       depot.telephone_deposant or '—'),
            ('Dénomination',    depot.denomination or '—'),
            ('Forme juridique', fj_str),
            ('Capital',         cap_str),
            ('Siège social',    depot.siege_social or '—'),
            ('Objet social',    depot.objet_social or '—'),
            ('Observations',    depot.observations or '—'),
        ]
        s_lbl = ParagraphStyle('Lbl', parent=styles['Normal'], fontSize=9,
                               fontName='Helvetica-Bold', textColor=COLORS['primary'])
        s_val = ParagraphStyle('Val', parent=styles['Normal'], fontSize=10)
        tbl_data = [
            [Paragraph(lbl_txt, s_lbl), Paragraph(val_txt, s_val)]
            for lbl_txt, val_txt in rows_fr
        ]
        body_tbl = Table(tbl_data, colWidths=[4.2*cm, W - 4.2*cm])
        body_tbl.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (0, -1), colors.HexColor('#eef2f8')),
            ('GRID',          (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING',    (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING',   (0, 0), (-1, -1), 8),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        ]))

    story.append(body_tbl)
    story.append(Spacer(1, 0.8*cm))

    # ── Mention légale ─────────────────────────────────────────────────────
    cert_font  = _ARABIC_FONT if is_ar else 'Helvetica-Oblique'
    cert_style = ParagraphStyle('Cert', fontName=cert_font, fontSize=8.5,
                                alignment=TA_CENTER,
                                textColor=colors.HexColor('#555555'))
    cert_txt = _L('cert_phrase', lang)
    story.append(Paragraph(ar(cert_txt) if is_ar else cert_txt, cert_style))
    story.append(Spacer(1, 0.5*cm))

    # ── 4. Date de délivrance — présentation identique aux autres actes ────
    deliv_font  = _ARABIC_FONT if is_ar else 'Helvetica'
    deliv_style = ParagraphStyle('Deliv', fontName=deliv_font, fontSize=9,
                                 alignment=TA_CENTER,
                                 textColor=colors.HexColor('#555555'))
    deliv_txt = f"{_L('delivre_le', lang)} {today_str}"
    story.append(CondPageBreak(2.5*cm))
    story.append(Paragraph(ar(deliv_txt) if is_ar else deliv_txt, deliv_style))

    # ── 5. Signataire compact — via _signature_block() (standard) ─────────
    sig = Signataire.objects.filter(actif=True).first()
    story += _signature_block(styles, sig, lang=lang, keep_together=True)

    # ── Build ──────────────────────────────────────────────────────────────
    doc.build(
        story,
        onFirstPage=qr_cb  if qr_cb else lambda c, d: None,
        onLaterPages=qr_cb if qr_cb else lambda c, d: None,
    )
    return buf.getvalue()
