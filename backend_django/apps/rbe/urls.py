from django.urls import path
from .views import (
    EntiteJuridiqueListCreate,
    EntiteJuridiqueDetail,
    RegistreBEListCreate,
    RegistreBEDetail,
    EnvoyerRBEView,
    ValiderRBEView,
    RetournerRBEView,
    RadierRBEView,
    ModifierRBEView,
    HistoriqueRBEView,
    BeneficiaireListCreate,
    BeneficiaireDetail,
    RBESearchView,
    RBEReportingView,
)

urlpatterns = [
    # ── Entités juridiques ────────────────────────────────────────────────────
    path('entites/',                        EntiteJuridiqueListCreate.as_view()),
    path('entites/<int:pk>/',               EntiteJuridiqueDetail.as_view()),

    # ── Déclarations RBE ──────────────────────────────────────────────────────
    path('',                                RegistreBEListCreate.as_view()),
    path('recherche/',                      RBESearchView.as_view()),
    path('reporting/',                      RBEReportingView.as_view()),
    path('<int:pk>/',                       RegistreBEDetail.as_view()),
    path('<int:pk>/envoyer/',               EnvoyerRBEView.as_view()),
    path('<int:pk>/valider/',               ValiderRBEView.as_view()),
    path('<int:pk>/retourner/',             RetournerRBEView.as_view()),
    path('<int:pk>/radier/',                RadierRBEView.as_view()),
    path('<int:pk>/modifier/',              ModifierRBEView.as_view()),
    path('<int:pk>/historique/',            HistoriqueRBEView.as_view()),

    # ── Bénéficiaires effectifs ───────────────────────────────────────────────
    path('<int:pk>/beneficiaires/',         BeneficiaireListCreate.as_view()),
    path('<int:pk>/beneficiaires/<int:bid>/', BeneficiaireDetail.as_view()),
]
