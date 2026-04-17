from django.db import connection
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import (
    Nationalite, FormeJuridique, DomaineActivite, Fonction,
    TypeDocument, TypeDemande, Localite, Tarif, Signataire,
)
from .serializers import (
    NationaliteSerializer, FormeJuridiqueSerializer, DomaineActiviteSerializer,
    FonctionSerializer, TypeDocumentSerializer, TypeDemandeSerializer,
    LocaliteSerializer, TarifSerializer, SignataireSerializer,
)
from apps.core.permissions import LectureAgentModifGreffier, EstGreffier


# ── Nationalités ──────────────────────────────────────────────────────────────
class NationaliteListCreate(generics.ListCreateAPIView):
    """Lecture : tout le personnel. Écriture : greffier (CDC §3.2)."""
    permission_classes = [LectureAgentModifGreffier]
    queryset         = Nationalite.objects.filter(actif=True)
    serializer_class = NationaliteSerializer

class NationaliteDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = Nationalite.objects.all()
    serializer_class = NationaliteSerializer


# ── Formes juridiques ─────────────────────────────────────────────────────────
class FormeJuridiqueListCreate(generics.ListCreateAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = FormeJuridique.objects.filter(actif=True)
    serializer_class = FormeJuridiqueSerializer

class FormeJuridiqueDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = FormeJuridique.objects.all()
    serializer_class = FormeJuridiqueSerializer


# ── Domaines d'activité ───────────────────────────────────────────────────────
class DomaineActiviteListCreate(generics.ListCreateAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = DomaineActivite.objects.filter(actif=True)
    serializer_class = DomaineActiviteSerializer

class DomaineActiviteDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = DomaineActivite.objects.all()
    serializer_class = DomaineActiviteSerializer


# ── Fonctions ─────────────────────────────────────────────────────────────────
class FonctionListCreate(generics.ListCreateAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = Fonction.objects.filter(actif=True)
    serializer_class = FonctionSerializer

class FonctionDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = Fonction.objects.all()
    serializer_class = FonctionSerializer


# ── Types de documents ────────────────────────────────────────────────────────
class TypeDocumentListCreate(generics.ListCreateAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = TypeDocument.objects.filter(actif=True)
    serializer_class = TypeDocumentSerializer

class TypeDocumentDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = TypeDocument.objects.all()
    serializer_class = TypeDocumentSerializer


# ── Types de demandes ─────────────────────────────────────────────────────────
class TypeDemandeListCreate(generics.ListCreateAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = TypeDemande.objects.filter(actif=True)
    serializer_class = TypeDemandeSerializer

class TypeDemandeDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = TypeDemande.objects.all()
    serializer_class = TypeDemandeSerializer


# ── Localités ─────────────────────────────────────────────────────────────────
class LocaliteListCreate(generics.ListCreateAPIView):
    permission_classes = [LectureAgentModifGreffier]
    serializer_class = LocaliteSerializer

    def get_queryset(self):
        qs = Localite.objects.filter(actif=True)
        type_loc = self.request.query_params.get('type')
        if type_loc:
            qs = qs.filter(type=type_loc)
        return qs

class LocaliteDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [LectureAgentModifGreffier]
    queryset         = Localite.objects.all()
    serializer_class = LocaliteSerializer


# ── Tarifs — administration pure, greffier uniquement ─────────────────────────
class TarifListCreate(generics.ListCreateAPIView):
    """CDC §3.3 : administration des tarifs réservée au greffier."""
    permission_classes = [EstGreffier]
    queryset         = Tarif.objects.filter(actif=True)
    serializer_class = TarifSerializer

class TarifDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [EstGreffier]
    queryset         = Tarif.objects.all()
    serializer_class = TarifSerializer


# ── Signataires — administration pure, greffier uniquement ───────────────────
class SignataireListCreate(generics.ListCreateAPIView):
    """CDC §3.3 : administration des signataires réservée au greffier."""
    permission_classes = [EstGreffier]
    queryset         = Signataire.objects.all()
    serializer_class = SignataireSerializer

class SignataireDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [EstGreffier]
    queryset         = Signataire.objects.all()
    serializer_class = SignataireSerializer


# ── Numérotation (accès direct à sequences_numerotation) ─────────────────────

class NumerotationListView(APIView):
    """Liste toutes les séquences de numérotation. Réservé au greffier (CDC §3.3)."""
    permission_classes = [EstGreffier]

    def get(self, request):
        with connection.cursor() as c:
            c.execute("""
                SELECT code, prefixe, annee, dernier_num, nb_chiffres, updated_at
                FROM sequences_numerotation
                ORDER BY code
            """)
            rows = c.fetchall()
        labels = {
            'RA':  'N° Analytique (impair, continu)',
            'RC':  'N° Chronologique (annuel)',
            'DMD': 'N° Demande (annuel)',
            'DEP': 'N° Dépôt (annuel)',
            'MOD': 'N° Modification (annuel)',
            'RAD': 'N° Radiation (annuel)',
            'CES': 'N° Cession (annuel)',
        }
        data = [
            {
                'code':        r[0],
                'libelle':     labels.get(r[0], r[0]),
                'prefixe':     r[1],
                'annee':       r[2],
                'dernier_num': r[3],
                'nb_chiffres': r[4],
                'updated_at':  r[5],
            }
            for r in rows
        ]
        return Response(data)


class NumerotationUpdateView(APIView):
    """
    Modifie manuellement le compteur d'une séquence.
    PUT /parametrage/numerotation/<code>/
    Body : { "dernier_num": <int> }
    Réservé au greffier (CDC §3.3).
    """
    permission_classes = [EstGreffier]

    def put(self, request, code):
        dernier_num = request.data.get('dernier_num')
        if dernier_num is None:
            return Response({'detail': 'Le champ dernier_num est requis.'}, status=400)
        try:
            dernier_num = int(dernier_num)
        except (ValueError, TypeError):
            return Response({'detail': 'dernier_num doit être un entier.'}, status=400)

        # Pour RA : le numéro doit être impair
        if code == 'RA' and dernier_num % 2 == 0:
            return Response({'detail': 'Le N° Analytique doit être impair (1, 3, 5…).'}, status=400)

        with connection.cursor() as c:
            c.execute("""
                UPDATE sequences_numerotation
                SET dernier_num = %s, updated_at = NOW()
                WHERE code = %s
            """, [dernier_num, code])
            updated = c.rowcount

        if updated == 0:
            return Response({'detail': f'Code « {code} » introuvable.'}, status=404)

        return Response({'message': f'Numérotation « {code} » mise à jour → {dernier_num}.'})
