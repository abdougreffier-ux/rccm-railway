from django.utils import timezone
from rest_framework import generics, serializers, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
from django_filters.rest_framework import DjangoFilterBackend
from .models import Radiation
from apps.core.permissions import EstAgentTribunalOuGreffier, EstGreffier, filtrer_par_auteur


# ── Serializer ────────────────────────────────────────────────────────────────

class RadiationSerializer(serializers.ModelSerializer):
    ra_numero        = serializers.CharField(source='ra.numero_ra',     read_only=True)
    ra_denomination  = serializers.SerializerMethodField()
    ra_numero_rc     = serializers.CharField(source='ra.numero_rc',     read_only=True)
    motif_label      = serializers.CharField(source='get_motif_display', read_only=True)
    created_by_nom   = serializers.SerializerMethodField()
    validated_by_nom = serializers.SerializerMethodField()
    documents_count  = serializers.SerializerMethodField()

    class Meta:
        model  = Radiation
        fields = [
            'id', 'uuid', 'numero_radia',
            'ra', 'ra_numero', 'ra_denomination', 'ra_numero_rc',
            'chrono', 'demande',
            'date_radiation', 'motif', 'motif_label', 'description', 'demandeur',
            'statut', 'langue_acte',
            'created_at', 'updated_at', 'validated_at',
            'created_by', 'created_by_nom',
            'validated_by', 'validated_by_nom',
            'documents_count',
        ]
        read_only_fields = ['uuid', 'numero_radia', 'created_at', 'updated_at', 'date_radiation']

    def get_ra_denomination(self, obj):
        return obj.ra.denomination if obj.ra else ''

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.prenom} {obj.created_by.nom}".strip() or obj.created_by.login
        return ''

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return f"{obj.validated_by.prenom} {obj.validated_by.nom}".strip() or obj.validated_by.login
        return ''

    def get_documents_count(self, obj):
        try:
            return obj.documents.count()
        except Exception:
            return 0


# ── RA Lookup ─────────────────────────────────────────────────────────────────

class RadiationRALookupView(APIView):
    """GET /radiations/lookup/?numero_ra=RA000013 — returns RA data for radiation form.
    Agents tribunal + greffier (CDC §3.2)."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request):
        numero_ra = request.query_params.get('numero_ra', '').strip()
        if not numero_ra:
            return Response({'detail': 'numero_ra requis.'}, status=http_status.HTTP_400_BAD_REQUEST)
        try:
            from apps.registres.models import RegistreAnalytique
            ra = RegistreAnalytique.objects.select_related('ph', 'pm', 'sc', 'localite').get(numero_ra=numero_ra)
        except RegistreAnalytique.DoesNotExist:
            return Response({'detail': f'Aucun dossier trouvé pour {numero_ra}.'}, status=http_status.HTTP_404_NOT_FOUND)

        if ra.statut == 'RADIE':
            return Response({'detail': 'Ce dossier est déjà radié.'}, status=http_status.HTTP_400_BAD_REQUEST)

        # ── Vérification bénéficiaire effectif ───────────────────────────────
        # L'obligation BE ne s'applique qu'aux PM (et SC).
        # Les personnes physiques (PH) en sont exclues par principe juridique.
        if ra.type_entite != 'PH' and ra.statut_be != 'DECLARE':
            return Response(
                {'detail': "Opération impossible : le bénéficiaire effectif n'a pas été déclaré "
                           "conformément aux exigences légales."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        # Check if there is already a pending radiation
        pending = Radiation.objects.filter(ra=ra, statut='EN_COURS').exists()
        if pending:
            return Response({'detail': 'Une demande de radiation est déjà en cours pour ce dossier.'}, status=http_status.HTTP_400_BAD_REQUEST)

        return Response({
            'id':           ra.id,
            'numero_ra':    ra.numero_ra,
            'numero_rc':    ra.numero_rc,
            'denomination': ra.denomination,
            'type_entite':  ra.type_entite,
            'statut':       ra.statut,
            'date_immatriculation': str(ra.date_immatriculation) if ra.date_immatriculation else '',
        })


# ── List / Create ─────────────────────────────────────────────────────────────

class RadiationListCreate(generics.ListCreateAPIView):
    """CDC §3.2 : radiation — agents tribunal + greffier, cloisonnement par created_by."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = RadiationSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['statut', 'ra']
    ordering         = ['-created_at']

    def get_queryset(self):
        qs = Radiation.objects.select_related('ra', 'created_by', 'validated_by').all()
        return filtrer_par_auteur(qs, self.request.user)

    def perform_create(self, serializer):
        from apps.demandes.views import _next_numero
        obj = serializer.save(numero_radia=_next_numero('RAD'), created_by=self.request.user)
        from apps.registres.models import ActionHistorique
        ActionHistorique.objects.create(
            ra=obj.ra, action='CREATION_RADIATION',
            reference_operation=obj.numero_radia,
            etat_avant={'ra_statut': obj.ra.statut},
            etat_apres={'radiation_statut': 'EN_COURS', 'motif': obj.motif, 'date_radiation': str(obj.date_radiation)},
            commentaire=f'Création de la demande de radiation {obj.numero_radia}.',
            created_by=self.request.user,
        )


