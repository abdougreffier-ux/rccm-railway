from django.urls import path
from .views import (
    RechercheGlobaleView, RechercheParNNIView, RechercheParNumRCView,
    CertificatNegatifView, RechercheAvanceeView,
)

urlpatterns = [
    path('',                        RechercheGlobaleView.as_view()),
    path('avancee/',                RechercheAvanceeView.as_view()),
    path('nni/<str:nni>/',          RechercheParNNIView.as_view()),
    path('rc/<str:numero_rc>/',     RechercheParNumRCView.as_view()),
    path('certificat-negatif/',     CertificatNegatifView.as_view()),
]
