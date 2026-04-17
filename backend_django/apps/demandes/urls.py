from django.urls import path
from .views import DemandeListCreate, DemandeDetail, DemandeActionView, DemandeStatsView

urlpatterns = [
    path('',            DemandeListCreate.as_view(), name='demandes'),
    path('stats/',      DemandeStatsView.as_view(),  name='demandes-stats'),
    path('<int:pk>/',   DemandeDetail.as_view(),     name='demande-detail'),
    path('<int:pk>/soumettre/', DemandeActionView.as_view(), {'action':'soumettre'}),
    path('<int:pk>/valider/',   DemandeActionView.as_view(), {'action':'valider'}),
    path('<int:pk>/rejeter/',   DemandeActionView.as_view(), {'action':'rejeter'}),
    path('<int:pk>/annuler/',   DemandeActionView.as_view(), {'action':'annuler'}),
]
