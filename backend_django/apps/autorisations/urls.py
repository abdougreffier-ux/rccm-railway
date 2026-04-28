from django.urls import path
from .views import (
    DemandeAutorisationListCreate,
    DemandeAutorisationDetail,
    AutoriserView,
    RefuserView,
    VerifierAutorisationView,
    RechercherRCView,
)

urlpatterns = [
    path('',                    DemandeAutorisationListCreate.as_view()),
    path('verifier/',           VerifierAutorisationView.as_view()),
    # Lookup RC par (numero_chrono + annee) — utilisé avant la création d'une demande
    path('rechercher-rc/',      RechercherRCView.as_view()),
    path('<int:pk>/',           DemandeAutorisationDetail.as_view()),
    path('<int:pk>/autoriser/', AutoriserView.as_view()),
    path('<int:pk>/refuser/',   RefuserView.as_view()),
]
