from django.urls import path
from .views import (
    HistoriqueListCreate, HistoriqueDetail, HistoriqueActionView,
    ImportHistoriqueView,
)

urlpatterns = [
    path('',                              HistoriqueListCreate.as_view()),
    path('<int:pk>/',                     HistoriqueDetail.as_view()),
    path('<int:pk>/soumettre/',           HistoriqueActionView.as_view(), {'action': 'soumettre'}),
    path('<int:pk>/retourner/',           HistoriqueActionView.as_view(), {'action': 'retourner'}),
    path('<int:pk>/valider/',             HistoriqueActionView.as_view(), {'action': 'valider'}),
    path('<int:pk>/rejeter/',             HistoriqueActionView.as_view(), {'action': 'rejeter'}),
    path('<int:pk>/annuler/',             HistoriqueActionView.as_view(), {'action': 'annuler'}),
    path('import/',                       ImportHistoriqueView.as_view()),
]
