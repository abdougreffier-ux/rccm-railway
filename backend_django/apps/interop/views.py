"""
apps.interop.views — Endpoints de gestion inter-administrations (réservés greffier)

Endpoints exposés :
  GET  /api/v1/interop/status/        — statut santé de l'API inter-admin
  GET  /api/v1/interop/systemes/      — liste des systèmes externes configurés
  POST /api/v1/interop/systemes/      — enregistrer un nouveau système
  POST /api/v1/interop/cles/          — émettre une nouvelle clé API
  GET  /api/v1/interop/journal/       — consulter le journal des appels

Endpoints API consommés par les systèmes externes (via ApiKeyAuthentication) :
  GET  /api/v1/rc/recherche/          — recherche d'un RC par numéro ou identité
  GET  /api/v1/rc/verification/       — vérification existence + statut
"""
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics, filters
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import EstGreffier
from apps.interop.authentication import ApiKeyAuthentication
from apps.interop.permissions import EstSystemeExterneActif, SCOPE_LECTURE_RC, SCOPE_VERIFICATION_STATUT, SCOPE_RECHERCHE_ENTITE
from apps.interop.models import SystemeExterne, CleAPIExterne, JournalAppelExterne


# ── Gestion (réservé greffier) ─────────────────────────────────────────────────

class InteropStatusView(APIView):
    """
    GET /api/v1/interop/status/
    Sonde de disponibilité de la couche inter-administrations.
    Accessible sans authentification (monitoring externe).
    """
    authentication_classes = []
    permission_classes     = []

    def get(self, request):
        return Response({
            'status':          'operational',
            'service':         'RCCM-API-Interop',
            'version':         'v1',
            'timestamp':       timezone.now().isoformat(),
            'systemes_actifs': SystemeExterne.objects.filter(actif=True).count(),
        })


class SystemesExternesView(APIView):
    """
    GET  /api/v1/interop/systemes/  — liste des systèmes configurés (greffier)
    POST /api/v1/interop/systemes/  — enregistrer un nouveau système partenaire
    """
    permission_classes = [EstGreffier]

    def get(self, request):
        qs = SystemeExterne.objects.prefetch_related('cles').order_by('code')
        data = [
            {
                'id':           s.id,
                'code':         s.code,
                'libelle':      s.libelle,
                'libelle_ar':   s.libelle_ar,
                'type_systeme': s.type_systeme,
                'actif':        s.actif,
                'nb_cles':      s.cles.filter(actif=True).count(),
                'scopes':       s.scopes,
                'updated_at':   s.updated_at.isoformat(),
            }
            for s in qs
        ]
        return Response(data)

    def post(self, request):
        d = request.data
        code = (d.get('code') or '').strip().upper()
        if not code:
            return Response({'detail': 'Le champ code est obligatoire.'}, status=400)
        if SystemeExterne.objects.filter(code=code).exists():
            return Response({'detail': f'Le code {code!r} existe déjà.'}, status=400)

        systeme = SystemeExterne.objects.create(
            code=code,
            libelle=d.get('libelle', ''),
            libelle_ar=d.get('libelle_ar', ''),
            type_systeme=d.get('type_systeme', 'AUTRE'),
            actif=True,
            ip_autorises=d.get('ip_autorises', []),
            scopes=d.get('scopes', []),
            description=d.get('description', ''),
            contact_technique=d.get('contact_technique', ''),
        )
        return Response({
            'id': systeme.id, 'code': systeme.code,
            'message': f'Système {code!r} créé avec succès.',
        }, status=201)


class EmissionCleAPIView(APIView):
    """
    POST /api/v1/interop/cles/
    Émet une nouvelle clé API pour un système externe.
    La clé brute est retournée UNE SEULE FOIS — elle ne sera plus accessible.
    Réservé au greffier.
    """
    permission_classes = [EstGreffier]

    def post(self, request):
        d = request.data
        systeme_code = (d.get('systeme') or '').strip().upper()

        try:
            systeme = SystemeExterne.objects.get(code=systeme_code)
        except SystemeExterne.DoesNotExist:
            return Response({'detail': f'Système {systeme_code!r} introuvable.'}, status=404)

        if not systeme.actif:
            return Response({'detail': f'Système {systeme_code!r} inactif — impossible d\'émettre une clé.'}, status=400)

        date_exp = None
        if d.get('date_expiration'):
            from django.utils.dateparse import parse_datetime, parse_date
            import datetime
            raw = d['date_expiration']
            date_exp = parse_datetime(str(raw)) or (
                datetime.datetime.combine(parse_date(str(raw)), datetime.time.max, tzinfo=timezone.utc)
                if parse_date(str(raw)) else None
            )

        instance, cle_brute = CleAPIExterne.creer_cle(
            systeme=systeme,
            libelle=d.get('libelle', ''),
            scopes=d.get('scopes') or [],
            date_expiration=date_exp,
            created_by=request.user,
        )

        return Response({
            'id':               instance.id,
            'prefixe':          instance.prefixe,
            'systeme':          systeme.code,
            'cle_api':          cle_brute,     # ← affichée UNE SEULE FOIS
            'date_expiration':  date_exp.isoformat() if date_exp else None,
            'scopes':           instance.scopes,
            'avertissement':    (
                'IMPORTANT : conservez cette clé dans un gestionnaire de secrets. '
                'Elle ne sera plus affichée après cette réponse.'
            ),
        }, status=201)


