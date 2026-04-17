from django.urls import path
from .views import RadiationListCreate, RadiationDetail, RadiationActionView, RadiationRALookupView

urlpatterns = [
    path('',           RadiationListCreate.as_view()),
    path('lookup/',    RadiationRALookupView.as_view()),
    path('<int:pk>/',  RadiationDetail.as_view()),
    path('<int:pk>/valider/', RadiationActionView.as_view(), {'action': 'valider'}),
    path('<int:pk>/rejeter/', RadiationActionView.as_view(), {'action': 'rejeter'}),
    path('<int:pk>/annuler/',            RadiationActionView.as_view(), {'action': 'annuler'}),
    path('<int:pk>/annuler-validation/', RadiationActionView.as_view(), {'action': 'annuler_validation'}),
]
