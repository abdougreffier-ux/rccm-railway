from django.urls import path
from .views import (
    ModificationListCreate, ModificationDetail,
    ModificationActionView, ModificationRALookupView,
    ModificationRADataView,
)

urlpatterns = [
    path('',                        ModificationListCreate.as_view()),
    path('lookup/',                 ModificationRALookupView.as_view()),
    path('<int:pk>/',               ModificationDetail.as_view()),
    path('<int:pk>/ra-data/',       ModificationRADataView.as_view()),
    path('<int:pk>/soumettre/', ModificationActionView.as_view(), {'action': 'soumettre'}),
    path('<int:pk>/retourner/', ModificationActionView.as_view(), {'action': 'retourner'}),
    path('<int:pk>/valider/',   ModificationActionView.as_view(), {'action': 'valider'}),
    path('<int:pk>/annuler/',            ModificationActionView.as_view(), {'action': 'annuler'}),
    path('<int:pk>/annuler-valide/',     ModificationActionView.as_view(), {'action': 'annuler_valide'}),
    path('<int:pk>/modifier-correctif/', ModificationActionView.as_view(), {'action': 'modifier_correctif'}),
]
