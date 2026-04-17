from django.utils import timezone
from django.db.models import Count
from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Demande, LigneDemande
from .serializers import DemandeListSerializer, DemandeDetailSerializer, LigneDemandeSerializer
from apps.core.permissions import EstAgentOuGreffier, EstGreffier, filtrer_par_auteur


def _next_numero(prefix='DMD'):
    from django.db import connection
    year = timezone.now().year
    with connection.cursor() as c:
        c.execute("""
            INSERT INTO sequences_numerotation (code, prefixe, annee, dernier_num, nb_chiffres)
            VALUES (%s, %s, %s, 1, 6)
            ON CONFLICT (code) DO UPDATE
            SET dernier_num = CASE
                WHEN sequences_numerotation.annee != EXCLUDED.annee
                THEN 1
                ELSE sequences_numerotation.dernier_num + 1
            END,
            annee = EXCLUDED.annee,
            updated_at = NOW()
            RETURNING prefixe, annee, dernier_num, nb_chiffres
        """, [prefix, prefix, year])
        row = c.fetchone()
    return f"{row[0]}{row[1]}{str(row[2]).zfill(row[3])}"


class DemandeListCreate(generics.ListCreateAPIView):
    """CDC §3 : tout le personnel peut créer/consulter des demandes (cloisonnement par created_by)."""
    permission_classes = [EstAgentOuGreffier]
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['statut','type_entite','canal','type_demande']
    search_fields    = ['numero_dmd','ph__nom','pm__denomination','sc__denomination']
    ordering         = ['-created_at']

    def get_queryset(self):
        qs = Demande.objects.select_related('type_demande','ph','pm','sc','created_by').all()
        return filtrer_par_auteur(qs, self.request.user)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DemandeDetailSerializer
        return DemandeListSerializer

    def perform_create(self, serializer):
        serializer.save(
            numero_dmd=_next_numero('DMD'),
            created_by=self.request.user
        )


class DemandeDetail(generics.RetrieveUpdateDestroyAPIView):
    """CDC §3 : agents voient uniquement leurs dossiers."""
    permission_classes = [EstAgentOuGreffier]
    serializer_class = DemandeDetailSerializer

    def get_queryset(self):
        qs = Demande.objects.prefetch_related('lignes__type_doc').select_related('type_demande','ra').all()
        return filtrer_par_auteur(qs, self.request.user)


class DemandeActionView(APIView):
    """CDC §6 : workflow des demandes.
    Actions réservées au greffier : valider, rejeter, annuler.
    Action agent : soumettre.
    """
    permission_classes = [EstAgentOuGreffier]

    ACTIONS_GREFFIER = {'valider', 'rejeter', 'annuler'}
    TRANSITIONS = {
        'soumettre': ('SAISIE',         'SOUMISE'),
        'valider':   ('EN_TRAITEMENT',  'VALIDEE'),
        'rejeter':   (None,             'REJETEE'),
        'annuler':   (None,             'ANNULEE'),
    }

    def patch(self, request, pk, action):
        if action in self.ACTIONS_GREFFIER:
            if not EstGreffier().has_permission(request, self):
                return Response({'detail': 'Action réservée au greffier.'}, status=403)

        demande = generics.get_object_or_404(Demande, pk=pk)
        valid_from, new_statut = self.TRANSITIONS[action]

        if valid_from and demande.statut != valid_from:
            return Response({'detail': f'Impossible depuis l\'état {demande.statut}.'}, status=400)

        demande.statut = new_statut
        if action == 'soumettre':
            demande.submitted_at = timezone.now()
        elif action == 'valider':
            demande.validated_at = timezone.now()
            demande.validated_by = request.user
        elif action == 'rejeter':
            demande.motif_rejet = request.data.get('motif_rejet', '')

        demande.save()
        return Response({'message': f'Demande {new_statut.lower()}.', 'statut': new_statut})


class DemandeStatsView(APIView):
    """Statistiques des demandes — réservées au greffier (CDC §3.2)."""
    permission_classes = [EstGreffier]

    def get(self, request):
        stats = Demande.objects.values('statut').annotate(total=Count('id'))
        return Response({'data': list(stats)})