class RadiationDetail(generics.RetrieveUpdateAPIView):
    """CDC §3.2 : agents voient uniquement leurs dossiers."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = RadiationSerializer

    def get_queryset(self):
        qs = Radiation.objects.select_related('ra', 'created_by', 'validated_by').all()
        return filtrer_par_auteur(qs, self.request.user)


# ── Actions ───────────────────────────────────────────────────────────────────

class RadiationActionView(APIView):
    """CDC §6 : workflow radiations.
    Actions greffier : valider, retourner, annuler."""
    permission_classes = [EstAgentTribunalOuGreffier]

    ACTIONS_GREFFIER = {'valider', 'retourner', 'annuler'}

    def patch(self, request, pk, action):
        if action in self.ACTIONS_GREFFIER:
            if not EstGreffier().has_permission(request, self):
                return Response({'detail': 'Action réservée au greffier.'}, status=403)
        obj = generics.get_object_or_404(Radiation, pk=pk)

        if action == 'annuler':
            if obj.statut != 'EN_COURS':
                return Response({'detail': 'Seule une radiation en cours peut être annulée.'}, status=http_status.HTTP_400_BAD_REQUEST)
            obj.statut = 'ANNULEE'
            obj.save(update_fields=['statut', 'updated_at'])
            return Response({'message': 'Radiation annulée.', 'statut': obj.statut})

        if action == 'annuler_validation':
            # Greffier annuls an already-validated radiation (no time limit, requires motif + pièce jointe)
            if obj.statut != 'VALIDEE':
                return Response({'detail': 'Seule une radiation validée peut être annulée par le greffier.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            motif = request.data.get('motif', '').strip()
            if not motif:
                return Response({'detail': 'Un motif est obligatoire pour annuler une radiation.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            if not obj.documents.exists():
                return Response(
                    {'detail': 'Une pièce justificative doit être jointe avant d\'annuler la radiation.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            # Restore RA to IMMATRICULE
            ra = obj.ra
            ra.statut          = 'IMMATRICULE'
            ra.date_radiation  = None
            ra.motif_radiation = ''
            ra.save(update_fields=['statut', 'date_radiation', 'motif_radiation'])
            obj.statut = 'ANNULEE'
            obj.save(update_fields=['statut', 'updated_at'])
            # Log to ActionHistorique
            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=ra, action='ANNULATION_RADIATION',
                reference_operation=obj.numero_radia,
                etat_avant={'ra_statut': 'RADIE', 'radiation_statut': 'VALIDEE'},
                etat_apres={'ra_statut': 'IMMATRICULE', 'radiation_statut': 'ANNULEE', 'motif_annulation': motif},
                commentaire=f'Annulation de la radiation {obj.numero_radia}. Motif : {motif}',
                created_by=request.user,
            )
            return Response({'message': 'Radiation annulée. Dossier réactivé (IMMATRICULE).', 'statut': obj.statut})

        if action in ('valider', 'rejeter'):
            if obj.statut != 'EN_COURS':
                return Response({'detail': 'Cette radiation ne peut plus être traitée.'}, status=http_status.HTTP_400_BAD_REQUEST)

            if action == 'valider':
                # Pièce jointe obligatoire
                if not obj.documents.exists():
                    return Response(
                        {'detail': 'Une pièce justificative est obligatoire pour valider la radiation.'},
                        status=http_status.HTTP_400_BAD_REQUEST,
                    )
                obj.statut       = 'VALIDEE'
                obj.validated_at = timezone.now()
                obj.validated_by = request.user
                obj.save(update_fields=['statut', 'validated_at', 'validated_by'])
                # Mettre à jour le statut du RA
                ra = obj.ra
                ra.statut          = 'RADIE'
                ra.date_radiation  = obj.date_radiation
                ra.motif_radiation = obj.get_motif_display()
                ra.save(update_fields=['statut', 'date_radiation', 'motif_radiation'])
                from apps.registres.models import ActionHistorique
                ActionHistorique.objects.create(
                    ra=ra, action='VALIDATION_RADIATION',
                    reference_operation=obj.numero_radia,
                    etat_avant={'ra_statut': 'IMMATRICULE'},
                    etat_apres={'ra_statut': 'RADIE', 'date_radiation': str(obj.date_radiation), 'motif': obj.get_motif_display()},
                    commentaire=f'Validation de la radiation {obj.numero_radia}. Dossier radié.',
                    created_by=request.user,
                )
                return Response({'message': 'Radiation validée. Dossier radié.', 'statut': obj.statut})

            else:  # rejeter
                obj.statut       = 'REJETEE'
                obj.validated_at = timezone.now()
                obj.validated_by = request.user
                obj.save(update_fields=['statut', 'validated_at', 'validated_by'])
                from apps.registres.models import ActionHistorique
                ActionHistorique.objects.create(
                    ra=obj.ra, action='REJET_RADIATION',
                    reference_operation=obj.numero_radia,
                    etat_avant={'statut': 'EN_COURS'},
                    etat_apres={'statut': 'REJETEE'},
                    commentaire=f'Rejet de la radiation {obj.numero_radia}.',
                    created_by=request.user,
                )
                return Response({'message': 'Radiation rejetée.', 'statut': obj.statut})

        return Response({'detail': 'Action inconnue.'}, status=http_status.HTTP_400_BAD_REQUEST)
