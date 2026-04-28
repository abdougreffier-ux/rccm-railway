from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Count

from .models import RegistreBE, BeneficiaireEffectif, ActionHistoriqueRBE, EntiteJuridique
from .serializers import (
    RegistreBEListSerializer,
    RegistreBEDetailSerializer,
    BeneficiaireEffectifSerializer,
    ActionHistoriqueRBESerializer,
    EntiteJuridiqueSerializer,
)
from apps.core.permissions import EstAgentTribunalOuGreffier, EstGreffier, filtrer_par_auteur


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log(rbe, action, user, commentaire='', ancien_etat=None, nouvel_etat=None):
    ActionHistoriqueRBE.objects.create(
        rbe=rbe,
        action=action,
        commentaire=commentaire,
        ancien_etat=ancien_etat,
        nouvel_etat=nouvel_etat,
        created_by=user,
    )


# ── EntiteJuridique ───────────────────────────────────────────────────────────

class EntiteJuridiqueListCreate(generics.ListCreateAPIView):
    """
    GET  /api/rbe/entites/          – list (filterable by source_entite, type_entite, search)
    POST /api/rbe/entites/          – create a new legal entity (hors-RC)
    Agents tribunal + greffier (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = EntiteJuridiqueSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['source_entite', 'type_entite', 'autorite_enregistrement']
    search_fields    = ['denomination', 'denomination_ar', 'numero_rc', 'numero_enregistrement']
    ordering_fields  = ['created_at', 'denomination']
    ordering         = ['-created_at']

    def get_queryset(self):
        qs = EntiteJuridique.objects.select_related('ra', 'created_by').all()
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(denomination__icontains=q) |
                Q(denomination_ar__icontains=q) |
                Q(numero_rc__icontains=q) |
                Q(numero_enregistrement__icontains=q)
            ).distinct()
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class EntiteJuridiqueDetail(generics.RetrieveUpdateAPIView):
    """
    GET   /api/rbe/entites/<pk>/   – detail
    PATCH /api/rbe/entites/<pk>/   – update
    Agents tribunal + greffier (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    queryset          = EntiteJuridique.objects.select_related('ra', 'created_by')
    serializer_class  = EntiteJuridiqueSerializer
    http_method_names = ['get', 'patch', 'head', 'options']


# ── RegistreBE ────────────────────────────────────────────────────────────────

class RegistreBEListCreate(generics.ListCreateAPIView):
    """
    GET  /api/rbe/          – list (with filters & search)
    POST /api/rbe/          – create new declaration
    Query params:
      source_entite   RC | HORS_RC
      statut          BROUILLON | EN_ATTENTE | VALIDE | RETOURNE | MODIFIE | RADIE
      type_entite
      type_declaration
      mode_declaration
      en_retard       1  → date_limite < today & statut != VALIDE
    Agents tribunal + greffier (CDC §3.2), cloisonnement par created_by.
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['statut', 'type_declaration', 'type_entite', 'mode_declaration']
    search_fields    = ['numero_rbe', 'denomination_entite', 'declarant_nom', 'declarant_prenom']
    ordering_fields  = ['created_at', 'date_declaration', 'numero_rbe', 'date_limite']
    ordering         = ['-created_at']

    def get_queryset(self):
        params = self.request.query_params
        qs = RegistreBE.objects.select_related(
            'ra', 'localite', 'entite'
        ).all()

        # source_entite filter (RC / HORS_RC) via entite or direct ra
        source = params.get('source_entite')
        if source == 'RC':
            qs = qs.filter(Q(entite__source_entite='RC') | Q(ra__isnull=False, entite__isnull=True))
        elif source == 'HORS_RC':
            qs = qs.filter(entite__source_entite='HORS_RC')

        # overdue filter
        if params.get('en_retard') == '1':
            today = timezone.now().date()
            qs = qs.filter(
                date_limite__lt=today,
                mode_declaration='DIFFEREE',
            ).exclude(statut='VALIDE')

        # Free text search
        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(numero_rbe__icontains=q) |
                Q(denomination_entite__icontains=q) |
                Q(declarant_nom__icontains=q) |
                Q(declarant_prenom__icontains=q) |
                Q(beneficiaires__nom__icontains=q) |
                Q(beneficiaires__prenom__icontains=q)
            ).distinct()
        return filtrer_par_auteur(qs, self.request.user)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return RegistreBEDetailSerializer
        return RegistreBEListSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        rbe = serializer.save(created_by=self.request.user)
        _log(rbe, 'CREATION', self.request.user, 'Création de la déclaration RBE')


class RegistreBEDetail(generics.RetrieveUpdateAPIView):
    """
    GET   /api/rbe/<pk>/   – detail
    PATCH /api/rbe/<pk>/   – partial update (brouillon/retourné seulement)
    Agents tribunal + greffier (CDC §3.2).
    CDC §3 : cloisonnement par created_by — un agent ne voit que ses propres dossiers RBE.
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class  = RegistreBEDetailSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        """Cloisonnement : agents ne voient que leurs propres dossiers RBE."""
        qs = RegistreBE.objects.select_related(
            'ra', 'localite', 'entite', 'created_by', 'validated_by'
        ).prefetch_related('beneficiaires', 'historique')
        return filtrer_par_auteur(qs, self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        rbe = self.get_object()
        ancien = RegistreBEDetailSerializer(rbe).data
        serializer.save()
        _log(rbe, 'MODIFICATION', self.request.user,
             'Modification de la déclaration',
             ancien_etat=dict(ancien))


# ── Workflow ──────────────────────────────────────────────────────────────────

class EnvoyerRBEView(APIView):
    """
    PATCH /api/rbe/<pk>/envoyer/
    Transition: BROUILLON | RETOURNE → EN_ATTENTE
    Action agent (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]

    @transaction.atomic
    def patch(self, request, pk):
        rbe = get_object_or_404(RegistreBE, pk=pk)
        if rbe.statut not in ('BROUILLON', 'RETOURNE'):
            return Response(
                {'detail': f"Impossible d'envoyer une déclaration en statut « {rbe.get_statut_display()} »."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rbe.statut = 'EN_ATTENTE'
        rbe.save(update_fields=['statut', 'updated_at'])
        _log(rbe, 'ENVOI', request.user,
             request.data.get('commentaire', 'Déclaration envoyée pour validation'))
        return Response(RegistreBEDetailSerializer(rbe).data)


class ValiderRBEView(APIView):
    """
    PATCH /api/rbe/<pk>/valider/
    Transition: EN_ATTENTE → VALIDE
    Also updates the linked RA statut_be = DECLARE if source is RC.
    Réservé au greffier (CDC §3.3).
    """
    permission_classes = [EstGreffier]

    @transaction.atomic
    def patch(self, request, pk):
        rbe = get_object_or_404(RegistreBE, pk=pk)
        if rbe.statut != 'EN_ATTENTE':
            return Response(
                {'detail': f"Impossible de valider une déclaration en statut « {rbe.get_statut_display()} »."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        rbe.statut       = 'VALIDE'
        rbe.validated_by = request.user
        rbe.validated_at = now
        rbe.save(update_fields=['statut', 'validated_by', 'validated_at', 'updated_at'])

        # Sync RA statut_be if declaration is linked to a RegistreAnalytique
        ra = rbe.ra or (rbe.entite.ra if rbe.entite else None)
        if ra and ra.statut_be != 'DECLARE':
            ra.statut_be           = 'DECLARE'
            ra.date_declaration_be = now
            ra.save(update_fields=['statut_be', 'date_declaration_be'])

        _log(rbe, 'VALIDATION', request.user,
             request.data.get('commentaire', 'Déclaration validée'))
        return Response(RegistreBEDetailSerializer(rbe).data)


class RetournerRBEView(APIView):
    """
    PATCH /api/rbe/<pk>/retourner/
    Transition: EN_ATTENTE → RETOURNE
    Body: { "observations_greffier": "...", "commentaire": "..." }
    Réservé au greffier (CDC §3.3).
    """
    permission_classes = [EstGreffier]

    @transaction.atomic
    def patch(self, request, pk):
        rbe = get_object_or_404(RegistreBE, pk=pk)
        if rbe.statut != 'EN_ATTENTE':
            return Response(
                {'detail': f"Impossible de retourner une déclaration en statut « {rbe.get_statut_display()} »."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obs = request.data.get('observations_greffier', '')
        if obs:
            rbe.observations_greffier = obs
        rbe.statut = 'RETOURNE'
        rbe.save(update_fields=['statut', 'observations_greffier', 'updated_at'])
        _log(rbe, 'RETOUR', request.user,
             request.data.get('commentaire', 'Retournée pour correction'))
        return Response(RegistreBEDetailSerializer(rbe).data)


class ModifierRBEView(APIView):
    """
    POST /api/rbe/<pk>/modifier/
    Crée une nouvelle déclaration MODIFICATION liée à la déclaration d'origine.
    Agents tribunal + greffier (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]

    @transaction.atomic
    def post(self, request, pk):
        original = get_object_or_404(RegistreBE, pk=pk)
        if original.statut not in ('VALIDE', 'MODIFIE'):
            return Response(
                {'detail': "Seule une déclaration validée peut faire l'objet d'une modification."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        nouvelle = RegistreBE.objects.create(
            type_entite            = original.type_entite,
            ra                     = original.ra,
            entite                 = original.entite,
            mode_declaration       = original.mode_declaration,
            denomination_entite    = original.denomination_entite,
            denomination_entite_ar = original.denomination_entite_ar,
            type_declaration       = 'MODIFICATION',
            statut                 = 'BROUILLON',
            declaration_initiale   = original,
            declarant_nom          = original.declarant_nom,
            declarant_prenom       = original.declarant_prenom,
            declarant_nom_ar       = original.declarant_nom_ar,
            declarant_qualite      = original.declarant_qualite,
            declarant_qualite_ar   = original.declarant_qualite_ar,
            declarant_adresse      = original.declarant_adresse,
            declarant_telephone    = original.declarant_telephone,
            declarant_email        = original.declarant_email,
            localite               = original.localite,
            motif                  = request.data.get('motif', ''),
            created_by             = request.user,
        )
        # Marquer l'original comme modifié
        original.statut = 'MODIFIE'
        original.save(update_fields=['statut', 'updated_at'])

        _log(nouvelle, 'CREATION', request.user,
             f'Modification de la déclaration {original.numero_rbe}')
        _log(original, 'MODIFICATION', request.user,
             f'Déclaration de modification créée : {nouvelle.numero_rbe}')

        return Response(RegistreBEDetailSerializer(nouvelle).data, status=status.HTTP_201_CREATED)


class RadierRBEView(APIView):
    """
    POST /api/rbe/<pk>/radier/
    Body: { "motif": "...", "commentaire": "...", "creer_nouvelle": true }
    Agents tribunal + greffier (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]

    @transaction.atomic
    def post(self, request, pk):
        original = get_object_or_404(RegistreBE, pk=pk)
        if original.statut not in ('VALIDE', 'MODIFIE'):
            return Response(
                {'detail': "Seule une déclaration validée peut être radiée."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        creer_nouvelle = request.data.get('creer_nouvelle', False)
        motif          = request.data.get('motif', '')
        commentaire    = request.data.get('commentaire', 'Déclaration radiée')

        if creer_nouvelle or motif:
            radiation = RegistreBE.objects.create(
                type_entite            = original.type_entite,
                ra                     = original.ra,
                entite                 = original.entite,
                mode_declaration       = original.mode_declaration,
                denomination_entite    = original.denomination_entite,
                denomination_entite_ar = original.denomination_entite_ar,
                type_declaration       = 'RADIATION',
                statut                 = 'BROUILLON',
                declaration_initiale   = original,
                declarant_nom          = original.declarant_nom,
                declarant_prenom       = original.declarant_prenom,
                declarant_nom_ar       = original.declarant_nom_ar,
                declarant_qualite      = original.declarant_qualite,
                declarant_qualite_ar   = original.declarant_qualite_ar,
                declarant_adresse      = original.declarant_adresse,
                declarant_telephone    = original.declarant_telephone,
                declarant_email        = original.declarant_email,
                localite               = original.localite,
                motif                  = motif,
                created_by             = request.user,
            )
            _log(radiation, 'CREATION', request.user,
                 f'Déclaration de radiation pour {original.numero_rbe}')
            return Response(RegistreBEDetailSerializer(radiation).data, status=status.HTTP_201_CREATED)
        else:
            original.statut = 'RADIE'
            original.motif  = motif
            original.save(update_fields=['statut', 'motif', 'updated_at'])
            _log(original, 'RADIATION', request.user, commentaire)
            return Response(RegistreBEDetailSerializer(original).data)


class HistoriqueRBEView(generics.ListAPIView):
    """
    GET /api/rbe/<pk>/historique/
    Agents tribunal + greffier (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = ActionHistoriqueRBESerializer

    def get_queryset(self):
        rbe = get_object_or_404(RegistreBE, pk=self.kwargs['pk'])
        return ActionHistoriqueRBE.objects.filter(rbe=rbe).select_related('created_by')


# ── Bénéficiaires effectifs ────────────────────────────────────────────────────

class BeneficiaireListCreate(generics.ListCreateAPIView):
    """
    GET  /api/rbe/<pk>/beneficiaires/
    POST /api/rbe/<pk>/beneficiaires/
    Agents tribunal + greffier (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = BeneficiaireEffectifSerializer

    def get_queryset(self):
        rbe = get_object_or_404(RegistreBE, pk=self.kwargs['pk'])
        return BeneficiaireEffectif.objects.filter(rbe=rbe).select_related('nationalite').prefetch_related('natures_controle')

    @transaction.atomic
    def perform_create(self, serializer):
        rbe = get_object_or_404(RegistreBE, pk=self.kwargs['pk'])
        serializer.save(rbe=rbe)
        _log(rbe, 'MODIFICATION', self.request.user, "Ajout d'un bénéficiaire effectif")


class BeneficiaireDetail(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/rbe/<pk>/beneficiaires/<bid>/
    PATCH  /api/rbe/<pk>/beneficiaires/<bid>/
    DELETE /api/rbe/<pk>/beneficiaires/<bid>/
    Agents tribunal + greffier (CDC §3.2).
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class  = BeneficiaireEffectifSerializer
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']

    def get_object(self):
        return get_object_or_404(
            BeneficiaireEffectif,
            pk=self.kwargs['bid'],
            rbe_id=self.kwargs['pk'],
        )

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()
        rbe = get_object_or_404(RegistreBE, pk=self.kwargs['pk'])
        _log(rbe, 'MODIFICATION', self.request.user, "Modification d'un bénéficiaire effectif")

    @transaction.atomic
    def perform_destroy(self, instance):
        rbe = instance.rbe
        instance.delete()
        _log(rbe, 'MODIFICATION', self.request.user, "Suppression d'un bénéficiaire effectif")


# ── Recherche avancée ─────────────────────────────────────────────────────────

class RBESearchView(generics.ListAPIView):
    """
    GET /api/rbe/recherche/
    Params: q, statut, type_entite, type_declaration, source_entite,
            date_debut, date_fin, declarant, en_retard
    Réservé au greffier (CDC §4.2 — recherche).
    """
    permission_classes = [EstGreffier]
    serializer_class = RegistreBEListSerializer
    filter_backends  = [filters.OrderingFilter]
    ordering         = ['-created_at']

    def get_queryset(self):
        params = self.request.query_params
        qs     = RegistreBE.objects.select_related('ra', 'localite', 'entite').all()

        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(numero_rbe__icontains=q) |
                Q(denomination_entite__icontains=q) |
                Q(declarant_nom__icontains=q) |
                Q(declarant_prenom__icontains=q) |
                Q(beneficiaires__nom__icontains=q) |
                Q(beneficiaires__prenom__icontains=q) |
                Q(beneficiaires__numero_document__icontains=q)
            ).distinct()

        if params.get('statut'):
            qs = qs.filter(statut=params['statut'])
        if params.get('type_entite'):
            qs = qs.filter(type_entite=params['type_entite'])
        if params.get('type_declaration'):
            qs = qs.filter(type_declaration=params['type_declaration'])
        if params.get('source_entite') == 'RC':
            qs = qs.filter(Q(entite__source_entite='RC') | Q(ra__isnull=False, entite__isnull=True))
        elif params.get('source_entite') == 'HORS_RC':
            qs = qs.filter(entite__source_entite='HORS_RC')
        if params.get('date_debut'):
            qs = qs.filter(date_declaration__gte=params['date_debut'])
        if params.get('date_fin'):
            qs = qs.filter(date_declaration__lte=params['date_fin'])
        if params.get('declarant'):
            d = params['declarant']
            qs = qs.filter(
                Q(declarant_nom__icontains=d) | Q(declarant_prenom__icontains=d)
            )
        if params.get('en_retard') == '1':
            today = timezone.now().date()
            qs = qs.filter(
                date_limite__lt=today,
                mode_declaration='DIFFEREE',
            ).exclude(statut='VALIDE')

        return qs


# ── Reporting RBE ─────────────────────────────────────────────────────────────

class RBEReportingView(APIView):
    """
    GET /api/rbe/reporting/
    Returns statistics about RBE declarations:
    - total, declared, pending, overdue, non-RC, by entity type, by status
    Réservé au greffier (CDC §3.2/§3.3 — statistiques).
    """
    permission_classes = [EstGreffier]

    def get(self, request):
        today = timezone.now().date()
        base  = RegistreBE.objects.all()

        total     = base.count()
        valide    = base.filter(statut='VALIDE').count()
        en_attente = base.filter(statut='EN_ATTENTE').count()
        brouillon = base.filter(statut='BROUILLON').count()
        retourne  = base.filter(statut='RETOURNE').count()
        modifie   = base.filter(statut='MODIFIE').count()
        radie     = base.filter(statut='RADIE').count()

        # Overdue: DIFFEREE + date_limite passed + not validated
        en_retard = base.filter(
            mode_declaration='DIFFEREE',
            date_limite__lt=today,
        ).exclude(statut='VALIDE').count()

        # RC vs hors-RC
        rc_count     = base.filter(
            Q(entite__source_entite='RC') | Q(ra__isnull=False, entite__isnull=True)
        ).count()
        hors_rc_count = base.filter(entite__source_entite='HORS_RC').count()

        # By entity type
        by_type = list(
            base.values('type_entite').annotate(count=Count('id')).order_by('type_entite')
        )

        # By type_declaration
        by_declaration = list(
            base.values('type_declaration').annotate(count=Count('id')).order_by('type_declaration')
        )

        # Entités hors-RC registered but with no declaration
        hors_rc_sans_declaration = EntiteJuridique.objects.filter(
            source_entite='HORS_RC',
            declarations__isnull=True,
        ).count()

        return Response({
            'total':                     total,
            'par_statut': {
                'VALIDE':      valide,
                'EN_ATTENTE':  en_attente,
                'BROUILLON':   brouillon,
                'RETOURNE':    retourne,
                'MODIFIE':     modifie,
                'RADIE':       radie,
            },
            'en_retard':                 en_retard,
            'source': {
                'rc':      rc_count,
                'hors_rc': hors_rc_count,
            },
            'par_type_entite':           by_type,
            'par_type_declaration':      by_declaration,
            'hors_rc_sans_declaration':  hors_rc_sans_declaration,
        })
