from django.urls import path
from .views import (
    RegistreAnalytiqueListCreate, RegistreAnalytiqueDetail,
    ValiderRAView, EnvoyerRAView, RetournerRAView, HistoriqueRAView,
    RegistreChronologiqueListCreate, RegistreChronologiqueDetail,
    ValiderRChronoView, EnvoyerRChronoView, RetournerRChronoView, RectifierRChronoView,
    EnregistrementInitialView, JournalAuditView, DeclarerBEView, CheckDoublonView,
    DeclarantSearchView,
)

urlpatterns = [
    # ── Registre Analytique ───────────────────────────────────────────────────
    path('analytique/',                         RegistreAnalytiqueListCreate.as_view()),
    path('analytique/<int:pk>/',                RegistreAnalytiqueDetail.as_view()),
    path('analytique/<int:pk>/valider/',        ValiderRAView.as_view()),
    path('analytique/<int:pk>/envoyer/',        EnvoyerRAView.as_view()),
    path('analytique/<int:pk>/retourner/',      RetournerRAView.as_view()),
    path('analytique/<int:pk>/historique/',     HistoriqueRAView.as_view()),
    path('analytique/<int:pk>/declarer-be/',    DeclarerBEView.as_view()),

    # ── Registre Chronologique ────────────────────────────────────────────────
    path('chronologique/',                      RegistreChronologiqueListCreate.as_view()),
    path('chronologique/<int:pk>/',             RegistreChronologiqueDetail.as_view()),
    path('chronologique/<int:pk>/valider/',     ValiderRChronoView.as_view()),
    path('chronologique/<int:pk>/envoyer/',     EnvoyerRChronoView.as_view()),
    path('chronologique/<int:pk>/retourner/',   RetournerRChronoView.as_view()),
    path('chronologique/<int:pk>/rectifier/',   RectifierRChronoView.as_view()),

    # ── Enregistrement initial (RC + RA atomique) ─────────────────────────────
    path('enregistrement-initial/',             EnregistrementInitialView.as_view()),

    # ── Recherche de déclarants (auto-complétion) ─────────────────────────────
    path('declarants/',                         DeclarantSearchView.as_view()),

    # ── Vérification doublon temps réel ───────────────────────────────────────
    path('check-doublon/',                      CheckDoublonView.as_view()),

    # ── Journal d'audit global ────────────────────────────────────────────────
    path('journal/',                            JournalAuditView.as_view()),
]
