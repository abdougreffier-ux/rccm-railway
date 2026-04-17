from django.urls import path
from .views import *

urlpatterns = [
    path('nationalites/',            NationaliteListCreate.as_view()),
    path('nationalites/<int:pk>/',   NationaliteDetail.as_view()),

    path('formes-juridiques/',           FormeJuridiqueListCreate.as_view()),
    path('formes-juridiques/<int:pk>/',  FormeJuridiqueDetail.as_view()),

    path('domaines-activites/',            DomaineActiviteListCreate.as_view()),
    path('domaines-activites/<int:pk>/',   DomaineActiviteDetail.as_view()),

    path('fonctions/',           FonctionListCreate.as_view()),
    path('fonctions/<int:pk>/',  FonctionDetail.as_view()),

    path('types-documents/',           TypeDocumentListCreate.as_view()),
    path('types-documents/<int:pk>/',  TypeDocumentDetail.as_view()),

    path('types-demandes/',            TypeDemandeListCreate.as_view()),
    path('types-demandes/<int:pk>/',   TypeDemandeDetail.as_view()),

    path('localites/',           LocaliteListCreate.as_view()),
    path('localites/<int:pk>/',  LocaliteDetail.as_view()),

    path('tarifs/',           TarifListCreate.as_view()),
    path('tarifs/<int:pk>/',  TarifDetail.as_view()),

    # Signataires
    path('signataires/',           SignataireListCreate.as_view()),
    path('signataires/<int:pk>/',  SignataireDetail.as_view()),

    # Numérotation (accès direct aux séquences)
    path('numerotation/',             NumerotationListView.as_view()),
    path('numerotation/<str:code>/',  NumerotationUpdateView.as_view()),
]