class JournalAppelsView(generics.ListAPIView):
    """
    GET /api/v1/interop/journal/?systeme=ANRPTS&date_debut=2026-01-01
    Journal des appels entrants inter-administrations.
    Réservé au greffier.
    """
    permission_classes  = [EstGreffier]
    filter_backends     = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields     = ['created_at', 'statut_http']
    ordering            = ['-created_at']

    def list(self, request):
        qs = JournalAppelExterne.objects.select_related('systeme', 'cle').all()

        systeme_code = request.query_params.get('systeme', '').strip().upper()
        if systeme_code:
            qs = qs.filter(systeme__code=systeme_code)

        statut_http = request.query_params.get('statut_http', '')
        if statut_http.isdigit():
            qs = qs.filter(statut_http=int(statut_http))

        date_debut = request.query_params.get('date_debut', '')
        date_fin   = request.query_params.get('date_fin', '')
        if date_debut:
            qs = qs.filter(created_at__date__gte=date_debut)
        if date_fin:
            qs = qs.filter(created_at__date__lte=date_fin)

        qs = qs[:500]   # limite 500 entrées max par requête
        data = [
            {
                'id':          e.id,
                'systeme':     e.systeme.code if e.systeme else None,
                'methode':     e.methode,
                'endpoint':    e.endpoint,
                'statut_http': e.statut_http,
                'duree_ms':    e.duree_ms,
                'ip_appelant': e.ip_appelant,
                'erreur':      e.erreur or None,
                'created_at':  e.created_at.isoformat(),
            }
            for e in qs
        ]
        return Response(data)


# ── API consommée par les systèmes externes ────────────────────────────────────

class RCRechercheExterneView(APIView):
    """
    GET /api/v1/rc/recherche/?numero_rc=2026/0001
    GET /api/v1/rc/recherche/?nni=<NNI>
    GET /api/v1/rc/recherche/?denomination=<nom>

    Accès : systèmes externes avec scope 'lecture_rc' ou 'recherche_entite'.
    Retourne les données publiques d'un RC (sans informations confidentielles internes).
    """
    authentication_classes = [ApiKeyAuthentication]
    permission_classes     = [EstSystemeExterneActif]

    def get(self, request):
        p = request.query_params

        # Vérification du scope
        cle = request.auth
        scopes = cle.scopes or (cle.systeme.scopes if cle else [])
        if not any(s in scopes for s in (SCOPE_LECTURE_RC, SCOPE_RECHERCHE_ENTITE)):
            return Response(
                {'detail': f'Scope requis : {SCOPE_LECTURE_RC!r} ou {SCOPE_RECHERCHE_ENTITE!r}.'},
                status=403,
            )

        from apps.registres.models import RegistreAnalytique
        qs = RegistreAnalytique.objects.select_related('ph', 'pm', 'sc', 'localite').filter(
            statut='IMMATRICULE'
        )

        numero_ra = p.get('numero_ra', '').strip()
        nni       = p.get('nni', '').strip()
        denom     = p.get('denomination', '').strip()

        if numero_ra:
            qs = qs.filter(numero_ra=numero_ra)
        elif nni:
            qs = qs.filter(ph__nni=nni)
        elif denom:
            from django.db.models import Q
            qs = qs.filter(
                Q(ph__nom__icontains=denom) |
                Q(pm__denomination__icontains=denom) |
                Q(sc__denomination__icontains=denom)
            )
        else:
            return Response(
                {'detail': 'Fournir au moins un critère : numero_ra, nni, ou denomination.'},
                status=400,
            )

        qs = qs[:20]    # limite résultats

        data = []
        for ra in qs:
            data.append({
                'numero_ra':          ra.numero_ra,
                'type_entite':        ra.type_entite,
                'denomination':       ra.denomination,
                'denomination_ar':    ra.denomination_ar,
                'statut':             ra.statut,
                'date_immatriculation': ra.date_immatriculation.isoformat() if ra.date_immatriculation else None,
                'localite':           ra.localite.libelle_fr if ra.localite else None,
            })

        return Response({'count': len(data), 'results': data})


class RCVerificationExterneView(APIView):
    """
    GET /api/v1/rc/verification/?numero_ra=000001
    Vérifie l'existence et le statut d'un RC.
    Scope requis : 'verification_statut'.
    Utilisé notamment par KHIDMATY pour pré-vérifier avant soumission d'une demande.
    """
    authentication_classes = [ApiKeyAuthentication]
    permission_classes     = [EstSystemeExterneActif]

    def get(self, request):
        numero_ra = request.query_params.get('numero_ra', '').strip()
        if not numero_ra:
            return Response({'detail': 'numero_ra est requis.'}, status=400)

        cle    = request.auth
        scopes = cle.scopes or (cle.systeme.scopes if cle else [])
        if SCOPE_VERIFICATION_STATUT not in scopes:
            return Response({'detail': f'Scope requis : {SCOPE_VERIFICATION_STATUT!r}.'}, status=403)

        from apps.registres.models import RegistreAnalytique
        try:
            ra = RegistreAnalytique.objects.select_related('localite').get(numero_ra=numero_ra)
        except RegistreAnalytique.DoesNotExist:
            return Response({
                'existe':    False,
                'numero_ra': numero_ra,
                'detail':    'Aucun RC trouvé pour ce numéro.',
                'detail_ar': 'لم يتم العثور على سجل لهذا الرقم.',
            }, status=404)

        return Response({
            'existe':               True,
            'numero_ra':            ra.numero_ra,
            'statut':               ra.statut,
            'type_entite':          ra.type_entite,
            'denomination':         ra.denomination,
            'denomination_ar':      ra.denomination_ar,
            'date_immatriculation': ra.date_immatriculation.isoformat() if ra.date_immatriculation else None,
            'est_actif':            ra.statut == 'IMMATRICULE',
        })
