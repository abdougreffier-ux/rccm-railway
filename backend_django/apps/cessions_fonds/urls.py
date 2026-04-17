from django.urls import path
from .views import (
    CessionFondsRALookupView,
    CessionFondsListCreate,
    CessionFondsDetail,
    CessionFondsActionView,
)

urlpatterns = [
    path('',                           CessionFondsListCreate.as_view()),
    path('lookup/',                    CessionFondsRALookupView.as_view()),
    path('<int:pk>/',                  CessionFondsDetail.as_view()),
    path('<int:pk>/soumettre/',        CessionFondsActionView.as_view(), {'action': 'soumettre'}),
    path('<int:pk>/retourner/',        CessionFondsActionView.as_view(), {'action': 'retourner'}),
    path('<int:pk>/valider/',          CessionFondsActionView.as_view(), {'action': 'valider'}),
    path('<int:pk>/annuler/',          CessionFondsActionView.as_view(), {'action': 'annuler'}),
    path('<int:pk>/annuler-valide/',   CessionFondsActionView.as_view(), {'action': 'annuler_valide'}),
    path('<int:pk>/modifier-correctif/', CessionFondsActionView.as_view(), {'action': 'modifier_correctif'}),
]
