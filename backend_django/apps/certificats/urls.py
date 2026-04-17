from django.urls import path
from .views import (
    CertificatListCreateView, CertificatDetailView,
    CertificatPDFView, CertificatSearchEntiteView,
)

urlpatterns = [
    path('',                  CertificatListCreateView.as_view(),   name='certificat-list'),
    path('search-entite/',    CertificatSearchEntiteView.as_view(), name='certificat-search-entite'),
    path('<int:pk>/',         CertificatDetailView.as_view(),       name='certificat-detail'),
    path('<int:pk>/pdf/',     CertificatPDFView.as_view(),          name='certificat-pdf'),
]
