from datetime import timedelta

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import EstAgentOuGreffier, EstGreffier, est_greffier
from .models import DemandeAutorisation
from .serializers import (
    DemandeAutorisationSerializer,
    DemandeAutorisationCreateSerializer,
    DecisionSerializer,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _appliquer_correction_ra(dossier_id, decideur):
    """
    Passe un RA de IMMATRICULE ou EN_INSTANCE_VALIDATION → RETOURNE et synchronise ses RC.
    Couvre deux cas :
      - Dossier validé (IMMATRICULE) : correction post-immatriculation.
      - Dossier transmis (EN_INSTANCE_VALIDATION) : agent a besoin de récupérer son dossier.
    """
    from apps.registres.models import RegistreAnalytique, RegistreChronologique
    from apps.registres.models import ActionHistorique

    try:
        ra = RegistreAnalytique.objects.get(pk=dossier_id)
    except RegistreAnalytique.DoesNotExist:
        return False, "Dossier RA introuvable."

    STATUTS_ACCEPTES = ('IMMATRICULE', 'EN_INSTANCE_VALIDATION', 'EN_COURS')
    if ra.statut not in STATUTS_ACCEPTES:
        return False, (
            f"Le dossier RA est dans l'état « {ra.statut} » — "
            f"statut IMMATRICULE ou EN_INSTANCE_VALIDATION requis."
        )

    commentaire = "Retour pour correction autorisé par le greffier."
    ra.statut = 'RETOURNE'
    ra.save(update_fields=['statut', 'updated_at'])

    ActionHistorique.objects.create(
        ra=ra,
        action='RETOUR',
        created_by=decideur,
        commentaire=commentaire,
    )

    # Synchroniser les RC associés
    STATUTS_RC = ('BROUILLON', 'EN_INSTANCE', 'VALIDE', 'RETOURNE')
    for rc in RegistreChronologique.objects.filter(ra=ra, statut__in=STATUTS_RC):
        obs = (rc.observations + '\n' + commentaire).strip() if rc.observations else commentaire
        rc.statut = 'RETOURNE'
        rc.observations = obs
        rc.save(update_fields=['statut', 'observations', 'updated_at'])

    return True, None


def _appliquer_correction_historique(dossier_id, decideur):
    """
    Passe une ImmatriculationHistorique de VALIDE ou EN_INSTANCE → RETOURNE.
    Couvre deux cas :
      - Dossier validé (VALIDE) : correction post-validation.
      - Dossier transmis (EN_INSTANCE) : agent récupère le dossier avant décision greffier.
    """
    from apps.historique.models import ImmatriculationHistorique

    try:
        ih = ImmatriculationHistorique.objects.get(pk=dossier_id)
    except ImmatriculationHistorique.DoesNotExist:
        return False, "Dossier historique introuvable."

    if ih.statut not in ('VALIDE', 'EN_INSTANCE'):
        return False, (
            f"Le dossier historique est dans l'état « {ih.statut} » — "
            f"statut VALIDE ou EN_INSTANCE requis."
        )

    ih.statut = 'RETOURNE'
    ih.observations = "Retour pour correction autorisé par le greffier."
    ih.save(update_fields=['statut', 'observations', 'updated_at'])

    return True, None


# ─────────────────────────────────────────────────────────────────────────────
# Vues
# ─────────────────────────────────────────────────────────────────────────────

class DemandeAutorisationListCreate(APIView):
    """
    GET  — Greffier : toutes les demandes EN_ATTENTE (file de traitement).
           Agent    : ses propres demandes (toutes, pour afficher l'état).
    POST — Agents uniquement : créer une nouvelle demande.
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request):
        qs = DemandeAutorisation.objects.select_related('demandeur', 'decideur')
        if est_greffier(request.user):
            # Greffier voit toutes les demandes — filtrables par statut (EN_ATTENTE par défaut)
            statut_filtre = request.query_params.get('statut', 'EN_ATTENTE')
            if statut_filtre:
                qs = qs.filter(statut=statut_filtre)
        else:
            # Agent voit uniquement ses propres demandes
            qs = qs.filter(demandeur=request.user)
            # Filtrage optionnel par statut (utilisé par MesAutorisations)
            statut_filtre = request.query_params.get('statut')
            if statut_filtre:
                qs = qs.filter(statut=statut_filtre)

        # Filtres communs (type_dossier / dossier_id) — disponibles pour les deux rôles
        # Utilisés notamment par DetailRChrono (greffier) pour afficher les demandes d'un RA précis
        type_dossier = request.query_params.get('type_dossier')
        dossier_id   = request.query_params.get('dossier_id')
        if type_dossier:
            qs = qs.filter(type_dossier=type_dossier)
        if dossier_id:
            qs = qs.filter(dossier_id=dossier_id)

        return Response(DemandeAutorisationSerializer(qs, many=True).data)

    def post(self, request):
        if est_greffier(request.user):
            return Response(
                {'detail': 'Le greffier ne crée pas de demandes d\'autorisation.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        ser = DemandeAutorisationCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        demande = ser.save(demandeur=request.user)
        return Response(
            DemandeAutorisationSerializer(demande).data,
            status=status.HTTP_201_CREATED,
        )


class DemandeAutorisationDetail(APIView):
    """GET — détail d'une demande (accessible à son auteur ou au greffier)."""
    permission_classes = [EstAgentOuGreffier]

    def get(self, request, pk):
        try:
            demande = DemandeAutorisation.objects.select_related(
                'demandeur', 'decideur'
            ).get(pk=pk)
        except DemandeAutorisation.DoesNotExist:
            return Response({'detail': 'Demande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if not est_greffier(request.user) and demande.demandeur != request.user:
            return Response({'detail': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        return Response(DemandeAutorisationSerializer(demande).data)


class AutoriserView(APIView):
    """
    POST /autorisations/<pk>/autoriser/
    Greffier uniquement.
    - IMPRESSION : accorde l'accès pendant EXPIRATION_IMPRESSION_MINUTES minutes.
    - CORRECTION : passe le dossier de IMMATRICULE → RETOURNE.
    """
    permission_classes = [EstGreffier]

    def post(self, request, pk):
        try:
            demande = DemandeAutorisation.objects.get(pk=pk)
        except DemandeAutorisation.DoesNotExist:
            return Response({'detail': 'Demande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if demande.statut != 'EN_ATTENTE':
            return Response(
                {'detail': f'Cette demande est déjà dans l\'état « {demande.statut} ».'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = DecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        motif_decision = ser.validated_data.get('motif_decision', '')

        now = timezone.now()
        demande.statut        = 'AUTORISEE'
        demande.decideur      = request.user
        demande.date_decision = now
        demande.motif_decision = motif_decision

        if demande.type_demande == 'IMPRESSION':
            demande.date_expiration = now + timedelta(
                minutes=DemandeAutorisation.EXPIRATION_IMPRESSION_MINUTES
            )
            demande.save()
            return Response(
                DemandeAutorisationSerializer(demande).data,
                status=status.HTTP_200_OK,
            )

        elif demande.type_demande == 'CORRECTION':
            if demande.type_dossier == 'RA':
                ok, err = _appliquer_correction_ra(demande.dossier_id, request.user)
            elif demande.type_dossier == 'HISTORIQUE':
                ok, err = _appliquer_correction_historique(demande.dossier_id, request.user)
            else:
                return Response(
                    {'detail': f'Type de dossier « {demande.type_dossier} » non pris en charge.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not ok:
                return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

            demande.save()
            return Response(
                DemandeAutorisationSerializer(demande).data,
                status=status.HTTP_200_OK,
            )

        return Response(
            {'detail': f'Type de demande « {demande.type_demande} » non reconnu.'},
            status=status.HTTP_400_BAD_REQUEST,
        )


class RefuserView(APIView):
    """
    POST /autorisations/<pk>/refuser/
    Greffier uniquement.
    """
    permission_classes = [EstGreffier]

    def post(self, request, pk):
        try:
            demande = DemandeAutorisation.objects.get(pk=pk)
        except DemandeAutorisation.DoesNotExist:
            return Response({'detail': 'Demande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if demande.statut != 'EN_ATTENTE':
            return Response(
                {'detail': f'Cette demande est déjà dans l\'état « {demande.statut} ».'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = DecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        demande.statut         = 'REFUSEE'
        demande.decideur       = request.user
        demande.date_decision  = timezone.now()
        demande.motif_decision = ser.validated_data.get('motif_decision', '')
        demande.save()

        return Response(
            DemandeAutorisationSerializer(demande).data,
            status=status.HTTP_200_OK,
        )


class VerifierAutorisationView(APIView):
    """
    GET /autorisations/verifier/?type_demande=IMPRESSION&type_dossier=RA&dossier_id=123
    Vérifie si l'agent connecté possède une autorisation IMPRESSION valide (non expirée)
    pour le dossier demandé.
    Retourne : { autorisee: bool, minutes_restantes: int|null, demande_id: int|null }
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request):
        type_demande = request.query_params.get('type_demande', 'IMPRESSION')
        type_dossier = request.query_params.get('type_dossier')
        dossier_id   = request.query_params.get('dossier_id')

        if not type_dossier or not dossier_id:
            return Response(
                {'detail': 'Paramètres type_dossier et dossier_id requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        # Chercher la demande AUTORISEE la plus récente, non expirée
        demande = DemandeAutorisation.objects.filter(
            demandeur=request.user,
            type_demande=type_demande,
            type_dossier=type_dossier,
            dossier_id=dossier_id,
            statut='AUTORISEE',
        ).order_by('-date_decision').first()

        if not demande:
            return Response({'autorisee': False, 'minutes_restantes': None, 'demande_id': None})

        # Pour IMPRESSION : vérifier l'expiration
        if type_demande == 'IMPRESSION':
            if demande.date_expiration and now > demande.date_expiration:
                return Response({'autorisee': False, 'minutes_restantes': 0, 'demande_id': demande.id})
            mins = int((demande.date_expiration - now).total_seconds() / 60) if demande.date_expiration else None
            return Response({'autorisee': True, 'minutes_restantes': max(mins, 0) if mins is not None else None, 'demande_id': demande.id})

        # Pour CORRECTION : pas d'expiration
        return Response({'autorisee': True, 'minutes_restantes': None, 'demande_id': demande.id})
