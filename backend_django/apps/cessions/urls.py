from django.urls import path
from .views import (
    CessionListCreate, CessionDetail,
    CessionActionView, CessionRALookupView,
)

urlpatterns = [
    path('',             CessionListCreate.as_view()),
    path('lookup/',      CessionRALookupView.as_view()),
    path('<int:pk>/',    CessionDetail.as_view()),
    path('<int:pk>/soumettre/', CessionActionView.as_view(), {'action': 'soumettre'}),
    path('<int:pk>/retourner/', CessionActionView.as_view(), {'action': 'retourner'}),
    path('<int:pk>/valider/',   CessionActionView.as_view(), {'action': 'valider'}),
    path('<int:pk>/annuler/',            CessionActionView.as_view(), {'action': 'annuler'}),
    path('<int:pk>/annuler-valide/',     CessionActionView.as_view(), {'action': 'annuler_valide'}),
    path('<int:pk>/modifier-correctif/', CessionActionView.as_view(), {'action': 'modifier_correctif'}),
]
