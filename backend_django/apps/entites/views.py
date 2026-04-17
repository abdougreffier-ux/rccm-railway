from rest_framework import generics, filters
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import PersonnePhysique, PersonneMorale, Succursale
from .serializers import PersonnePhysiqueSerializer, PersonneMoraleSerializer, SuccursaleSerializer
from apps.registres.models import Associe, Gerant
from apps.registres.serializers import AssocieSerializer, GerantSerializer
from apps.core.permissions import EstAgentTribunalOuGreffier


# ── Personne Physique ──────────────────────────────────────────────────────────

class PersonnePhysiqueListCreate(generics.ListCreateAPIView):
    """Agents tribunal + greffier (CDC §3.2)."""
    permission_classes = [EstAgentTribunalOuGreffier]
    queryset = PersonnePhysique.objects.select_related('nationalite','localite').all()
    serializer_class = PersonnePhysiqueSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields    = ['nom', 'prenom', 'nni']
    ordering_fields  = ['nom', 'prenom', 'created_at']
    ordering         = ['nom']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class PersonnePhysiqueDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [EstAgentTribunalOuGreffier]
    queryset = PersonnePhysique.objects.select_related('nationalite','localite').all()
    serializer_class = PersonnePhysiqueSerializer

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.registres.exists():
            return Response({'detail': 'Impossible de supprimer: liée à un registre.'}, status=400)
        return super().destroy(request, *args, **kwargs)


# ── Personne Morale ───────────────────────────────────────────────────────────

class PersonneMoraleListCreate(generics.ListCreateAPIView):
    permission_classes = [EstAgentTribunalOuGreffier]
    queryset = PersonneMorale.objects.select_related('forme_juridique','localite').all()
    serializer_class = PersonneMoraleSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields    = ['denomination', 'sigle']
    filterset_fields = ['forme_juridique']
    ordering_fields  = ['denomination', 'created_at']
    ordering         = ['denomination']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class PersonneMoraleDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [EstAgentTribunalOuGreffier]
    queryset = PersonneMorale.objects.select_related('forme_juridique','localite').all()
    serializer_class = PersonneMoraleSerializer

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.registres.exists():
            return Response({'detail': 'Impossible de supprimer: liée à un registre.'}, status=400)
        return super().destroy(request, *args, **kwargs)


class PMAssociesView(generics.ListAPIView):
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = AssocieSerializer

    def get_queryset(self):
        return Associe.objects.filter(ra__pm_id=self.kwargs['pk'], actif=True).select_related('ph','pm','nationalite','fonction')


class PMGerantsView(generics.ListAPIView):
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = GerantSerializer

    def get_queryset(self):
        return Gerant.objects.filter(ra__pm_id=self.kwargs['pk'], actif=True).select_related('ph','pm','fonction','nationalite')


# ── Succursale ────────────────────────────────────────────────────────────────

class SuccursaleListCreate(generics.ListCreateAPIView):
    permission_classes = [EstAgentTribunalOuGreffier]
    queryset = Succursale.objects.select_related('pm_mere','localite').all()
    serializer_class = SuccursaleSerializer
    filter_backends  = [filters.SearchFilter, filters.OrderingFilter]
    search_fields    = ['denomination']
    ordering         = ['denomination']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class SuccursaleDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [EstAgentTribunalOuGreffier]
    queryset = Succursale.objects.select_related('pm_mere','localite').all()
    serializer_class = SuccursaleSerializer
